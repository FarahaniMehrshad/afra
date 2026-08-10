import { create } from 'zustand';
import type {
  LlmChunkTrace,
  LlmHealth,
  LlmPayload,
  LlmStatus,
  LlmVerdict,
} from '@/types/llm';
import type { Variant } from '@/types/journey';

/**
 * State for the LLM pass. Kept out of `appStore`, which owns raw user intent —
 * this is fetched data with a lifecycle of its own (progress, cancellation,
 * per-batch failures) and it would only muddy that store.
 */

/** Verdicts are per (variant, path); the same key exists in both variants. */
export function verdictKey(variant: Variant, path: string): string {
  return variant + '\u0000' + path;
}

interface LlmState {
  health: LlmHealth | null;
  /** Distinguishes "not asked yet" from "asked, and there is no key". */
  healthChecked: boolean;

  status: LlmStatus;
  done: number;
  total: number;
  error: string;

  verdicts: Map<string, LlmVerdict>;
  /** Last payload built, kept so the debug panel can show it before a run. */
  payload: LlmPayload | null;
  traces: LlmChunkTrace[];
  debugOpen: boolean;

  /**
   * Which journey these results belong to, and what settings the held batches
   * were built from. Both live here rather than in the hook so that leaving
   * the Total-diff page and coming back does not discard a finished run.
   */
  forBundle: unknown;
  signature: string;

  setHealth: (h: LlmHealth | null) => void;
  previewRun: (
    payload: LlmPayload,
    traces: LlmChunkTrace[],
    signature: string,
  ) => void;
  startRun: () => void;
  patchTrace: (id: string, patch: Partial<LlmChunkTrace>) => void;
  addVerdicts: (rows: LlmVerdict[]) => void;
  finishRun: (error?: string) => void;
  reset: (forBundle: unknown) => void;
  setDebugOpen: (v: boolean) => void;
}

export const useLlmStore = create<LlmState>((set) => ({
  health: null,
  healthChecked: false,
  status: 'idle',
  done: 0,
  total: 0,
  error: '',
  verdicts: new Map(),
  payload: null,
  traces: [],
  debugOpen: false,
  forBundle: null,
  signature: '',

  setHealth: (health) => set({ health, healthChecked: true }),

  previewRun: (payload, traces, signature) => set({ payload, traces, signature }),

  startRun: () =>
    set((s) => ({
      status: 'running',
      done: 0,
      total: s.traces.length,
      error: '',
      verdicts: new Map(),
    })),

  patchTrace: (id, patch) =>
    set((s) => {
      const traces = s.traces.map((t) => (t.chunk.id === id ? { ...t, ...patch } : t));
      const done = traces.filter(
        (t) => t.status === 'ok' || t.status === 'error',
      ).length;
      return { traces, done };
    }),

  addVerdicts: (rows) =>
    set((s) => {
      if (!rows.length) return {};
      const verdicts = new Map(s.verdicts);
      for (const r of rows) verdicts.set(verdictKey(r.variant, r.path), r);
      return { verdicts };
    }),

  finishRun: (error) =>
    set({ status: error ? 'error' : 'done', error: error ?? '' }),

  reset: (forBundle) =>
    set({
      status: 'idle',
      done: 0,
      total: 0,
      error: '',
      verdicts: new Map(),
      payload: null,
      traces: [],
      debugOpen: false,
      forBundle,
      signature: '',
    }),

  setDebugOpen: (debugOpen) => set({ debugOpen }),
}));
