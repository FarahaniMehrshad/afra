import type {
  BuildResult,
  HistoryEvent,
  HistoryMap,
  IRNode,
  IRVal,
  MergedLine,
} from '@/types/ir';
import type { JourneyBundle, JourneyStep, Variant } from '@/types/journey';
import {
  emitLines,
  flatten,
  fmt,
  mergeIR,
  sameVal,
  shortVal,
  sortKeys,
  toIR,
} from './ir.service';
import { isNoisePath } from './noise.service';

/**
 * Build phase — given a journey and a variant (`wpf` / `exe`), produce
 * everything downstream views need: parsed docs, a merged IR, its emitted
 * lines, a full path → history map and per-step change counts.
 *
 * Deterministic and pure — cache callers can safely memoise on the tuple.
 */

/** Find the document filename for one step in one variant. */
export function variantFile(step: JourneyStep, variant: Variant): string | null {
  const suffix = '.' + variant + '.json';
  const hit = step.files.find((f) => f.toLowerCase().endsWith(suffix));
  return hit ?? step.files.find((f) => /\.json$/i.test(f)) ?? null;
}

export function build(bundle: JourneyBundle, variant: Variant): BuildResult {
  const steps = bundle.steps;

  const docs = steps.map((s) => {
    const fn = variantFile(s, variant);
    const raw = fn ? bundle.files[fn] : null;
    let obj: unknown | null = null;
    try {
      obj = raw ? sortKeys(JSON.parse(raw)) : null;
    } catch {
      obj = null;
    }
    return {
      file: fn,
      obj,
      text: obj ? JSON.stringify(obj, null, 2) : '',
    };
  });

  const irs: (IRNode | null)[] = docs.map((d) => (d.obj ? toIR(d.obj) : null));

  let merged: IRNode | null = null;
  for (const ir of irs) if (ir) merged = mergeIR(merged, ir);

  const mergedLines: MergedLine[] = [];
  if (merged) emitLines(merged, '', '', 0, true, mergedLines);

  const maps = irs.map((ir) => (ir ? flatten(ir, '', new Map()) : new Map<string, IRNode>()));
  const hist: HistoryMap = new Map();
  const counts = irs.map(() => 0);

  let prevMap: Map<string, IRNode> | null = irs[0] ? maps[0] : null;
  for (let i = 1; i < maps.length; i++) {
    if (!irs[i]) continue;
    const cur = maps[i];
    const prev = prevMap;
    prevMap = cur;
    if (!prev) continue;

    const paths = new Set<string>(cur.keys());
    for (const p of prev.keys()) paths.add(p);

    for (const p of paths) {
      if (!p) continue;
      const a = prev.get(p);
      const b = cur.get(p);
      let st: HistoryEvent['st'] | null = null;
      let from: string | null = null;
      let to: string | null = null;

      if (b && !a) {
        st = 'add';
        to = shortVal(b);
      } else if (a && !b) {
        st = 'remove';
        from = shortVal(a);
      } else if (a && b && !sameVal(a, b) && a.t === 'val' && b.t === 'val') {
        st = 'modify';
        from = fmt((a as IRVal).v);
        to = fmt((b as IRVal).v);
      }

      if (st) {
        const noise = isNoisePath(p);
        const list = hist.get(p);
        const event: HistoryEvent = { i, st, from, to, noise };
        if (list) list.push(event);
        else hist.set(p, [event]);
        if (!noise) counts[i]++;
      }
    }
  }

  return { docs, merged, mergedLines, hist, counts };
}
