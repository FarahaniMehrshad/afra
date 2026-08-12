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
