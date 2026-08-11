import type { BuildResult, IRNode, IRVal, Primitive } from '@/types/ir';
import type { Variant } from '@/types/journey';
import type { LlmVerdict } from '@/types/llm';
import type {
  CanonEntry,
  SchemaKind,
  SchemaNode,
  SchemaResult,
} from '@/types/schema';

/**
 * Distils the merged wpf and exe configurations down to just the fields the
 * LLM attributed to a UI operation, as one unified tree.
 *
 * Everything hangs off the *canonical path*: the real path with each array
 * item key replaced by `[]`. `/Devices/#dev-pump/Name` and `/Devices/0/Name`
 * both become `/Devices/[]/Name`, which simultaneously collapses arrays onto
 * one representative element and lets the two variants line up despite the
 * exe exporter minting fresh array identities on every write.
 *
 * Pure and deterministic: the same verdicts and builds always produce the
 * same tree, down to child ordering and the chosen sample values.
 */

/** The array-item placeholder segment. */
export const ARRAY_SEG = '[]';

const VARIANT_ORDER: Variant[] = ['wpf', 'exe'];

interface WorkIndex {
  entries: Map<string, CanonEntry>;
  /** Canonical path -> its parent. The root is absent. */
  parent: Map<string, string>;
  /** Canonical path -> the segment it hangs off its parent by. */
  seg: Map<string, string>;
  /** Canonical path -> child canonical paths, first-seen order. */
  children: Map<string, string[]>;
}

function emptyIndex(): WorkIndex {
  return {
    entries: new Map(),
    parent: new Map(),
    seg: new Map(),
    children: new Map(),
  };
}

/**
 * Optional per-variant "sample" overrides. Keys are canonical paths, values
 * are the primitive to render in the sample YAML instead of whatever the
 * merged IR happened to keep.
 *
 * The merged IR is a *union* — nothing was ever exported in that shape. For
 * a realistic sample we want one real step's snapshot. Callers pick the
 * longest snapshot per variant (see `pickLongestStepSamples`) and pass its
 * flattened form in here.
 */
export type SampleOverrides = Partial<Record<Variant, ReadonlyMap<string, Primitive>>>;

export function buildSchema(
  builds: Partial<Record<Variant, BuildResult | null>>,
  verdicts: Map<string, LlmVerdict>,
  samples: SampleOverrides = {},
): SchemaResult {
  const labelled: Record<Variant, Set<string>> = { wpf: new Set(), exe: new Set() };
  for (const v of verdicts.values()) {
    if (v.category === 'step-operation') labelled[v.variant].add(v.path);
  }

  const idx = emptyIndex();
  for (const variant of VARIANT_ORDER) {
    const merged = builds[variant]?.merged;
    if (merged) walk(merged, '', '', variant, labelled[variant], idx);
  }

  for (const e of idx.entries.values()) e.sources.sort(compareSources);

  const selected = new Set<string>();
  for (const [canon, e] of idx.entries) {
    if (e.sources.some((s) => s.selected)) selected.add(canon);
  }

  // A field only makes sense inside its containers, so pull in every ancestor.
  const include = new Set<string>(['']);
  for (const canon of selected) {
    let cur: string | undefined = canon;
    while (cur !== undefined && !include.has(cur)) {
      include.add(cur);
      cur = idx.parent.get(cur);
    }
  }

  const root = idx.entries.has('')
    ? assemble('', '', idx, include, selected, samples)
    : blankRoot();

  return { root, index: idx.entries, selected, fieldCount: countSelected(root) };
}

/**
 * Flatten one step's IR into `canonicalPath -> primitiveValue`. Only primitive
 * leaves are recorded — objects and arrays exist only as ancestors of leaves.
 * Arrays collapse by canonical segment so multi-element arrays produce one
 * representative sample per leaf; the first primitive encountered wins.
 */
export function collectSampleValues(
  ir: IRNode,
  out: Map<string, Primitive> = new Map(),
  canon: string = '',
): Map<string, Primitive> {
  if (ir.t === 'val') {
    if (!out.has(canon)) out.set(canon, (ir as IRVal).v);
    return out;
  }
  for (const it of ir.items) {
    const seg = ir.t === 'arr' ? ARRAY_SEG : it.k;
    collectSampleValues(it.n, out, canon + '/' + seg);
  }
  return out;
}

/**
 * Choose the index of the longest step for one variant, measured by pretty-
 * printed JSON length. Skips empty/missing docs. Ties go to the later step
 * because a later step is usually the more mature version of the run.
 * Returns -1 when the build has no readable step.
 */
