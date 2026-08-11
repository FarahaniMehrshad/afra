import type { BuildResult, IRNode, IRVal } from '@/types/ir';
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

export function buildSchema(
  builds: Partial<Record<Variant, BuildResult | null>>,
  verdicts: Map<string, LlmVerdict>,
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
    ? assemble('', '', idx, include, selected)
    : blankRoot();

  return { root, index: idx.entries, selected, fieldCount: countSelected(root) };
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
): SchemaNode {
  const entry = idx.entries.get(canon)!;
  const children = (idx.children.get(canon) ?? [])
    .filter((c) => include.has(c))
    .map((c) => assemble(c, idx.seg.get(c) ?? '', idx, include, selected))
    // Sorted rather than left in walk order: the exe pass appends keys the wpf
    // pass never saw, and only sorting makes the result order-independent.
    .sort((a, b) => a.key.localeCompare(b.key));

  const kind: SchemaKind = children.length
    ? entry.kind === 'val'
      ? 'obj'
      : entry.kind
    : entry.kind;

  const withValue = entry.sources.find((s) => s.value !== undefined);

  return {
    key: segment === ARRAY_SEG ? '' : segment,
    canon,
    kind,
    children,
    sample: withValue?.value ?? null,
    variants: VARIANT_ORDER.filter((v) => entry.sources.some((s) => s.variant === v)),
    selected: selected.has(canon),
  };
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
