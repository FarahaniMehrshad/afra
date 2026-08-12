import { ID_KEYS } from '@/constants';
import type { ElementOp, FieldOp, OperationPlan } from '@/types/convert';

export interface AppliedVariantOps {
  doc: unknown;
  fields: FieldOp[];
  elements: ElementOp[];
  warnings: string[];
}

export interface ApplyOperationPlanResult {
  wpf: AppliedVariantOps;
  exe: AppliedVariantOps;
  warnings: string[];
}

interface ApplyVariantResult {
  doc: unknown;
  appliedFields: FieldOp[];
  appliedElements: ElementOp[];
  warnings: string[];
}

interface ApplyOperationPlanInput {
  plan: OperationPlan;
  wpfDoc: unknown;
  exeDoc: unknown;
}

export function applyOperationPlan(input: ApplyOperationPlanInput): ApplyOperationPlanResult {
  const wpf = applyVariantPlan(input.wpfDoc, input.plan.wpf.elements, input.plan.wpf.fields);
  const exe = applyVariantPlan(input.exeDoc, input.plan.exe.elements, input.plan.exe.fields);
  return {
    wpf: {
      doc: wpf.doc,
      fields: wpf.appliedFields,
      elements: wpf.appliedElements,
      warnings: wpf.warnings,
    },
    exe: {
      doc: exe.doc,
      fields: exe.appliedFields,
      elements: exe.appliedElements,
      warnings: exe.warnings,
    },
    warnings: [...input.plan.warnings, ...wpf.warnings, ...exe.warnings],
  };
}

function applyVariantPlan(baseDoc: unknown, elements: ElementOp[], fields: FieldOp[]): ApplyVariantResult {
  const doc =
    baseDoc && typeof baseDoc === 'object' ? structuredClone(baseDoc) : ({} as Record<string, unknown>);
  const warnings: string[] = [];
  const appliedElements: ElementOp[] = [];
  const appliedFields: FieldOp[] = [];

  const removeElements = elements
    .filter((op) => op.kind === 'remove')
    .slice()
    .sort((a, b) => (b.mintedIndex ?? -1) - (a.mintedIndex ?? -1));
  const addElements = elements.filter((op) => op.kind === 'add');

  for (const op of removeElements) {
    const parent = getAtAbsolutePath(doc, op.parentArrayPath);
    if (!Array.isArray(parent)) {
      warnings.push('Missing array for remove op at ' + op.parentArrayPath);
      continue;
    }
    if (!Number.isInteger(op.mintedIndex)) {
      warnings.push('Remove op missing index at ' + op.parentArrayPath);
      continue;
    }
    const idx = Number(op.mintedIndex);
    if (idx < 0 || idx >= parent.length) continue;
    parent.splice(idx, 1);
    appliedElements.push({ ...op, mintedIndex: idx });
  }

  for (const op of addElements) {
    const parent = ensureArrayAtAbsolutePath(doc, op.parentArrayPath);
    if (!parent) {
      warnings.push('Cannot create array for add op at ' + op.parentArrayPath);
      continue;
    }
    const idx = smallestUnusedIndex(parent);
    parent[idx] = cloneJson(op.dtoElement ?? {});
    appliedElements.push({ ...op, mintedIndex: idx });
  }

  const modifyFields = fields.filter((f) => f.kind === 'modify');
  const addFields = fields.filter((f) => f.kind === 'add');
  const removeFields = fields.filter((f) => f.kind === 'remove');

  for (const op of [...modifyFields, ...addFields, ...removeFields]) {
    if (op.kind === 'remove') {
      deleteAtAbsolutePath(doc, op.concretePath);
      appliedFields.push(op);
      continue;
    }
    setAtAbsolutePath(doc, op.concretePath, op.toValue);
    appliedFields.push(op);
  }

  return { doc, appliedFields, appliedElements, warnings };
}

