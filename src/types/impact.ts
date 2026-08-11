import type { EventKind, HistoryEvent } from './ir';
import type { Variant } from './journey';
import type { LlmCategory } from './llm';

export type ImpactDerivedCategory = Extract<
  LlmCategory,
  'derived' | 'random-id' | 'timestamp' | 'environment' | 'unknown'
>;

export interface ConcretePathChange {
  path: string;
  event: HistoryEvent;
}

export interface DerivedChange {
  path: string;
  category: ImpactDerivedCategory | 'unclassified';
  event: HistoryEvent;
}

export interface UiFieldStepOccurrence {
  step: number;
  label: string;
  operation: string;
  concretePaths: ConcretePathChange[];
  derived: DerivedChange[];
  sharedWith: number;
}

export interface UiFieldTotals {
  add: number;
  remove: number;
  modify: number;
  derived: number;
}

export interface UiFieldEntry {
  canonical: string;
  variant: Variant;
  byKind: Record<EventKind, UiFieldStepOccurrence[]>;
  totals: UiFieldTotals;
}

export interface UiFieldImpact {
  variant: Variant;
  entries: UiFieldEntry[];
  totals: {
    fields: number;
    occurrences: number;
    derived: number;
  };
}
