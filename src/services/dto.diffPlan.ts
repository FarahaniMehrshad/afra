import type { ElementOp, FieldOp, OperationPlan, VariantOperationPlan } from '@/types/convert';
import type { UiFieldEntry } from '@/types/impact';
import type { Variant } from '@/types/journey';
import {
  flattenLeaves,
  toRelativeConcreteSegments,
  toRelativeSegments,
} from '@/services/impactDto.paths';

interface BuildDtoDiffPlanInput {
  dto: unknown;
  wpfDoc: unknown;
  exeDoc: unknown;
  wpfEntries: UiFieldEntry[];
  exeEntries: UiFieldEntry[];
}

interface ElementBucket {
  parentRel: string[];
  parentAbs: string[];
  elementRel: string[];
  indexSeg: string;
  templateEntry: UiFieldEntry;
  fieldIndexes: number[];
  states: Array<{ dtoPresent: boolean; basePresent: boolean }>;
}

interface BaseLeaf {
  relSegs: string[];
  absSegs: string[];
  value: unknown;
}

export function buildDtoDiffPlan(input: BuildDtoDiffPlanInput): OperationPlan {
  const warnings: string[] = [];
  const wpf = buildVariantPlan('wpf', input.dto, input.wpfDoc, input.wpfEntries, warnings);
  const exe = buildVariantPlan('exe', input.dto, input.exeDoc, input.exeEntries, warnings);
  return { wpf, exe, warnings };
}

function buildVariantPlan(
  variant: Variant,
  dto: unknown,
  baseDoc: unknown,
  entries: UiFieldEntry[],
  warnings: string[],
): VariantOperationPlan {
  const fields: FieldOp[] = [];
  const elements: ElementOp[] = [];
  const basePrefix = detectPrimaryPrefix(baseDoc);
  const dtoLeaves = flattenLeaves(dto);
  const baseLeaves = flattenBaseLeaves(baseDoc);
  const elementBuckets = new Map<string, ElementBucket>();

  if (!dto || typeof dto !== 'object') {
    warnings.push(variant + ': DTO root is not an object; no operations produced.');
    return { fields: [], elements: [] };
  }

  for (const entry of entries) {
    const canonRel = toRelativeSegments(entry.canonical);
    if (!canonRel.length) continue;
    // A canonical is only "in scope" for this DTO when the DTO contains the
    // subtree the canonical describes. Without this guard, canonicals that
    // merge:across dropped as duplicates (or entire variants whose root the
    // DTO doesn't use) would falsely report every base leaf as a delete.
    if (!isCanonicalCoveredByDto(dto, canonRel)) continue;

    const dtoHits = dtoLeaves.filter((leaf) => matchWildcard(leaf.segs, canonRel));
    const baseHits = baseLeaves.filter((leaf) => matchWildcard(leaf.relSegs, canonRel));

    const dtoByKey = new Map<string, { segs: string[]; value: unknown }>();
    for (const hit of dtoHits) dtoByKey.set(pathKey(hit.segs), hit);

    const baseByKey = new Map<string, BaseLeaf>();
    for (const hit of baseHits) baseByKey.set(pathKey(hit.relSegs), hit);

    const keys = new Set<string>([...dtoByKey.keys(), ...baseByKey.keys()]);
    for (const key of keys) {
      const dtoHit = dtoByKey.get(key);
      const baseHit = baseByKey.get(key);
      const dtoPresent = Boolean(dtoHit);
      const basePresent = Boolean(baseHit);

      let kind: FieldOp['kind'] | null = null;
      if (dtoPresent && !basePresent) kind = 'add';
      else if (!dtoPresent && basePresent) kind = 'remove';
      else if (dtoPresent && basePresent && !sameLeaf(dtoHit!.value, baseHit!.value)) kind = 'modify';
      if (!kind) continue;

      const relSegs = dtoHit?.segs ?? baseHit?.relSegs ?? [];
      const absSegs = baseHit?.absSegs ?? [...basePrefix, ...relSegs];
      const owner = owningElement(canonRel, relSegs);
      const opIdx = fields.length;

      fields.push({
        variant,
        seedCanonical: entry.canonical,
        seedVariantEntry: entry,
        kind,
        concretePath: toPath(absSegs),
        fromValue: baseHit ? (baseHit.value as unknown) : null,
        toValue: dtoHit ? (dtoHit.value as unknown) : null,
        elementParent: owner ? toPath([...basePrefix, ...owner.parentRel]) : undefined,
        elementIndex: owner?.indexSeg,
      });

      if (owner) {
        const bucketKey = owner.elementRel.join('/');
        const prev = elementBuckets.get(bucketKey);
        if (prev) {
          prev.states.push({ dtoPresent, basePresent });
          prev.fieldIndexes.push(opIdx);
        } else {
          elementBuckets.set(bucketKey, {
            parentRel: owner.parentRel,
            parentAbs: [...basePrefix, ...owner.parentRel],
            elementRel: owner.elementRel,
            indexSeg: owner.indexSeg,
            templateEntry: entry,
            fieldIndexes: [opIdx],
            states: [{ dtoPresent, basePresent }],
          });
        }
      }
    }
  }

  const promotedFieldIndexes = new Set<number>();
  for (const bucket of elementBuckets.values()) {
    if (!bucket.states.length) continue;
    const allAdd = bucket.states.every((s) => s.dtoPresent && !s.basePresent);
    const allRemove = bucket.states.every((s) => !s.dtoPresent && s.basePresent);
    if (!allAdd && !allRemove) continue;

    const indexNum = /^\d+$/.test(bucket.indexSeg) ? Number(bucket.indexSeg) : undefined;
    const dtoElement = allAdd ? getAtPath(dto, bucket.elementRel) : undefined;
    elements.push({
      variant,
      parentArrayPath: toPath(bucket.parentAbs),
      kind: allAdd ? 'add' : 'remove',
      templateEntry: bucket.templateEntry,
      mintedIndex: indexNum,
      dtoElement,
    });

    for (const idx of bucket.fieldIndexes) {
      if (fields[idx].kind === (allAdd ? 'add' : 'remove')) promotedFieldIndexes.add(idx);
    }
  }

  const filteredFields = fields.filter((_, i) => !promotedFieldIndexes.has(i));
  filteredFields.sort((a, b) => rankKind(a.kind) - rankKind(b.kind) || a.concretePath.localeCompare(b.concretePath));
  elements.sort((a, b) => a.parentArrayPath.localeCompare(b.parentArrayPath) || rankElementKind(a.kind) - rankElementKind(b.kind));

  if (!basePrefix.length && (filteredFields.length > 0 || elements.length > 0)) {
    warnings.push(
      variant +
        ': could not detect Plugins/Links root; absolute paths are emitted relative to document root.',
    );
  }

  return { fields: filteredFields, elements };
}