export function longestStepIndex(build: BuildResult | null | undefined): number {
  if (!build || !build.docs.length) return -1;
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < build.docs.length; i++) {
    const len = build.docs[i]?.text?.length ?? 0;
    if (!len) continue;
    // `>=` because ties break to the later step.
    if (len >= bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Record one variant's merged tree into the shared index. The parent's node
 * type is what tells us whether a segment is an array item, which is why this
 * cannot reuse `flatten` from ir.service.
 */
function walk(
  n: IRNode,
  real: string,
  canon: string,
  variant: Variant,
  labelled: ReadonlySet<string>,
  idx: WorkIndex,
): void {
  const entry = entryFor(idx, canon, n.t);
  // A container that also appears as a leaf elsewhere keeps the richer kind,
  // matching how mergeIR resolves the same conflict.
  if (entry.kind === 'val' && n.t !== 'val') entry.kind = n.t;

  entry.sources.push({
    variant,
    path: real,
    selected: labelled.has(real),
    ...(n.t === 'val' ? { value: (n as IRVal).v } : {}),
  });

  if (n.t === 'val') return;

  for (const it of n.items) {
    const segment = n.t === 'arr' ? ARRAY_SEG : it.k;
    const childCanon = canon + '/' + segment;
    if (!idx.parent.has(childCanon)) {
      idx.parent.set(childCanon, canon);
      idx.seg.set(childCanon, segment);
      const siblings = idx.children.get(canon);
      if (siblings) siblings.push(childCanon);
      else idx.children.set(canon, [childCanon]);
    }
    walk(it.n, real + '/' + it.k, childCanon, variant, labelled, idx);
  }
}

function entryFor(idx: WorkIndex, canon: string, kind: SchemaKind): CanonEntry {
  const hit = idx.entries.get(canon);
  if (hit) return hit;
  const made: CanonEntry = { canon, kind, sources: [] };
  idx.entries.set(canon, made);
  return made;
}

function compareSources(
  a: { variant: Variant; path: string },
  b: { variant: Variant; path: string },
): number {
  if (a.variant !== b.variant) return a.variant === 'wpf' ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function assemble(
  canon: string,
  segment: string,
  idx: WorkIndex,
  include: ReadonlySet<string>,
  selected: ReadonlySet<string>,
  samples: SampleOverrides,
): SchemaNode {
  const entry = idx.entries.get(canon)!;
  const children = (idx.children.get(canon) ?? [])
    .filter((c) => include.has(c))
    .map((c) => assemble(c, idx.seg.get(c) ?? '', idx, include, selected, samples))
    // Sorted rather than left in walk order: the exe pass appends keys the wpf
    // pass never saw, and only sorting makes the result order-independent.
    .sort((a, b) => a.key.localeCompare(b.key));

  const kind: SchemaKind = children.length
    ? entry.kind === 'val'
      ? 'obj'
      : entry.kind
    : entry.kind;

  const variants = VARIANT_ORDER.filter((v) =>
    entry.sources.some((s) => s.variant === v),
  );

  return {
    key: segment === ARRAY_SEG ? '' : segment,
    canon,
    kind,
    children,
    sample: pickSample(canon, entry, variants, samples),
    variants,
    selected: selected.has(canon),
  };
}

/**
 * Sample-value picker with a clear precedence:
 *   1. Longest-step override for a variant that contributes this path — try
 *      wpf first, then exe, matching the same wpf-before-exe convention used
 *      when sorting sources.
 *   2. Fall back to whatever the merged IR kept (the previous behaviour).
 *
 * The override map records `null` explicitly for genuine null values, so the
 * `.has(canon)` check is what tells "the longest step had this field" from
 * "the longest step never saw this field".
 */
function pickSample(
  canon: string,
  entry: CanonEntry,
  variants: readonly Variant[],
  samples: SampleOverrides,
): Primitive | null {
  for (const v of variants) {
    const map = samples[v];
    if (map && map.has(canon)) return map.get(canon) ?? null;
  }
  const withValue = entry.sources.find((s) => s.value !== undefined);
  return withValue?.value ?? null;
}

function blankRoot(): SchemaNode {
  return {
    key: '',
    canon: '',
    kind: 'obj',
    children: [],
    sample: null,
    variants: [],
    selected: false,
  };
}

function countSelected(n: SchemaNode): number {
  return (n.selected ? 1 : 0) + n.children.reduce((s, c) => s + countSelected(c), 0);
}
