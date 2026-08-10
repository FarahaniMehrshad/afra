import type { LlmChunk, LlmHealth, LlmVerdict } from '@/types/llm';
import { isLlmCategory } from '@/types/llm';
import type { RenderedPrompt } from './llm.prompt';

/**
 * Transport for the LLM pass. Talks only to this app's own origin — the
 * OpenAI-compatible endpoint and its key live behind `/api/llm`, never here.
 */

const API = '/api/llm';

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export async function fetchLlmHealth(): Promise<LlmHealth> {
  const res = await fetch(API + '/health', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new LlmError('LLM proxy is not reachable (' + res.status + ')');
  return (await res.json()) as LlmHealth;
}

export interface ChunkResult {
  verdicts: LlmVerdict[];
  /** Verbatim assistant content, kept for the debug panel. */
  raw: string;
  usage: unknown;
}

export async function analyzeChunk(
  chunk: LlmChunk,
  prompt: RenderedPrompt,
  signal: AbortSignal,
): Promise<ChunkResult> {
  const res = await fetch(API + '/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system: prompt.system, user: prompt.user }),
    signal,
  });

  const body = (await res.json().catch(() => null)) as
    | { content?: string; usage?: unknown; error?: string }
    | null;

  if (!res.ok) {
    throw new LlmError(body?.error ?? 'LLM request failed (' + res.status + ')');
  }

  const raw = body?.content ?? '';
  return { verdicts: parseVerdicts(raw, chunk), raw, usage: body?.usage ?? null };
}

/**
 * Models drift from the requested shape — fences, a bare array, an extra
 * wrapper key. Recover what we can and drop rows we cannot trust rather than
 * failing the whole batch.
 */
export function parseVerdicts(raw: string, chunk: LlmChunk): LlmVerdict[] {
  const parsed = parseLoose(raw);
  if (!parsed) throw new LlmError('Model did not return JSON: ' + raw.slice(0, 300));

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: unknown[] }).results)
      : null;
  if (!rows) {
    throw new LlmError('Model reply has no `results` array: ' + raw.slice(0, 300));
  }

  const known = new Set(chunk.entries.map((e) => e.path));
  const out: LlmVerdict[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const path = typeof r.path === 'string' ? r.path : null;
    // A path we never sent means the model invented one; there is nothing in
    // the merged view to attach it to.
    if (path === null || !known.has(path)) continue;

    const confidence = Number(r.confidence);
    out.push({
      variant: chunk.variant,
      path,
      category: isLlmCategory(r.category) ? r.category : 'unknown',
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      reason: typeof r.reason === 'string' ? r.reason.trim() : '',
    });
  }

  return out;
}

function parseLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the outermost brace/bracket pair, which survives a model
    // that wrapped its JSON in a sentence.
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