function flattenBaseLeaves(baseDoc: unknown): BaseLeaf[] {
  const out: BaseLeaf[] = [];
  for (const leaf of flattenLeaves(baseDoc)) {
    out.push({
      absSegs: leaf.segs,
      relSegs: toRelativeConcreteSegments(leaf.segs),
      value: leaf.value,
    });
  }
  return out;
}

function detectPrimaryPrefix(doc: unknown): string[] {
  const root = asRecord(doc);
  if (!root) return [];

  const board = asRecord(root.BoardModel);
  const plugins = asRecord(board?.Plugins ?? root.Plugins);
  const pluginValues = asArray(plugins?.$values);
  if (pluginValues.length) {
    const withBoard = Boolean(board && board.Plugins);
    return withBoard ? ['BoardModel', 'Plugins', '$values', '0'] : ['Plugins', '$values', '0'];
  }

  const links = asRecord(root.Links);
  const linkValues = asArray(links?.$values);
  if (linkValues.length) {
    const map = asRecord(asRecord(linkValues[0])?.Map);
    const mapValues = asArray(map?.$values);
    const source = asRecord(asRecord(mapValues[0])?.Source);
    if (source) return ['Links', '$values', '0', 'Map', '$values', '0', 'Source'];
  }

  return [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isCanonicalCoveredByDto(dto: unknown, canonRel: string[]): boolean {
  let cur: unknown = dto;
  for (let i = 0; i < canonRel.length; i++) {
    const seg = canonRel[i];
    const isLast = i === canonRel.length - 1;
    if (seg === '[]') {
      if (!Array.isArray(cur)) return false;
      if (isLast) return true;
      if (cur.length === 0) return true;
      cur = cur[0];
      continue;
    }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return false;
    const rec = cur as Record<string, unknown>;
    if (!(seg in rec)) return false;
    cur = rec[seg];
  }
  return true;
}

function matchWildcard(concrete: string[], canonical: string[]): boolean {
  if (concrete.length !== canonical.length) return false;
  for (let i = 0; i < canonical.length; i++) {
    if (canonical[i] === '[]') continue;
    if (canonical[i] !== concrete[i]) return false;
  }
  return true;
}

function sameLeaf(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pathKey(segs: string[]): string {
  return segs.join('/');
}

function toPath(segs: string[]): string {
  return '/' + segs.join('/');
}

function getAtPath(root: unknown, segs: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segs) {
    if (/^\d+$/.test(seg)) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(seg)];
      continue;
    }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function owningElement(
  canonicalRel: string[],
  concreteRel: string[],
): { parentRel: string[]; elementRel: string[]; indexSeg: string } | null {
  let arrIdx = -1;
  for (let i = canonicalRel.length - 1; i >= 0; i--) {
    if (canonicalRel[i] === '[]') {
      arrIdx = i;
      break;
    }
  }
  if (arrIdx < 0 || arrIdx >= concreteRel.length) return null;
  return {
    parentRel: concreteRel.slice(0, arrIdx),
    elementRel: concreteRel.slice(0, arrIdx + 1),
    indexSeg: concreteRel[arrIdx],
  };
}

function rankKind(kind: FieldOp['kind']): number {
  if (kind === 'modify') return 0;
  if (kind === 'add') return 1;
  return 2;
}

function rankElementKind(kind: ElementOp['kind']): number {
  return kind === 'remove' ? 0 : 1;
}
