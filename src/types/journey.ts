/**
 * Domain types for a journey — a single UI run captured as an ordered
 * series of steps, each of which snapshots one or more JSON documents.
 */

/** One record in `journey.jsonl`. */
export interface JourneyStep {
  ordinal: number;
  label: string;
  operation: string;
  /** File names (basename only) attached to this step. */
  files: string[];
  error: string | null;
}

/** In-memory file map: filename -> raw text. */
export type FileBag = Record<string, string>;

/** A journey folder as far as this app is concerned. */
export interface JourneyBundle {
  name: string;
  files: FileBag;
  steps: JourneyStep[];
  journeyMd: string;
}

/** The two document variants each step keeps around. */
export type Variant = 'wpf' | 'exe';

/** UI pages. */
export type Page = 'ingest' | 'steps' | 'total' | 'impact' | 'dto' | 'convert' | 'test';

/** Layout mode for the per-step diff pane. */
export type DiffLayout = 'split' | 'inline';
