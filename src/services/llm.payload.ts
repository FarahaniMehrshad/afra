import type { BuildResult, IRNode, IRVal } from '@/types/ir';
import type { JourneyBundle, Variant } from '@/types/journey';
import type {
  LlmChunk,
  LlmEvent,
  LlmPathEntry,
  LlmPayload,
  LlmStepContext,
} from '@/types/llm';
import { flatten, fmt } from './ir.service';

/**
 * Turns a finished build into the exact set of facts the model is asked to
 * reason about: every path that actually changed, what it changed from and to,
 * and which UI operation was being performed at the time.
 *
 * Pure and deterministic — the debug panel renders the same objects that get
 * sent, so what you inspect is what leaves the browser.
 */

/** Long values cost tokens without adding signal past the first line or so. */
const MAX_VALUE_CHARS = 120;

export interface PayloadOptions {
  /** Mirrors the "mute noise" toggle: drop ID/timestamp churn from the run. */
  hideNoise: boolean;
}

export function buildLlmPayload(
  bundle: JourneyBundle,
  builds: Partial<Record<Variant, BuildResult | null>>,
  opts: PayloadOptions,
): LlmPayload {
  const steps: LlmStepContext[] = bundle.steps.map((s) => ({
    step: s.ordinal,
    label: s.label,
    operation: s.operation,
  }));

  const variants: LlmPayload['variants'] = [];
  for (const variant of ['wpf', 'exe'] as const) {
    const build = builds[variant];
    if (!build) continue;
    variants.push({
      variant,
      file: build.docs.find((d) => d.file)?.file ?? null,
      entries: entriesFor(bundle, build, opts),
    });
  }

  return { folder: bundle.name, steps, variants };
}

function entriesFor(
  bundle: JourneyBundle,
  build: BuildResult,
  opts: PayloadOptions,
): LlmPathEntry[] {
  const values = mergedValues(build.merged);
  const out: LlmPathEntry[] = [];

  let skippedAllNoise = 0;
  const skippedNoiseSamples: string[] = [];
  for (const [path, evs] of build.hist) {
    const kept = opts.hideNoise ? evs.filter((e) => !e.noise) : evs;
    if (!kept.length) {
      skippedAllNoise++;
      if (skippedNoiseSamples.length < 8) skippedNoiseSamples.push(path);
      continue;
    }

    const events: LlmEvent[] = kept.map((e) => {
      const step = bundle.steps[e.i];
      return {
        step: step?.ordinal ?? e.i + 1,
        label: step?.label ?? 'step ' + (e.i + 1),
        operation: step?.operation ?? '',
        kind: e.st,
        from: clip(e.from),
        to: clip(e.to),
      };
    });

    out.push({
      path,
      value: clip(values.get(path) ?? null),
      noise: evs.every((e) => e.noise),
      events,
    });
  }
  // #region agent log
  fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53c723'},body:JSON.stringify({sessionId:'53c723',runId:'pre-fix',hypothesisId:'A',location:'llm.payload.ts:entriesFor',message:'payload path selection',data:{hideNoise:opts.hideNoise,histSize:build.hist.size,sent:out.length,skippedAllNoise,skippedNoiseSamples},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // Sorted so sibling keys land in the same batch — neighbouring paths are the
  // context that lets the model spot "this one is derived from that one".
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/** Leaf values of the merged IR, keyed by the same paths `hist` uses. */
function mergedValues(merged: IRNode | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!merged) return out;
  for (const [path, node] of flatten(merged, '', new Map())) {
    if (node.t === 'val') out.set(path, fmt((node as IRVal).v));
  }
  return out;
}

function clip(v: string | null): string | null {
  if (v === null) return null;
  return v.length > MAX_VALUE_CHARS ? v.slice(0, MAX_VALUE_CHARS) + '…' : v;
}

export function countPaths(payload: LlmPayload): number {
  return payload.variants.reduce((n, v) => n + v.entries.length, 0);
}

/**
 * Split into per-request batches. Batches never straddle a variant, so a
 * single reply is always about one configuration.
 */
export function chunkPayload(payload: LlmPayload, maxPaths: number): LlmChunk[] {
  const size = Math.max(1, maxPaths);
  const chunks: LlmChunk[] = [];

  for (const v of payload.variants) {
    const total = Math.max(1, Math.ceil(v.entries.length / size));
    for (let i = 0; i < v.entries.length; i += size) {
      const index = Math.floor(i / size) + 1;
      chunks.push({
        id: v.variant + '-' + index,
        variant: v.variant,
        index,
        ofVariant: total,
        folder: payload.folder,
        steps: payload.steps,
        entries: v.entries.slice(i, i + size),
      });
    }
  }

  return chunks;
}
