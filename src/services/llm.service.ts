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
  /** Server-issued id so client and server logs can be correlated. */
  requestId: string | null;
  finishReason: string | null;
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
    | {
        content?: string;
        usage?: unknown;
        error?: string;
        requestId?: string;
        finishReason?: string | null;
      }
    | null;

  if (!res.ok) {
    throw new LlmError(body?.error ?? 'LLM request failed (' + res.status + ')');
  }

  const raw = body?.content ?? '';
  const requestId = body?.requestId ?? null;
  const finishReason = body?.finishReason ?? null;

  // Parse verdicts and, in the same call, capture a coverage report so we can
  // send it to the server-side log after we know the outcome.
  const coverage: ParseCoverage = { requestId, finishReason };
  const verdicts = parseVerdicts(raw, chunk, coverage);
  postParseLog(coverage, chunk, raw, body?.usage ?? null).catch(() => {});

  return {
    verdicts,
    raw,
    usage: body?.usage ?? null,
    requestId,
    finishReason,
  };
}

/**
 * Populated by `parseVerdicts` as a side channel so `analyzeChunk` can log the
 * coverage report without re-computing it.
 */
interface ParseCoverage {
  requestId: string | null;
  finishReason: string | null;
  parsed?: boolean;
  parsedShape?: 'array' | 'results-array' | 'unknown';
  droppedUnknownPath?: number;
  droppedBadRow?: number;
  inventedSamples?: string[];
  returnedCount?: number;
  missingCount?: number;
  missingSamples?: string[];
  parseError?: string;
}

async function postParseLog(
  coverage: ParseCoverage,
  chunk: LlmChunk,
  raw: string,
  usage: unknown,
): Promise<void> {
  // Best-effort — logging must never break analysis. Server writes to disk
  // only when LLM_LOG_DIR is set; otherwise responds 204 and this is a no-op.
  await fetch(API + '/log-parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      // Spread first so the explicit fields below win on collision.
      ...coverage,
      chunkId: (chunk as { id?: string }).id ?? null,
      variant: chunk.variant,
      sent: chunk.entries.length,
      sentSamples: chunk.entries.slice(0, 8).map((e) => e.path),
      rawLength: raw.length,
      usage,
    }),
  });
}

/**
 * Models drift from the requested shape — fences, a bare array, an extra
 * wrapper key. Recover what we can and drop rows we cannot trust rather than
 * failing the whole batch.
 *
 * `coverage` is an optional mutable receipt so the caller can log what came
 * out of the model without re-doing the work here.
 */
export function parseVerdicts(
  raw: string,
  chunk: LlmChunk,
  coverage?: ParseCoverage,
): LlmVerdict[] {
  const parsed = parseLoose(raw);
  if (!parsed) {
    if (coverage) {
      coverage.parsed = false;
      coverage.parseError = 'not-json';
    }
    throw new LlmError('Model did not return JSON: ' + raw.slice(0, 300));
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: unknown[] }).results)
      : null;
  if (!rows) {
    if (coverage) {
      coverage.parsed = true;
      coverage.parsedShape = 'unknown';
      coverage.parseError = 'no-results-array';
    }
    throw new LlmError('Model reply has no `results` array: ' + raw.slice(0, 300));
  }

  if (coverage) {
    coverage.parsed = true;
    coverage.parsedShape = Array.isArray(parsed) ? 'array' : 'results-array';
  }

  const known = new Set(chunk.entries.map((e) => e.path));
  const out: LlmVerdict[] = [];
  let droppedUnknownPath = 0;
  let droppedBadRow = 0;
  const returned = new Set<string>();
  const inventedSamples: string[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      droppedBadRow++;
      continue;
    }
    const r = row as Record<string, unknown>;
    const path = typeof r.path === 'string' ? r.path : null;
    // A path we never sent means the model invented one; there is nothing in
    // the merged view to attach it to.
    if (path === null || !known.has(path)) {
      droppedUnknownPath++;
      if (path && inventedSamples.length < 5) inventedSamples.push(path);
      continue;
    }

    const confidence = Number(r.confidence);
    returned.add(path);
    out.push({
      variant: chunk.variant,
      path,
      category: isLlmCategory(r.category) ? r.category : 'unknown',
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      reason: typeof r.reason === 'string' ? r.reason.trim() : '',
    });
  }

  const missing = chunk.entries.map((e) => e.path).filter((p) => !returned.has(p));
  // Models routinely skip rows. Leaving those paths blank looks like "never
  // analysed"; fill them with `unknown` so every path we asked about gets a
  // badge the user can inspect.
  for (const path of missing) {
    out.push({
      variant: chunk.variant,
      path,
      category: 'unknown',
      confidence: 0,
      reason: 'Model reply omitted this path.',
    });
  }

  if (coverage) {
    coverage.returnedCount = returned.size;
    coverage.missingCount = missing.length;
    coverage.missingSamples = missing.slice(0, 16);
    coverage.droppedUnknownPath = droppedUnknownPath;
    coverage.droppedBadRow = droppedBadRow;
    coverage.inventedSamples = inventedSamples;
  }

  // #region agent log
  fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53c723'},body:JSON.stringify({sessionId:'53c723',runId:'post-fix',hypothesisId:'C',location:'llm.service.ts:parseVerdicts',message:'chunk parse coverage',data:{chunkId:chunk.id,variant:chunk.variant,sent:chunk.entries.length,returnedFromModel:returned.size,filledUnknown:missing.length,outTotal:out.length,missingSamples:missing.slice(0,8),droppedUnknownPath,droppedBadRow,inventedSamples,rawLen:raw.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
