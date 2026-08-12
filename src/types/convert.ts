import type { Variant } from '@/types/journey';
import type { UiFieldEntry } from '@/types/impact';

export type OpKind = 'add' | 'remove' | 'modify';

export interface FieldOp {
  variant: Variant;
  seedCanonical: string;
  seedVariantEntry: UiFieldEntry;
  kind: OpKind;
  concretePath: string;
  fromValue: unknown | null;
  toValue: unknown | null;
  elementParent?: string;
  elementIndex?: number | string;
}

export interface ElementOp {
  variant: Variant;
  parentArrayPath: string;
  kind: 'add' | 'remove';
  templateEntry: UiFieldEntry;
  mintedIndex?: number;
  dtoElement?: unknown;
  /**
   * How strongly identity-alignment justified a REMOVE at `mintedIndex`.
   * Higher = this index was an alignment orphan (no DTO partner). Unset / 0
   * means the remove came from plain position pairing and should lose ties
   * against orphan-backed removes on sibling scopes.
   */
  identityConfidence?: number;
}

export interface VariantOperationPlan {
  fields: FieldOp[];
  elements: ElementOp[];
}

export interface OperationPlan {
  wpf: VariantOperationPlan;
  exe: VariantOperationPlan;
  warnings: string[];
}
