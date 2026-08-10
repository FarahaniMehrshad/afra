/**
 * The document IR — a stable, order-preserving intermediate representation
 * used for merging, flattening and change tracking.
 */

export type Primitive = string | number | boolean | null;

export interface IRVal {
  t: 'val';
  v: Primitive;
}

export interface IRItem {
  k: string;
  n: IRNode;
}

export interface IRObj {
  t: 'obj';
  items: IRItem[];
}

export interface IRArr {
  t: 'arr';
  items: IRItem[];
}

export type IRNode = IRVal | IRObj | IRArr;

export type EventKind = 'add' | 'remove' | 'modify';

/** A single change against a JSON path across a step boundary. */
export interface HistoryEvent {
  /** Step index this event occurred at (1-based across the run). */
  i: number;
  st: EventKind;
  from: string | null;
  to: string | null;
  /** Marked when the containing path smells like GUID/timestamp noise. */
  noise: boolean;
}

/** The path → history map produced by build.service. */
export type HistoryMap = Map<string, HistoryEvent[]>;

/** A single emitted merged-JSON line, with its origin path for lookup. */
export interface MergedLine {
  path: string;
  text: string;
  tail: string;
  depth: number;
  closer?: boolean;
}

/** Everything the build phase produces for a variant. */
export interface BuildResult {
  docs: Array<{
    file: string | null;
    obj: unknown | null;
    text: string;
  }>;
  merged: IRNode | null;
  mergedLines: MergedLine[];
  hist: HistoryMap;
  /** Number of meaningful (non-noise) changes each step introduced. */
  counts: number[];
}