export function getAtAbsolutePath(root: unknown, path: string): unknown {
  const segs = splitPath(path);
  let cur: unknown = root;
  for (const seg of segs) {
    if (Array.isArray(cur)) {
      const idx = resolveArrayIndex(cur, seg, false);
      if (idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function setAtAbsolutePath(root: unknown, path: string, value: unknown): boolean {
  const segs = splitPath(path);
  if (!segs.length) return false;
  let cur: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const next = segs[i + 1];
    if (Array.isArray(cur)) {
      const idx = resolveArrayIndex(cur, seg, true);
      if (idx < 0) return false;
      if (cur[idx] === undefined) cur[idx] = shouldCreateArray(next) ? [] : {};
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return false;
    const rec = cur as Record<string, unknown>;
    if (rec[seg] === undefined) rec[seg] = shouldCreateArray(next) ? [] : {};
    cur = rec[seg];
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) {
    const idx = resolveArrayIndex(cur, last, true);
    if (idx < 0) return false;
    cur[idx] = value;
    return true;
  }
  if (!cur || typeof cur !== 'object') return false;
  (cur as Record<string, unknown>)[last] = value;
  return true;
}

export function deleteAtAbsolutePath(root: unknown, path: string): boolean {
  const segs = splitPath(path);
  if (!segs.length) return false;
  let cur: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (Array.isArray(cur)) {
      const idx = resolveArrayIndex(cur, seg, false);
      if (idx < 0 || idx >= cur.length) return false;
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[seg];
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(cur)) {
    const idx = resolveArrayIndex(cur, last, false);
    if (idx < 0 || idx >= cur.length) return false;
    cur.splice(idx, 1);
    return true;
  }
  if (!cur || typeof cur !== 'object') return false;
  delete (cur as Record<string, unknown>)[last];
  return true;
}

export function ensureArrayAtAbsolutePath(root: unknown, path: string): unknown[] | null {
  const segs = splitPath(path);
  if (!segs.length) return Array.isArray(root) ? root : null;
  let cur: unknown = root;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const next = segs[i + 1];
    const isLast = i === segs.length - 1;
    if (Array.isArray(cur)) {
      const idx = resolveArrayIndex(cur, seg, true);
      if (idx < 0) return null;
      if (cur[idx] === undefined) cur[idx] = isLast || shouldCreateArray(next) ? [] : {};
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return null;
    const rec = cur as Record<string, unknown>;
    if (rec[seg] === undefined) rec[seg] = isLast || shouldCreateArray(next) ? [] : {};
    cur = rec[seg];
  }
  return Array.isArray(cur) ? cur : null;
}

export function smallestUnusedIndex(arr: unknown[]): number {
  const used = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== undefined) used.add(i);
  }
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

function resolveArrayIndex(arr: unknown[], seg: string, create: boolean): number {
  if (/^\d+$/.test(seg)) return Number(seg);
  if (seg === '[]') return create ? smallestUnusedIndex(arr) : -1;

  const guid = seg.match(/^#(.+)$/)?.[1];
  if (guid) {
    const hit = findArrayIndexByGuid(arr, guid);
    if (hit >= 0) return hit;
    if (!create) return -1;
    const idx = smallestUnusedIndex(arr);
    arr[idx] = { Id: guid };
    return idx;
  }

  const typed = seg.match(/^@([^:]+):(\d+)$/);
  if (typed) {
    const typeName = typed[1];
    const hint = Number(typed[2]);
    const matches = findArrayIndexesByType(arr, typeName);
    if (hint < matches.length) return matches[hint];
    if (!create) return -1;
    const idx = smallestUnusedIndex(arr);
    arr[idx] = { $type: typeName };
    return idx;
  }

  return -1;
}

function findArrayIndexByGuid(arr: unknown[], guid: string): number {
  for (let i = 0; i < arr.length; i++) {
    const rec = asRecord(arr[i]);
    if (!rec) continue;
    for (const key of ID_KEYS) {
      if (rec[key] === guid) return i;
    }
  }
  return -1;
}

function findArrayIndexesByType(arr: unknown[], typeName: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const rec = asRecord(arr[i]);
    const t = rec?.$type;
    if (typeof t !== 'string') continue;
    if (t.split(',')[0] === typeName) out.push(i);
  }
  return out;
}

function shouldCreateArray(next: string | undefined): boolean {
  if (!next) return false;
  return /^\d+$/.test(next) || next === '[]' || next.startsWith('#') || next.startsWith('@');
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return structuredClone(value);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
