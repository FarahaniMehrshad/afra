import { create } from 'zustand';
import type {
  DiffLayout,
  JourneyBundle,
  Page,
  Variant,
} from '@/types/journey';
import type { EventKind } from '@/types/ir';

/**
 * Central state store. UI components subscribe with narrow selectors so
 * only the pieces they actually need trigger a re-render.
 *
 * All derived data (diffs, merged view, history) lives in memoised hooks
 * and services — this store only owns *raw* user intent.
 */

export interface AppState {
  bundle: JourneyBundle | null;
  page: Page;
  variant: Variant;
  layout: DiffLayout;
  stepIdx: number;
  hideNoise: boolean;
  wrap: boolean;

  /** Filter box on the step-nav side panel. */
  stepQuery: string;
  /** Filter box in the diff toolbar. */
  diffQuery: string;
  /** Filter box in the merged-view toolbar. */
  totalQuery: string;

  selPath: string | null;
  onlyChanged: boolean;
  /** Type filter chips in the merged view. */
  typeFilters: EventKind[];
  /** Minimum change-count filter in the merged view. */
  minCount: number;

  error: string;
  dragOver: boolean;

  loadBundle: (bundle: JourneyBundle) => void;
  fail: (msg: string) => void;
  clearError: () => void;
  setDragOver: (v: boolean) => void;

  setPage: (p: Page) => void;
  setVariant: (v: Variant) => void;
  setLayout: (l: DiffLayout) => void;
  setStepIdx: (n: number) => void;
  toggleNoise: () => void;
  toggleWrap: () => void;
  toggleChanged: () => void;
  toggleType: (t: EventKind) => void;
  setMinCount: (n: number) => void;
  setStepQuery: (q: string) => void;
  setDiffQuery: (q: string) => void;
  setTotalQuery: (q: string) => void;
  selectPath: (p: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  bundle: null,
  page: 'ingest',
  variant: 'wpf',
  layout: 'split',
  stepIdx: 1,
  hideNoise: true,
  wrap: false,
  stepQuery: '',
  diffQuery: '',
  totalQuery: '',
  selPath: null,
  onlyChanged: false,
  typeFilters: [],
  minCount: 0,
  error: '',
  dragOver: false,

  loadBundle: (bundle) =>
    set({
      bundle,
      page: 'steps',
      stepIdx: bundle.steps.length > 1 ? 1 : 0,
      selPath: null,
      error: '',
      dragOver: false,
    }),

  fail: (msg) => set({ error: msg }),
  clearError: () => set({ error: '' }),
  setDragOver: (v) => set({ dragOver: v }),

  setPage: (p) => set({ page: p }),
  setVariant: (v) => set({ variant: v }),
  setLayout: (l) => set({ layout: l }),
  setStepIdx: (n) => set({ stepIdx: Math.max(1, n) }),
  toggleNoise: () => set((s) => ({ hideNoise: !s.hideNoise })),
  toggleWrap: () => set((s) => ({ wrap: !s.wrap })),
  toggleChanged: () => set((s) => ({ onlyChanged: !s.onlyChanged })),
  toggleType: (t) =>
    set((s) => ({
      typeFilters: s.typeFilters.includes(t)
        ? s.typeFilters.filter((x) => x !== t)
        : [...s.typeFilters, t],
    })),
  setMinCount: (n) => set({ minCount: n }),
  setStepQuery: (q) => set({ stepQuery: q }),
  setDiffQuery: (q) => set({ diffQuery: q }),
  setTotalQuery: (q) => set({ totalQuery: q }),
  selectPath: (p) => set({ selPath: p }),
}));
