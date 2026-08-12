import type { UiFieldEntry } from '@/types/impact';

type DtoNode =
  | { t: 'obj'; props: Map<string, DtoNode> }
  | { t: 'arr'; item: DtoNode | null }
  | { t: 'leaf'; sample: unknown };

interface BuildOptions {
  withSampleValues: boolean;
}

export function buildImpactDto(
  entries: UiFieldEntry[],
  opts: BuildOptions,
): Record<string, unknown> {
  const root: DtoNode = { t: 'obj', props: new Map() };
  for (const entry of entries) {
    const segments = toRelativeSegments(entry.canonical);
    if (!segments.length) continue;
    const sample = inferSampleValue(entry, opts.withSampleValues);
    addPath(root, segments, sample);
  }
  return materialize(root) as Record<string, unknown>;
}

function toRelativeSegments(path: string): string[] {
  const segs = path.split('/').filter(Boolean);
  if (!segs.length) return [];

  let i = 0;
  if (segs[i] === 'BoardModel') i++;

  // Typical plugin root.
  if (segs[i] === 'Plugins' && segs[i + 1] === '$values' && segs[i + 2] === '[]') {
    i += 3;
    return segs.slice(i);
  }

  // Source map branch (less common representative).
  if (
    segs[i] === 'Links' &&
    segs[i + 1] === '$values' &&
    segs[i + 2] === '[]' &&
    segs[i + 3] === 'Map' &&
    segs[i + 4] === '$values' &&
    segs[i + 5] === '[]' &&
    segs[i + 6] === 'Source'
  ) {
    i += 7;
    return segs.slice(i);
  }

  return segs.slice(i);
}

function inferSampleValue(entry: UiFieldEntry, withSampleValues: boolean): unknown {
  if (!withSampleValues) return null;
  return bestObservedLiteral(entry) ?? null;
}

function bestObservedLiteral(entry: UiFieldEntry): unknown {
  type Bucket = {
    value: unknown;
    count: number;
    bestScore: number;
    latestStep: number;
  };

  const buckets = new Map<string, Bucket>();
  const rows = [...entry.byKind.add, ...entry.byKind.modify, ...entry.byKind.remove];
  for (const row of rows) {
    for (const cp of row.concretePaths) {
      const e = cp.event;
      // Prefer resulting values (`to`) over historical ones (`from`).
      const ordered = e.st === 'add' ? [e.to] : e.st === 'remove' ? [e.from] : [e.to, e.from];
      for (let i = 0; i < ordered.length; i++) {
        const raw = ordered[i];
        const v = parseLiteral(raw);
        if (v === undefined) continue;
        const key = stableKey(v);
        const score = i === 0 ? 2 : 1;
        const step = Number.isFinite(row.step) ? row.step : 0;
        const prev = buckets.get(key);
        if (!prev) {
          buckets.set(key, { value: v, count: 1, bestScore: score, latestStep: step });
        } else {
          prev.count += 1;
          prev.bestScore = Math.max(prev.bestScore, score);
          prev.latestStep = Math.max(prev.latestStep, step);
        }
      }
    }
  }
  let winner: Bucket | null = null;
  for (const b of buckets.values()) {
    if (!winner) {
      winner = b;
      continue;
    }
    if (b.count !== winner.count) {
      if (b.count > winner.count) winner = b;
      continue;
    }
    if (b.bestScore !== winner.bestScore) {
      if (b.bestScore > winner.bestScore) winner = b;
      continue;
    }
    if (b.latestStep > winner.latestStep) winner = b;
  }
  return winner?.value;
}

function parseLiteral(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function stableKey(v: unknown): string {
  return JSON.stringify(v);
}

function addPath(node: DtoNode, segs: string[], sample: unknown): void {
  if (!segs.length) return;
  if (node.t !== 'obj' && node.t !== 'arr') return;

  const [seg, ...rest] = segs;
  const isLast = rest.length === 0;

  if (seg === '[]') {
    if (node.t !== 'arr') return;
    if (isLast) return; // array of unspecified primitive/tuple -> keep empty
    if (!node.item) {
      const next = rest[0];
      if (next === '[]') node.item = { t: 'arr', item: null };
      else node.item = makeNodeForNext(next, sample, rest.length === 1);
    }
    addPath(node.item, rest, sample);
    return;
  }

  if (node.t !== 'obj') return;

  const existing = node.props.get(seg);
  if (!existing) {
    node.props.set(seg, makeNodeForNext(rest[0], sample, isLast));
  }
  const nextNode = node.props.get(seg)!;

  if (!isLast) addPath(nextNode, rest, sample);
}

function makeNodeForNext(next: string | undefined, sample: unknown, isLeaf: boolean): DtoNode {
  if (isLeaf) return { t: 'leaf', sample };
  if (next === '[]') return { t: 'arr', item: null };
  return { t: 'obj', props: new Map() };
}

function materialize(node: DtoNode): unknown {
  if (node.t === 'leaf') return node.sample;
  if (node.t === 'arr') return node.item ? [materialize(node.item)] : [];

  const out: Record<string, unknown> = {};
  for (const [k, v] of node.props) out[k] = materialize(v);
  return out;
}
