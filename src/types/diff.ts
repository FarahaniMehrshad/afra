/**
 * Types for the line-level diff pipeline used by the per-step view.
 */

export interface WordSegment {
  t: string;
  /** CSS background — driven by whether this slice differs. */
  bg: string;
}

export type DiffRowKind = 'add' | 'del' | 'mod' | '=' | 'fold';

/** Normalised diff row returned by the diff service. */
export interface DiffRow {
  k: DiffRowKind;
  a: string | null;
  b: string | null;
  an: number | null;
  bn: number | null;
  lsegs?: WordSegment[] | null;
  rsegs?: WordSegment[] | null;
  noise?: boolean;
  /** Only used when k === 'fold'. */
  count?: number;
}
