import type { EventKind } from './ir';
import type { Variant } from './journey';

/**
 * Types for the LLM pass over the merged configuration. The model never sees
 * raw snapshots — only changed paths, their value history, and the UI
 * operation of the step that changed them.
 */

export type LlmCategory =
  | 'random-id'
  | 'timestamp'
  | 'step-operation'
  | 'derived'
  | 'environment'
  | 'unknown';

export const LLM_CATEGORIES: readonly LlmCategory[] = [
  'random-id',
  'timestamp',
  'step-operation',
  'derived',
  'environment',
  'unknown',
];

export function isLlmCategory(v: unknown): v is LlmCategory {
  return typeof v === 'string' && (LLM_CATEGORIES as readonly string[]).includes(v);
}

/** One change against a path, flattened with the step context it happened in. */
export interface LlmEvent {
  /** `JourneyStep.ordinal`, i.e. what the UI shows as "step 04". */
  step: number;
  label: string;
  operation: string;
  kind: EventKind;
  from: string | null;
  to: string | null;
}

/** One changed path handed to the model. */
export interface LlmPathEntry {
  path: string;
  /** The path's value in the merged configuration, if it is a leaf. */
  value: string | null;
  /** Whether the local noise heuristic already flags this path. */
  noise: boolean;
  events: LlmEvent[];
}

/** Step context repeated in every batch so each request stands alone. */
export interface LlmStepContext {
  step: number;
  label: string;
  operation: string;
}

/** The complete analysable surface for one run, before batching. */
export interface LlmPayload {
  folder: string;
  steps: LlmStepContext[];
  variants: {
    variant: Variant;
    /** The snapshot filename family this variant was built from. */
    file: string | null;
    entries: LlmPathEntry[];
  }[];
}

/** One request's worth of the payload. */
export interface LlmChunk {
  id: string;
  variant: Variant;
  /** 1-based position among the chunks of this variant. */
  index: number;
  ofVariant: number;
  folder: string;
  steps: LlmStepContext[];
  entries: LlmPathEntry[];
}

/** What the model is asked to return, per path. */
export interface LlmVerdict {
  variant: Variant;
  path: string;
  category: LlmCategory;
  /** 0..1. Clamped on the way in — models are loose with this one. */
  confidence: number;
  reason: string;
}

export type LlmStatus = 'idle' | 'running' | 'done' | 'error';

/** `GET /api/llm/health` — deliberately says nothing about the key's value. */
export interface LlmHealth {
  configured: boolean;
  hasBaseUrl: boolean;
  hasApiKey: boolean;
  model: string;
  host: string;
  pathsPerBatch: number;
}

/** Everything the debug panel needs to show one batch, request and reply. */
export interface LlmChunkTrace {
  chunk: LlmChunk;
  system: string;
  user: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  /** Raw assistant content, verbatim, so a bad reply is diagnosable. */
  response: string | null;
  error: string | null;
  usage: unknown;
  ms: number | null;
}
