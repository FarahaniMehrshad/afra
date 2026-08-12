import type { UiFieldEntry } from '@/types/impact';

type DtoNode =
  | { t: 'obj'; props: Map<string, DtoNode> }
  | { t: 'arr'; item: DtoNode | null }
  | { t: 'leaf'; sample: unknown };

interface BuildOptions {
  withSampleValues: boolean;
  valueForEntry?: (entry: UiFieldEntry) => unknown;
}

interface FromStepOptions {
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
    const sample = inferSampleValue(entry, opts);
    addPath(root, segments, sample);
  }
  return materialize(root) as Record<string, unknown>;
}

/**
 * Build DTO from merge:across seed entries and selected-step raw documents.
 * For every seed path, all concrete matches from the step document are included
 * (not just one representative), so arrays preserve every element.
 */
export function buildImpactDtoFromStep(
  entries: UiFieldEntry[],
  wpfDoc: unknown,
  exeDoc: unknown,
  opts: FromStepOptions,
): Record<string, unknown> {
  if (!opts.withSampleValues) {
    return buildImpactDto(entries, { withSampleValues: false });
  }

  const out: Record<string, unknown> = {};
  const wpfLeaves = flattenLeaves(wpfDoc);
  const exeLeaves = flattenLeaves(exeDoc);

  for (const entry of entries) {
    const canonSegs = entry.canonical.split('/').filter(Boolean);
    if (!canonSegs.length) continue;

    const wHits = matchingLeaves(wpfLeaves, canonSegs);
    const eHits = matchingLeaves(exeLeaves, canonSegs);

    if (wHits.length) {
      for (const hit of wHits) {
        const rel = toRelativeConcreteSegments(hit.segs);
        if (!rel.length) continue;
        setConcrete(out, rel, hit.value, true);
      }
    }
    for (const hit of eHits) {
      const rel = toRelativeConcreteSegments(hit.segs);
      if (!rel.length) continue;
      setConcrete(out, rel, hit.value, false);
    }
  }

  return out;
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

function inferSampleValue(entry: UiFieldEntry, opts: BuildOptions): unknown {
  if (!opts.withSampleValues) return null;
  const injected = opts.valueForEntry?.(entry);
  if (injected !== undefined) return injected;
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

function flattenLeaves(doc: unknown): Array<{ segs: string[]; value: unknown }> {
  const out: Array<{ segs: string[]; value: unknown }> = [];
  walkLeaves(doc, [], out);
  return out;
}

function walkLeaves(
  node: unknown,
  segs: string[],
  out: Array<{ segs: string[]; value: unknown }>,
): void {
  if (node === null || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    out.push({ segs: [...segs], value: node });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walkLeaves(node[i], [...segs, String(i)], out);
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkLeaves(v, [...segs, k], out);
    }
  }
}

function matchingLeaves(
  leaves: Array<{ segs: string[]; value: unknown }>,
  canonSegs: string[],
): Array<{ segs: string[]; value: unknown }> {
  const out: Array<{ segs: string[]; value: unknown }> = [];
  for (const leaf of leaves) {
    if (leaf.segs.length !== canonSegs.length) continue;
    let ok = true;
    for (let i = 0; i < canonSegs.length; i++) {
      const c = canonSegs[i];
      const s = leaf.segs[i];
      if (c !== '[]' && c !== s) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(leaf);
  }
  return out;
}

function toRelativeConcreteSegments(absSegs: string[]): string[] {
  if (!absSegs.length) return [];
  let i = 0;
  if (absSegs[i] === 'BoardModel') i++;

  if (
    absSegs[i] === 'Plugins' &&
    absSegs[i + 1] === '$values' &&
    isIndexSeg(absSegs[i + 2])
  ) {
    return absSegs.slice(i + 3);
  }

  if (
    absSegs[i] === 'Links' &&
    absSegs[i + 1] === '$values' &&
    isIndexSeg(absSegs[i + 2]) &&
    absSegs[i + 3] === 'Map' &&
    absSegs[i + 4] === '$values' &&
    isIndexSeg(absSegs[i + 5]) &&
    absSegs[i + 6] === 'Source'
  ) {
    return absSegs.slice(i + 7);
  }

  return absSegs.slice(i);
}

function isIndexSeg(seg: string | undefined): boolean {
  return typeof seg === 'string' && /^\d+$/.test(seg);
}

function setConcrete(
  root: Record<string, unknown>,
  relSegs: string[],
  value: unknown,
  overwrite: boolean,
): void {
  if (!relSegs.length) return;
  let node: unknown = root;

  for (let i = 0; i < relSegs.length; i++) {
    const seg = relSegs[i];
    const isLast = i === relSegs.length - 1;
    const next = relSegs[i + 1];
    const segIsIndex = /^\d+$/.test(seg);
    const nextIsIndex = /^\d+$/.test(next ?? '');

    if (segIsIndex) {
      const idx = Number(seg);
      if (!Array.isArray(node)) return;
      if (isLast) {
        if (overwrite || node[idx] === undefined) node[idx] = value;
        return;
      }
      if (node[idx] === undefined) node[idx] = nextIsIndex ? [] : {};
      node = node[idx];
      continue;
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const rec = node as Record<string, unknown>;
    if (isLast) {
      if (overwrite || rec[seg] === undefined) rec[seg] = value;
      return;
    }
    if (rec[seg] === undefined) rec[seg] = nextIsIndex ? [] : {};
    node = rec[seg];
  }
}

function addPath(node: DtoNode, segs: string[], sample: unknown): void {
  if (!segs.length) return;
  if (node.t !== 'obj' && node.t !== 'arr') return;

  const [seg, ...rest] = segs;
  const isLast = rest.length === 0;

  if (seg === '[]') {
    if (node.t !== 'arr') return;
    if (isLast) {
      // Terminal `[]` means an array element leaf (e.g. Rows/[]/[]).
      // Keep/seed a representative sample instead of emitting empty arrays only.
      if (!node.item) {
        node.item = { t: 'leaf', sample };
      } else if (node.item.t === 'leaf' && node.item.sample === null && sample !== null) {
        node.item.sample = sample;
      }
      return;
    }
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
