import type { EventKind, HistoryEvent } from './ir';
import type { Variant } from './journey';
import type { LlmCategory } from './llm';

export type ImpactDerivedCategory = Extract<
  LlmCategory,
  'derived' | 'random-id' | 'timestamp' | 'environment' | 'unknown'
>;

export type ImpactMergeMode = 'off' | 'within' | 'across';

export interface ConcretePathChange {
  path: string;
  event: HistoryEvent;
  variant: Variant;
}

export interface DerivedChange {
  path: string;
  category: ImpactDerivedCategory | 'unclassified';
  event: HistoryEvent;
  variant: Variant;
}

export interface ClusterSibling {
  canonical: string;
  concretePaths: string[];
  variant: Variant;
}

export interface UiFieldStepOccurrence {
  step: number;
  label: string;
  operation: string;
  concretePaths: ConcretePathChange[];
  derived: DerivedChange[];
  sharedWith: number;
  /** Cluster signature used by merge mode: step+kind+value. */
  valueSignature?: string;
  /** `null` => representative, `string` => points at representative canonical. */
  mergedInto?: string | null;
  /** Representative-only list of sibling canonical fields folded into this row. */
  mergesFrom?: ClusterSibling[];
  /** Non-representative rows keep the hidden derived count for context text. */
  attributedDerivedCount?: number;
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
  variant: Variant | 'combined';
  label: string;
  entries: UiFieldEntry[];
  totals: {
    fields: number;
    occurrences: number;
    derived: number;
  };
}
