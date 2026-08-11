import type { Primitive } from './ir';
import type { Variant } from './journey';

/**
 * Types for the UI-affected field schema — the compact tree distilled from
 * the LLM's `step-operation` verdicts.
 *
 * The organising idea is the *canonical path*: a real path like
 * `/Devices/#dev-pump/Name` with every array-item key replaced by `[]`, so it
 * reads `/Devices/[]/Name`. That collapses each array onto one representative
 * element and lets wpf and exe unify even though the exe exporter mints
 * different array identities.
 */

export type SchemaKind = 'obj' | 'arr' | 'val';

/** One real path that collapses into a canonical path. */
export interface SchemaSource {
  variant: Variant;
  path: string;
  /** Whether this particular real path is what the LLM labelled. */
  selected: boolean;
  /** The merged value at this path. Absent for containers. */
  value?: Primitive;
}

/** Everything known about one canonical path across both variants. */
export interface CanonEntry {
  canon: string;
  kind: SchemaKind;
  /** Sorted: wpf before exe, then by path. */
  sources: SchemaSource[];
}

export interface SchemaNode {
  /** Object key. Empty for the root and for an array's element node. */
  key: string;
  canon: string;
  kind: SchemaKind;
  children: SchemaNode[];
  sample: Primitive | null;
  /** Which variants contributed a real path here. */
  variants: Variant[];
  /** True when the LLM labelled this path, false for pure ancestors. */
  selected: boolean;
}

/** What `buildSchema` hands to the UI. */
export interface SchemaResult {
  root: SchemaNode;
  /** Canonical path -> everything backing it, for the mapping panel. */
  index: Map<string, CanonEntry>;
  /** Canonical paths the LLM actually labelled. */
  selected: Set<string>;
  /** Number of labelled leaves that made it into the tree. */
  fieldCount: number;
  /**
   * Per-variant compaction stats — one report per rendered YAML pane. Filled
   * by `useSchema` after each variant's raw JSON is picked, compacted and
   * deduped. The debug panel groups its display by variant.
   */
  compaction?: Record<Variant, CompactionReport>;
}

/**
 * One emitted YAML line, tagged with the canonical path it came from.
 *
 * There is one YAML pane per variant (wpf on top, exe below) so the variant
 * is a property of the pane, not the line — we don't repeat it here.
 */
export interface YamlLine {
  text: string;
  canon: string;
  depth: number;
  /** True when this line's canonical path is one the LLM directly labelled. */
  selected: boolean;
  /** Marker rendered inline on the line ("&d3" head of a group, "*d3" alias). */
  anchor?: string;
  aliasOf?: string;
}

/** Summary of what the compaction pass did — surfaced in the debug panel. */
export interface CompactionReport {
  collapsedValues: number;
  collapsedTypeWrappers: number;
  strippedMetaLeaves: number;
  duplicates: DuplicateGroup[];
}

export interface DuplicateGroup {
  anchor: string;
  hash: string;
  count: number;
  leafCount: number;
  /** First-line-ish preview so operators can spot the subtree in the panel. */
  preview: string;
  /** Canonical paths of every occurrence, in traversal order. */
  canons: string[];
  /** Dotted, human-readable variants of `canons` for the panel. */
  keyPaths: string[];
}

/** An empty compaction report — used when a variant has no picked step to render. */
export function emptyCompactionReport(): CompactionReport {
  return {
    collapsedValues: 0,
    collapsedTypeWrappers: 0,
    strippedMetaLeaves: 0,
    duplicates: [],
  };
}
