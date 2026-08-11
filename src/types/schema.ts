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
}

export type YamlMode = 'empty' | 'sample';

/** One emitted YAML line, tagged with the canonical path it came from. */
export interface YamlLine {
  text: string;
  canon: string;
  depth: number;
  selected: boolean;
  variants: Variant[];
}
