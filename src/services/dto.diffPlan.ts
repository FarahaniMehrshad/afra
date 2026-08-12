import { ID_KEYS } from '@/constants';
import type { ElementOp, FieldOp, OperationPlan, VariantOperationPlan } from '@/types/convert';
import type { DerivedChange, UiFieldEntry } from '@/types/impact';
import type { Variant } from '@/types/journey';
import {
  flattenLeaves,
  matchingLeaves,
  setConcrete,
  toRelativeConcreteSegments,
  toRelativeSegments,
} from '@/services/impactDto.paths';

interface BuildDtoDiffPlanInput {
  dto: unknown;
  wpfDoc: unknown;
  exeDoc: unknown;
  wpfEntries: UiFieldEntry[];
  exeEntries: UiFieldEntry[];
  /**
   * merge:across entries; used to bridge a single DTO write on the representative
   * canonical to all sibling canonicals across both variants (e.g. WPF's
   * `TableCreatorParameter/Columns/[]/OutputTitle` and every EXE
   * `PluginCommands/.../Columns/[]/OutputTitle`).
   */
  acrossEntries: UiFieldEntry[];
  /**
   * Cap for history carry-over: only replay derived MODIFY events recorded at
   * step ≤ maxStep. The Testing harness knows the "expected" step and passes
   * it so we don't apply modifies from steps after the target (which would
   * over-shoot the answer). Production ("Apply DTO") leaves it undefined; then
   * we take the LATEST recorded modify per canonical, which is the closest
   * approximation to "current state of the world".
   */
  maxStep?: number;
}

/** Per-variant sibling scopes keyed by representative element scope canonical. */
type SiblingBridge = Map<string, { wpf: Set<string>; exe: Set<string> }>;

/** Per-variant sibling canonicals keyed by representative leaf canonical. */
type CanonicalBridge = Map<string, { wpf: Set<string>; exe: Set<string> }>;

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
  const bridge = buildSiblingBridge(input.acrossEntries);
  const canonicalBridge = buildCanonicalBridge(input.acrossEntries);
  const wpf = buildVariantPlan('wpf', input.dto, input.wpfDoc, input.wpfEntries, warnings);
  const exe = buildVariantPlan('exe', input.dto, input.exeDoc, input.exeEntries, warnings);

  // The rep-shaped walk above only covers the sibling canonical whose relative
  // path structurally matches the DTO. To realise the merge:across contract we
  // fanout every ADD element bucket to sibling scopes in both variants, using
  // per-variant entries as templates so derived replay knows what to backfill.
  // Each fanout op also carries a sibling-shaped `dtoElement` seeded from the
  // rep DTO subtree so the value-hint in derived replay picks the right step.
  const seedAdds = [...wpf.elements, ...exe.elements].filter((op) => op.kind === 'add');
  fanoutAdds({
    seedAdds,
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    targetEntries: input.wpfEntries,
    bridge,
    canonicalBridge,
    acrossEntries: input.acrossEntries,
  });
  fanoutAdds({
    seedAdds,
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    targetEntries: input.exeEntries,
    bridge,
    canonicalBridge,
    acrossEntries: input.acrossEntries,
  });

  // Element REMOVEs need the same cross-variant fanout that ADDs get.
  // Without it, deleting a row/column in WPF removes only the WPF entry;
  // EXE's mirror keeps the stale element and every downstream leaf drifts
  // (step 12→13 leaves EXE Rows[2] with the Isfahan row still populated).
  // We reuse the same rep→sibling bridge as ADDs and translate the seed
  // index onto every sibling's outer array — element ordering is assumed
  // to be structurally aligned between merge:across siblings, which is the
  // same assumption `fanoutModifies` already relies on.
  const seedRemoves = [...wpf.elements, ...exe.elements].filter((op) => op.kind === 'remove');
  fanoutRemoves({
    seedRemoves,
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    targetEntries: input.wpfEntries,
    bridge,
  });
  fanoutRemoves({
    seedRemoves,
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    targetEntries: input.exeEntries,
    bridge,
  });

  // MODIFY field ops on a merge:across rep canonical (e.g. renaming
  // `InputFields.Title` from "City" to "CityName") must project the new value
  // onto every sibling leaf the merge cluster proved equivalent
  // (`OutputTitle`, `Caption`, `Links.Source.Fields.Title`, EXE mirrors, etc.).
  // Without this fanout the initial per-variant walk skips those siblings —
  // their canonicals aren't structurally covered by the DTO shape — and the
  // rename never propagates.
  const seedModifies = [...wpf.fields, ...exe.fields].filter((op) => op.kind === 'modify');
  fanoutModifies({
    seedModifies,
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    targetEntries: input.wpfEntries,
    canonicalBridge,
  });
  fanoutModifies({
    seedModifies,
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    targetEntries: input.exeEntries,
    canonicalBridge,
  });

  // Field-level ADDs and REMOVEs happen when scalar cells are appended to
  // or truncated from an existing container (e.g. step 14→15 adds
  // `Rows/i/3 = null` to every existing row because a Guid column was
  // appended; step 13→14 removes the same cell after the column is deleted).
  // `fanoutModifies` skips these, and `fanoutAdds`/`fanoutRemoves` are
  // element-level, so without this we'd touch WPF only and leave every EXE
  // row a column short (or long). We walk the sibling canonical up to (but
  // not including) the trailing wildcard run, resolve those container paths
  // in the target doc, then append the seed's trailing indices.
  const seedFieldAdds = [...wpf.fields, ...exe.fields].filter((op) => op.kind === 'add');
  fanoutFieldAddsOrRemoves({
    seedOps: seedFieldAdds,
    seedKind: 'add',
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    targetEntries: input.wpfEntries,
    canonicalBridge,
  });
  fanoutFieldAddsOrRemoves({
    seedOps: seedFieldAdds,
    seedKind: 'add',
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    targetEntries: input.exeEntries,
    canonicalBridge,
  });
  const seedFieldRemoves = [...wpf.fields, ...exe.fields].filter((op) => op.kind === 'remove');
  fanoutFieldAddsOrRemoves({
    seedOps: seedFieldRemoves,
    seedKind: 'remove',
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    targetEntries: input.wpfEntries,
    canonicalBridge,
  });
  fanoutFieldAddsOrRemoves({
    seedOps: seedFieldRemoves,
    seedKind: 'remove',
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    targetEntries: input.exeEntries,
    canonicalBridge,
  });

  // History carry-over. The DTO can only express fields merge:across elevated
  // to seed status; nested "UI-default" leaves (e.g. `TrimType.Title`) live
  // outside its expressive power. When the UI history shows those leaves
  // consistently getting modified as a side-effect of a step-op, apply the
  // recorded `.to` value onto base's matching concrete leaf. The applier
  // already resolves `#GUID` / `@Type:i` segments so we just hand it the
  // historical path and let it locate the numeric index in base.
  applyHistoryCarryover({
    variantEntries: input.wpfEntries,
    targetVariant: 'wpf',
    targetDoc: input.wpfDoc,
    targetPlan: wpf,
    maxStep: input.maxStep,
  });
  applyHistoryCarryover({
    variantEntries: input.exeEntries,
    targetVariant: 'exe',
    targetDoc: input.exeDoc,
    targetPlan: exe,
    maxStep: input.maxStep,
  });

  wpf.fields.sort(
    (a, b) => rankKind(a.kind) - rankKind(b.kind) || a.concretePath.localeCompare(b.concretePath),
  );
  exe.fields.sort(
    (a, b) => rankKind(a.kind) - rankKind(b.kind) || a.concretePath.localeCompare(b.concretePath),
  );

  wpf.elements.sort(
    (a, b) =>
      a.parentArrayPath.localeCompare(b.parentArrayPath) || rankElementKind(a.kind) - rankElementKind(b.kind),
  );
  exe.elements.sort(
    (a, b) =>
      a.parentArrayPath.localeCompare(b.parentArrayPath) || rankElementKind(a.kind) - rankElementKind(b.kind),
  );

  // #region agent log
  try {
    fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '26b876' },
      body: JSON.stringify({
        sessionId: '26b876',
        runId: 'seeded-fanout',
        location: 'dto.diffPlan.ts:buildDtoDiffPlan',
        message: 'post-fanout element summary',
        data: {
          wpfElements: wpf.elements.map((op) => ({
            kind: op.kind,
            parent: op.parentArrayPath,
            templateCanonical: op.templateEntry.canonical,
            dtoElementKeys:
              op.dtoElement && typeof op.dtoElement === 'object'
                ? summarizeShape(op.dtoElement)
                : null,
          })),
          exeElements: exe.elements.map((op) => ({
            kind: op.kind,
            parent: op.parentArrayPath,
            templateCanonical: op.templateEntry.canonical,
            dtoElementKeys:
              op.dtoElement && typeof op.dtoElement === 'object'
                ? summarizeShape(op.dtoElement)
                : null,
          })),
          wpfFieldOps: wpf.fields.map((op) => ({
            kind: op.kind,
            path: op.concretePath,
            from: summarizeLiteral(op.fromValue),
            to: summarizeLiteral(op.toValue),
          })),
          exeFieldOps: exe.fields.map((op) => ({
            kind: op.kind,
            path: op.concretePath,
            from: summarizeLiteral(op.fromValue),
            to: summarizeLiteral(op.toValue),
          })),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {}
  // #endregion

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
    const covered = isCanonicalCoveredByDto(dto, canonRel);
    if (!covered) continue;

    const dtoHits = dtoLeaves.filter((leaf) => matchWildcard(leaf.segs, canonRel));
    const baseHits = baseLeaves.filter((leaf) => matchWildcard(leaf.relSegs, canonRel));

    // The doc may host this canonical on any plugin — e.g. `InputFields`
    // lives on the field-mapping plugin, not the TableCreator plugin that
    // `detectPrimaryPrefix` picks. Reuse the plugin/link prefix from an
    // existing base leaf so add-ops don't drop the new element on the wrong
    // plugin. Only fall back to the primary prefix when base has zero
    // evidence for this canonical.
    const entryPrefix = deriveCanonicalAbsPrefix(baseHits) ?? basePrefix;

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
      const absSegs = baseHit?.absSegs ?? [...entryPrefix, ...relSegs];
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
        elementParent: owner ? toPath([...entryPrefix, ...owner.parentRel]) : undefined,
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
            parentAbs: [...entryPrefix, ...owner.parentRel],
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

    // Scalar-array-of-arrays cross-check. A row bucket only records CELLS
    // THAT DIFFER (matching cells are `if (!kind) continue`'d upstream), so
    // "all recorded cells are ADD" can mean either "the whole row is new"
    // or "we just appended a cell to an already-present row" — like step
    // 14→15 (add-guid-column) where Rows/0's only diff cell is `/3=null`
    // while cells `/0../2` already match. Promoting that to a whole-row ADD
    // would duplicate the row. Only promote when the OTHER side lacks the
    // row entirely; otherwise keep the per-cell field ops so the applier
    // extends/truncates the existing row in place via `setAtAbsolutePath`.
    const canonSegs = bucket.templateEntry.canonical.split('/').filter(Boolean);
    const isScalarArrayOfArrays =
      canonSegs.length >= 2 &&
      canonSegs[canonSegs.length - 1] === '[]' &&
      canonSegs[canonSegs.length - 2] === '[]';
    if (isScalarArrayOfArrays) {
      const baseRow = getAtPath(baseDoc, [...bucket.parentAbs, bucket.indexSeg]);
      const dtoRow = getAtPath(dto, bucket.elementRel);
      if (allAdd && Array.isArray(baseRow)) continue;
      if (allRemove && Array.isArray(dtoRow)) continue;
    }

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

/**
 * Given a set of base leaves that all share the same canonical shape, return
 * the absolute prefix (plugin/link segments) they live under. All hits share
 * this prefix because they matched the same canonical wildcards, so we can
 * just take the first one and strip the canonical-relative tail. Returns
 * null when there is no evidence to infer from.
 */
function deriveCanonicalAbsPrefix(baseHits: BaseLeaf[]): string[] | null {
  const first = baseHits[0];
  if (!first) return null;
  const prefixLen = first.absSegs.length - first.relSegs.length;
  if (prefixLen <= 0) return null;
  return first.absSegs.slice(0, prefixLen);
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
  // Scalar-array-of-arrays (`Table.Rows/[]/[]`): the innermost `[]` is the
  // CELL index — but the "element" that gets added/removed as a unit is the
  // whole ROW (the outer `[]`). Bucketing per-cell produces 4 remove ops
  // per row, which empty the row's contents but leave `Rows[i] = []` behind
  // (and orphaned empties shift every intended index). Walk one wildcard up
  // so the row is the owning element, giving us one ADD-row / REMOVE-row op
  // and per-cell field MODIFYs when only some cells change.
  if (
    arrIdx > 0 &&
    canonicalRel[arrIdx - 1] === '[]' &&
    arrIdx - 1 < concreteRel.length
  ) {
    arrIdx = arrIdx - 1;
  }
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

/**
 * Aggregate rep-element-scope → per-variant sibling element scopes from
 * merge:across occurrences. Rep is registered as its own sibling on its native
 * variant so lookups need only consult this map.
 */
function buildSiblingBridge(acrossEntries: UiFieldEntry[]): SiblingBridge {
  const bridge: SiblingBridge = new Map();
  for (const entry of acrossEntries) {
    const repScope = elementScopeOf(entry.canonical);
    if (!repScope) continue;
    let bucket = bridge.get(repScope);
    if (!bucket) {
      bucket = { wpf: new Set(), exe: new Set() };
      bridge.set(repScope, bucket);
    }
    bucket[entry.variant].add(repScope);
    for (const kind of ['add', 'remove', 'modify'] as const) {
      for (const occ of entry.byKind[kind]) {
        if (!occ.mergesFrom) continue;
        for (const sib of occ.mergesFrom) {
          const sibScope = elementScopeOf(sib.canonical);
          if (!sibScope) continue;
          bucket[sib.variant].add(sibScope);
        }
      }
    }
  }
  return bridge;
}

/**
 * Aggregate rep leaf canonicals → per-variant sibling leaf canonicals from
 * merge:across occurrences. Used to project a rep DTO value onto every
 * variant-specific sibling that the merge cluster proved to be equivalent.
 */
function buildCanonicalBridge(acrossEntries: UiFieldEntry[]): CanonicalBridge {
  const bridge: CanonicalBridge = new Map();
  for (const entry of acrossEntries) {
    const bucket = { wpf: new Set<string>(), exe: new Set<string>() };
    bucket[entry.variant].add(entry.canonical);
    for (const kind of ['add', 'remove', 'modify'] as const) {
      for (const occ of entry.byKind[kind]) {
        if (!occ.mergesFrom) continue;
        for (const sib of occ.mergesFrom) {
          bucket[sib.variant].add(sib.canonical);
        }
      }
    }
    // Map every canonical in the cluster to the same bucket. Without the
    // reverse mapping, `fanoutModifies` can only find siblings when the seed
    // happens to be the rep — an EXE-rep cluster would leave the WPF-side
    // modify unable to project onto its EXE siblings.
    for (const canonical of new Set([...bucket.wpf, ...bucket.exe])) {
      const existing = bridge.get(canonical);
      if (existing) {
        for (const c of bucket.wpf) existing.wpf.add(c);
        for (const c of bucket.exe) existing.exe.add(c);
      } else {
        bridge.set(canonical, bucket);
      }
    }
  }
  return bridge;
}

interface FanoutInput {
  seedAdds: ElementOp[];
  targetVariant: Variant;
  targetDoc: unknown;
  targetPlan: VariantOperationPlan;
  targetEntries: UiFieldEntry[];
  bridge: SiblingBridge;
  canonicalBridge: CanonicalBridge;
  acrossEntries: UiFieldEntry[];
}

interface FanoutModifyInput {
  seedModifies: FieldOp[];
  targetVariant: Variant;
  targetDoc: unknown;
  targetPlan: VariantOperationPlan;
  targetEntries: UiFieldEntry[];
  canonicalBridge: CanonicalBridge;
}

/**
 * Project a MODIFY seed onto every sibling leaf the merge:across cluster
 * proved equivalent. The seed is scoped by its trailing array index (the
 * "column index" in our rename case) — sibling leaves in the target doc are
 * only touched if their own trailing index matches, so renaming column 0
 * doesn't accidentally rewrite column 1's Caption. Duplicate emits (same
 * abs path already planned) and no-op emits (leaf already equals the new
 * value) are dropped.
 */
interface FanoutFieldAddOrRemoveInput {
  seedOps: FieldOp[];
  seedKind: 'add' | 'remove';
  targetVariant: Variant;
  targetDoc: unknown;
  targetPlan: VariantOperationPlan;
  targetEntries: UiFieldEntry[];
  canonicalBridge: CanonicalBridge;
}

/**
 * Companion to {@link fanoutModifies} for kind='add' and kind='remove'
 * field ops. `fanoutModifies` relies on `matchingLeaves` to locate an
 * existing sibling leaf and rewrite it, but ADDs by definition don't exist
 * in the target doc yet, and after a REMOVE the leaf is already gone —
 * both cases need positional extrapolation. We strip the trailing wildcard
 * run from the sibling canonical, resolve those container paths in the
 * target doc, and append the seed's trailing concrete indices. Step 14→15
 * relies on the ADD path (Guid column appended to every existing row) and
 * step 13→14 relies on the REMOVE path (deleted column shrinks every row).
 */
function fanoutFieldAddsOrRemoves(input: FanoutFieldAddOrRemoveInput): void {
  const {
    seedOps,
    seedKind,
    targetVariant,
    targetDoc,
    targetPlan,
    targetEntries,
    canonicalBridge,
  } = input;

  const covered = new Set(targetPlan.fields.map((f) => f.kind + '\u0000' + f.concretePath));
  const entryByCanonical = new Map(targetEntries.map((e) => [e.canonical, e] as const));

  for (const seed of seedOps) {
    if (seed.kind !== seedKind) continue;
    const bucket = canonicalBridge.get(seed.seedCanonical);
    if (!bucket) continue;

    const seedTrailing = trailingConsecutiveWildcards(seed.seedCanonical, seed.concretePath);
    if (!seedTrailing) continue;

    for (const siblingCanonical of bucket[targetVariant]) {
      if (seed.variant === targetVariant && siblingCanonical === seed.seedCanonical) continue;

      const targetEntry = entryByCanonical.get(siblingCanonical);
      if (!targetEntry) continue;

      const sibCanonSegs = siblingCanonical.split('/').filter(Boolean);
      let sibTrailingCount = 0;
      for (let i = sibCanonSegs.length - 1; i >= 0 && sibCanonSegs[i] === '[]'; i--) sibTrailingCount++;
      if (sibTrailingCount === 0) continue;

      // Match on the shorter trailing run so canonicals of different
      // wildcard depths still line up on their innermost indices.
      const matchN = Math.min(seedTrailing.length, sibTrailingCount);
      const outerSegs = sibCanonSegs.slice(0, sibCanonSegs.length - matchN);
      const outerCanonical = '/' + outerSegs.join('/');

      const outerPaths = resolveCanonicalContainerPaths(targetDoc, outerCanonical);
      const tail = seedTrailing.slice(seedTrailing.length - matchN).join('/');
      for (const outer of outerPaths) {
        const concretePath = outer + '/' + tail;
        const key = seedKind + '\u0000' + concretePath;
        if (covered.has(key)) continue;
        covered.add(key);
        targetPlan.fields.push({
          variant: targetVariant,
          seedCanonical: siblingCanonical,
          seedVariantEntry: targetEntry,
          kind: seedKind,
          concretePath,
          fromValue: seedKind === 'remove' ? seed.fromValue : null,
          toValue: seedKind === 'add' ? seed.toValue : null,
        });
      }
    }
  }
}

function fanoutModifies(input: FanoutModifyInput): void {
  const { seedModifies, targetVariant, targetDoc, targetPlan, targetEntries, canonicalBridge } =
    input;

  const targetLeaves = flattenLeaves(targetDoc);
  const covered = new Set(
    targetPlan.fields.map((f) => f.kind + '\u0000' + f.concretePath),
  );
  const entryByCanonical = new Map(targetEntries.map((e) => [e.canonical, e] as const));

  for (const seed of seedModifies) {
    if (seed.kind !== 'modify') continue;
    const bucket = canonicalBridge.get(seed.seedCanonical);
    if (!bucket) continue;

    // For scalar-array-of-arrays leaves like `Table.Rows/[]/[]` the seed
    // carries BOTH a row index AND a cell index, and both must match on
    // the sibling; matching on the last wildcard only (the cell index)
    // fanned Mashhad's row-1 edit onto every row at column c, silently
    // overwriting Tehran's value. `trailingConsecutiveWildcards` grabs the
    // full trailing `[]` run; single-wildcard leaves (columns/plugins/etc.)
    // still get one-index matching, so this generalises without regressing.
    const seedTrailing = trailingConsecutiveWildcards(seed.seedCanonical, seed.concretePath);
    if (!seedTrailing) continue;

    for (const siblingCanonical of bucket[targetVariant]) {
      if (seed.variant === targetVariant && siblingCanonical === seed.seedCanonical) continue;

      const targetEntry = entryByCanonical.get(siblingCanonical);
      if (!targetEntry) continue;

      const sibCanonSegs = siblingCanonical.split('/').filter(Boolean);
      const sibLastArr = lastWildcardIndex(sibCanonSegs);
      if (sibLastArr < 0) continue;

      // Sibling's own trailing wildcard run — cap the match count at the
      // smaller of the two so scalar-vs-scalar canonicals with mismatched
      // depths still line up on their innermost indices.
      let sibTrailingCount = 0;
      for (let i = sibLastArr; i >= 0 && sibCanonSegs[i] === '[]'; i--) sibTrailingCount++;
      const matchN = Math.min(seedTrailing.length, sibTrailingCount);

      const sibLeaves = matchingLeaves(targetLeaves, sibCanonSegs);
      for (const leaf of sibLeaves) {
        let matches = true;
        for (let k = 0; k < matchN; k++) {
          const seedVal = seedTrailing[seedTrailing.length - 1 - k];
          const leafVal = leaf.segs[sibLastArr - k];
          if (seedVal !== leafVal) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        if (sameLeaf(leaf.value, seed.toValue)) continue;

        const concretePath = '/' + leaf.segs.join('/');
        const key = 'modify\u0000' + concretePath;
        if (covered.has(key)) continue;

        const elementParent = '/' + leaf.segs.slice(0, sibLastArr).join('/');
        const elementIndex = leaf.segs[sibLastArr];

        targetPlan.fields.push({
          variant: targetVariant,
          seedCanonical: siblingCanonical,
          seedVariantEntry: targetEntry,
          kind: 'modify',
          concretePath,
          fromValue: leaf.value,
          toValue: seed.toValue,
          elementParent,
          elementIndex,
        });
        covered.add(key);
      }
    }
  }
}

/**
 * Return the concrete indices at each `[]` in the trailing consecutive
 * wildcard run — `.../Rows/[]/[]` with `.../Rows/1/2` yields `["1", "2"]`,
 * while `.../Columns/$values/[]/Title` with `.../Columns/$values/3/Title`
 * yields `["3"]` (only the run at the tail counts; intermediate wildcards
 * separated by fixed fields are not included).
 */
function trailingConsecutiveWildcards(
  canonical: string,
  concretePath: string,
): string[] | null {
  const canonSegs = canonical.split('/').filter(Boolean);
  const concreteSegs = concretePath.split('/').filter(Boolean);
  if (canonSegs.length !== concreteSegs.length) return null;
  const last = lastWildcardIndex(canonSegs);
  if (last < 0) return null;
  const out: string[] = [];
  for (let i = last; i >= 0 && canonSegs[i] === '[]'; i--) {
    out.unshift(concreteSegs[i]);
  }
  return out;
}

function lastWildcardIndex(canonSegs: string[]): number {
  for (let i = canonSegs.length - 1; i >= 0; i--) {
    if (canonSegs[i] === '[]') return i;
  }
  return -1;
}

interface HistoryCarryoverInput {
  variantEntries: UiFieldEntry[];
  targetVariant: Variant;
  targetDoc: unknown;
  targetPlan: VariantOperationPlan;
  maxStep: number | undefined;
}

/**
 * Emit modify field ops for derived MODIFY events recorded in the UI history
 * whose canonical the DTO doesn't express. The applier already knows how to
 * translate `#GUID` / `@Type:i` segments in a concrete path back to numeric
 * indices, so the recorded path is resolved directly against `targetDoc` —
 * if the entity still exists in base the modify lands, otherwise it's a
 * no-op. We keep only the latest event per (variant, resolved-path) so
 * competing modifies from later steps don't fight each other, and skip any
 * path already touched by an earlier plan pass so DTO-specified values and
 * fanned-out modifies aren't clobbered.
 */
function applyHistoryCarryover(input: HistoryCarryoverInput): void {
  const { variantEntries, targetVariant, targetDoc, targetPlan, maxStep } = input;

  const covered = new Set<string>();
  for (const f of targetPlan.fields) covered.add(f.concretePath);
  const elementCoverPrefixes = new Set<string>();
  for (const el of targetPlan.elements) {
    if (el.kind !== 'add' || !Number.isInteger(el.mintedIndex)) continue;
    elementCoverPrefixes.add(el.parentArrayPath + '/' + el.mintedIndex + '/');
  }

  // Latest event per resolved path: dedup by path, keep highest .event.i.
  interface Candidate {
    entry: UiFieldEntry;
    derived: DerivedChange;
    resolvedPath: string;
    currentValue: unknown;
    toValue: unknown;
  }
  const byPath = new Map<string, Candidate>();

  for (const entry of variantEntries) {
    for (const kind of ['add', 'remove', 'modify'] as const) {
      for (const occ of entry.byKind[kind]) {
        for (const derived of occ.derived) {
          if (derived.variant !== targetVariant) continue;
          if (derived.event.st !== 'modify') continue;
          if (maxStep !== undefined && derived.event.i > maxStep) continue;

          const resolved = resolveHistoricalPathInDoc(targetDoc, derived.path);
          if (!resolved) continue;
          if (covered.has(resolved.path)) continue;
          if (isUnderPrefix(resolved.path, elementCoverPrefixes)) continue;

          const toValue = parseLiteral(derived.event.to);
          if (toValue === undefined) continue;
          if (sameLeaf(resolved.value, toValue)) continue;

          const existing = byPath.get(resolved.path);
          if (existing && existing.derived.event.i >= derived.event.i) continue;

          byPath.set(resolved.path, {
            entry,
            derived,
            resolvedPath: resolved.path,
            currentValue: resolved.value,
            toValue,
          });
        }
      }
    }
  }

  for (const c of byPath.values()) {
    targetPlan.fields.push({
      variant: targetVariant,
      seedCanonical: canonicalizeSimple(c.derived.path),
      seedVariantEntry: c.entry,
      kind: 'modify',
      concretePath: c.resolvedPath,
      fromValue: c.currentValue,
      toValue: c.toValue,
    });
    covered.add(c.resolvedPath);
  }
}

/**
 * Walk `doc` following `historicalPath`, translating `#GUID` / `@Type:i`
 * array-item segments into numeric indices as we go. Returns the numeric-
 * indexed path plus the leaf value at the end, or `null` if any segment
 * can't be resolved (the entity doesn't exist in this doc, or the shape
 * diverges).
 */
function resolveHistoricalPathInDoc(
  doc: unknown,
  historicalPath: string,
): { path: string; value: unknown } | null {
  const segs = historicalPath.split('/').filter(Boolean);
  if (!segs.length) return null;

  const out: string[] = [];
  let cur: unknown = doc;
  for (const seg of segs) {
    if (Array.isArray(cur)) {
      const idx = resolveArrayIndexForSeg(cur, seg);
      if (idx < 0) return null;
      out.push(String(idx));
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return null;
    out.push(seg);
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return null;
  }
  return { path: '/' + out.join('/'), value: cur };
}

function resolveArrayIndexForSeg(arr: unknown[], seg: string): number {
  if (/^\d+$/.test(seg)) {
    const idx = Number(seg);
    return idx >= 0 && idx < arr.length ? idx : -1;
  }
  const guid = seg.match(/^#(.+)$/)?.[1];
  if (guid) {
    for (let i = 0; i < arr.length; i++) {
      const rec = arr[i];
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
      const record = rec as Record<string, unknown>;
      for (const key of ID_KEYS) {
        if (record[key] === guid) return i;
      }
    }
    return -1;
  }
  const typed = seg.match(/^@([^:]+):(\d+)$/);
  if (typed) {
    // itemKey in ir.service.ts encodes `@Type:<positional-index>` — the
    // number is the array index, NOT the ordinal of Nth typed match. So
    // verify position `pos` exists and has the recorded `$type`, then
    // return `pos`. Interpreting the number as an ordinal breaks whenever
    // the element list has non-Type siblings before it (e.g. EXE's
    // `ExecutionCommands = [PluginActionCommand@0, MethodCommand@1]` has
    // one MethodCommand at position 1; ordinal-1 look-up finds none and
    // silently drops the carry-over).
    const typeName = typed[1];
    const pos = Number(typed[2]);
    if (pos < 0 || pos >= arr.length) return -1;
    const rec = arr[pos];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return -1;
    const t = (rec as Record<string, unknown>).$type;
    if (typeof t !== 'string') return -1;
    if (t.split(',')[0] !== typeName) return -1;
    return pos;
  }
  return -1;
}

function isUnderPrefix(path: string, prefixes: Set<string>): boolean {
  for (const p of prefixes) {
    if (path.startsWith(p)) return true;
  }
  return false;
}

function parseLiteral(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function canonicalizeSimple(path: string): string {
  return path.replace(/\/(?:#[^/]+|@[^/]+|\d+)(?=\/|$)/g, '/[]');
}

function fanoutAdds(input: FanoutInput): void {
  const {
    seedAdds,
    targetVariant,
    targetDoc,
    targetPlan,
    targetEntries,
    bridge,
    canonicalBridge,
    acrossEntries,
  } = input;

  for (const seed of seedAdds) {
    const repScope = elementScopeOf(seed.templateEntry.canonical);
    if (!repScope) continue;
    const repParentCanonical = parentOfElementScope(repScope);
    if (!repParentCanonical) continue;
    const bucket = bridge.get(repScope);
    if (!bucket) continue;

    // Enumerate every rep-leaf under this rep element scope that we might
    // be able to project. A leaf is "in scope" when it lives beneath the
    // rep element scope in canonical form.
    const repLeavesInScope = acrossEntries.filter((e) =>
      e.canonical.startsWith(repScope + '/'),
    );

    // Dedup per SEED. Cross-seed collisions are legitimate — three
    // add-row seeds must produce three ops at the same outer Rows array so
    // the applier's `smallestUnusedIndex` walk can append all three. Within
    // a single seed, however, `resolveSiblingParentWithContext` and its
    // fallback can overlap, so we still need to prevent the same seed from
    // pushing twice at the same parentPath.
    const perSeedCovered = new Set<string>();

    for (const siblingScope of bucket[targetVariant]) {
      const siblingParentCanonical = parentOfElementScope(siblingScope);
      if (!siblingParentCanonical) continue;

      // Same-variant + same-scope = the seed itself; the rep bucket
      // already emitted an ElementOp with a full DTO subtree there.
      if (seed.variant === targetVariant && siblingScope === repScope) continue;

      // Scalar-array-of-arrays (siblingParentCanonical ends in `/[]`, e.g.
      // `Table.Rows/[]`): the "element" is a whole row and `owningElement`
      // walks one wildcard up in buildVariantPlan, so `seed.parentArrayPath`
      // is already the OUTER `Rows` array. Resolve grandparent = outer array
      // and let the applier's `smallestUnusedIndex` append the row.
      // `resolveCanonicalArrayPaths(.../Rows/[])` would either return
      // nothing (outer empty) or existing row slots (silently dropping the
      // new row onto Row 0), so we skip it entirely here.
      const scalarArrayOfArrays = siblingParentCanonical.endsWith('/[]');
      let parentPaths: string[];
      if (scalarArrayOfArrays) {
        const grandParent = stripTrailingWildcard(siblingParentCanonical);
        parentPaths = grandParent ? resolveCanonicalArrayPaths(targetDoc, grandParent) : [];
      } else if (seed.variant === targetVariant) {
        // When the seed lives in the same variant, its concrete parent path
        // pins down the shared canonical prefix so we don't fan out into
        // unrelated array indices (e.g. a second Plugin that isn't the one
        // the user is editing). If the sibling doesn't live under that same
        // plugin (context-pin returns nothing), fall back to a doc-wide walk
        // so we still find it — but only if the doc actually has it. Cross-
        // variant fanout has no shared context and always walks the doc.
        parentPaths = resolveSiblingParentWithContext(
          targetDoc,
          seed.parentArrayPath,
          repParentCanonical,
          siblingParentCanonical,
        );
        if (!parentPaths.length) {
          parentPaths = resolveCanonicalArrayPaths(targetDoc, siblingParentCanonical);
        }
      } else {
        parentPaths = resolveCanonicalArrayPaths(targetDoc, siblingParentCanonical);
      }
      // No placeholder fallback: if the target doc doesn't host this sibling
      // (and the initial pass didn't cover it either), inventing a Plugin[0]-
      // shaped path would drop the new element on the wrong plugin.
      if (!parentPaths.length) continue;

      // Build the sibling-shaped subtree once per sibling scope: iterate
      // every rep leaf under the rep element, look up its sibling leaves
      // for THIS variant under THIS sibling scope, and plant the rep DTO
      // value at the sibling's relative suffix. Also collect the exact
      // sibling canonicals we wrote, so the template picker can prefer
      // one of them (and thus a value-hint that resolves in the doc).
      const dtoElement: Record<string, unknown> = {};
      const backedSiblings = new Set<string>();
      const scopedPrefix = siblingScope + '/';
      for (const repLeaf of repLeavesInScope) {
        const repSuffix = repLeaf.canonical
          .split('/')
          .filter(Boolean)
          .slice(repScope.split('/').filter(Boolean).length);
        if (!repSuffix.length) continue;
        const dtoValue = readFromSubtree(seed.dtoElement, repSuffix);
        if (dtoValue === undefined) continue;

        const cb = canonicalBridge.get(repLeaf.canonical);
        if (!cb) continue;
        for (const sibCanonical of cb[targetVariant]) {
          if (!sibCanonical.startsWith(scopedPrefix)) continue;
          const sibSuffix = sibCanonical
            .split('/')
            .filter(Boolean)
            .slice(siblingScope.split('/').filter(Boolean).length)
            .map((seg) => (seg === '[]' ? '0' : seg));
          if (!sibSuffix.length) continue;
          setConcrete(dtoElement, sibSuffix, dtoValue, true);
          backedSiblings.add(sibCanonical);
        }
      }

      let seededDtoElement: unknown =
        Object.keys(dtoElement).length ? dtoElement : undefined;
      // Scalar-leaf rep (`Rows/[]/[]`, `DependencyPlugins/[]`, etc.): the
      // rep canonical has no sub-leaves, so the object-projection loop
      // above produced nothing. The seed's `dtoElement` IS the value to
      // plant on the sibling — for row-level buckets that's the full row
      // array, for a plain scalar array it's the single value.
      if (
        seededDtoElement === undefined &&
        !repLeavesInScope.length &&
        seed.dtoElement !== undefined
      ) {
        seededDtoElement = seed.dtoElement;
      }

      for (const parentPath of parentPaths) {
        if (perSeedCovered.has(parentPath)) continue;
        const templateEntry = pickTemplateEntry(targetEntries, siblingScope, backedSiblings);
        if (!templateEntry) continue;
        perSeedCovered.add(parentPath);
        targetPlan.elements.push({
          variant: targetVariant,
          parentArrayPath: parentPath,
          kind: 'add',
          templateEntry,
          mintedIndex: undefined,
          dtoElement: seededDtoElement,
        });
      }
    }
  }
}

interface FanoutRemoveInput {
  seedRemoves: ElementOp[];
  targetVariant: Variant;
  targetDoc: unknown;
  targetPlan: VariantOperationPlan;
  targetEntries: UiFieldEntry[];
  bridge: SiblingBridge;
}

/**
 * Project each seed REMOVE element op onto every sibling scope the bridge
 * proves equivalent. This is what wires "delete WPF Rows[2]" through to
 * "delete EXE Parameters/[]/Rows[2] on both ExecutionCommands and
 * ValidationCommands". The `mintedIndex` is carried straight across — we
 * assume the same ordinal position across siblings, which is the same
 * assumption `fanoutModifies` already relies on for row-level edits.
 */
function fanoutRemoves(input: FanoutRemoveInput): void {
  const { seedRemoves, targetVariant, targetDoc, targetPlan, targetEntries, bridge } = input;

  const alreadyEmitted = new Set(
    targetPlan.elements
      .filter((op) => op.kind === 'remove')
      .map((op) => op.parentArrayPath + '\u0000' + (op.mintedIndex ?? '?')),
  );

  for (const seed of seedRemoves) {
    if (!Number.isInteger(seed.mintedIndex)) continue;
    const repScope = elementScopeOf(seed.templateEntry.canonical);
    if (!repScope) continue;
    const repParentCanonical = parentOfElementScope(repScope);
    if (!repParentCanonical) continue;
    const bucket = bridge.get(repScope);
    if (!bucket) continue;

    for (const siblingScope of bucket[targetVariant]) {
      // Same-variant + same-scope is the seed itself; buildVariantPlan
      // already emitted a REMOVE with the right index.
      if (seed.variant === targetVariant && siblingScope === repScope) continue;

      const siblingParentCanonical = parentOfElementScope(siblingScope);
      if (!siblingParentCanonical) continue;

      // Scalar-array-of-arrays: outer array = `parentOfElementScope` minus
      // one wildcard. Fanout to the outer array (matching the row-level
      // bucketing that `owningElement` produced for the seed).
      const scalarArrayOfArrays = siblingParentCanonical.endsWith('/[]');
      let parentPaths: string[];
      if (scalarArrayOfArrays) {
        const grandParent = stripTrailingWildcard(siblingParentCanonical);
        parentPaths = grandParent ? resolveCanonicalArrayPaths(targetDoc, grandParent) : [];
      } else if (seed.variant === targetVariant) {
        parentPaths = resolveSiblingParentWithContext(
          targetDoc,
          seed.parentArrayPath,
          repParentCanonical,
          siblingParentCanonical,
        );
        if (!parentPaths.length) {
          parentPaths = resolveCanonicalArrayPaths(targetDoc, siblingParentCanonical);
        }
      } else {
        parentPaths = resolveCanonicalArrayPaths(targetDoc, siblingParentCanonical);
      }
      if (!parentPaths.length) continue;

      for (const parentPath of parentPaths) {
        const key = parentPath + '\u0000' + seed.mintedIndex;
        if (alreadyEmitted.has(key)) continue;
        const templateEntry = pickTemplateEntry(targetEntries, siblingScope);
        if (!templateEntry) continue;
        alreadyEmitted.add(key);
        targetPlan.elements.push({
          variant: targetVariant,
          parentArrayPath: parentPath,
          kind: 'remove',
          templateEntry,
          mintedIndex: seed.mintedIndex,
          dtoElement: undefined,
        });
      }
    }
  }
}

/** Read a nested value out of a plain-object subtree at `suffix` (canonical). */
function readFromSubtree(subtree: unknown, suffix: string[]): unknown {
  let cur: unknown = subtree;
  for (const seg of suffix) {
    if (seg === '[]') {
      if (!Array.isArray(cur) || cur.length === 0) return undefined;
      cur = cur[0];
      continue;
    }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Small structural summary of an object for debug logs (keys, one level). */
function summarizeShape(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 3) return Array.isArray(value) ? '[…]' : '{…}';
  if (Array.isArray(value)) return value.map((v) => summarizeShape(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = summarizeShape(v, depth + 1);
  return out;
}

/**
 * Terse debug-log representation of a leaf value: keeps primitives as-is,
 * flattens objects/arrays to length/keys so the seeded-fanout NDJSON stays
 * grep-friendly instead of ballooning with nested types.
 */
function summarizeLiteral(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return `[array len=${value.length}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().join(',')}}`;
}

/** Return canonical up to and including the last `[]` (the element scope). */
function elementScopeOf(canonical: string): string | null {
  const segs = canonical.split('/');
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] === '[]') return segs.slice(0, i + 1).join('/');
  }
  return null;
}

/**
 * Drop a trailing `/[]` segment from a canonical, if present. Used by the
 * scalar-array-of-arrays fanout fallback so we can walk to the outer array
 * canonical (e.g. `.../Table/Rows/[]` → `.../Table/Rows`) and append the
 * seed's own row index.
 */
function stripTrailingWildcard(canonical: string): string | null {
  const segs = canonical.split('/');
  if (segs.length && segs[segs.length - 1] === '[]') {
    return segs.slice(0, -1).join('/');
  }
  return null;
}

/** Return canonical up to (but not including) the last `[]`. */
function parentOfElementScope(scope: string): string | null {
  const segs = scope.split('/');
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] === '[]') return segs.slice(0, i).join('/');
  }
  return null;
}

/**
 * Walk `doc` following `canonicalPath` (with `[]` meaning "any array index"),
 * returning every absolute path that resolves to an array in the doc.
 */
function resolveCanonicalArrayPaths(doc: unknown, canonicalPath: string): string[] {
  const segs = canonicalPath.split('/').filter(Boolean);
  const out: string[] = [];
  visit(doc, segs, 0, [], out);
  return out;
}

/**
 * Same as {@link resolveCanonicalArrayPaths} but pins down the shared canonical
 * prefix with the seed's already-resolved concrete indices, then walks the
 * remainder freely.
 */
function resolveSiblingParentWithContext(
  targetDoc: unknown,
  seedParentPath: string,
  repParentCanonical: string,
  siblingParentCanonical: string,
): string[] {
  const repSegs = repParentCanonical.split('/').filter(Boolean);
  const sibSegs = siblingParentCanonical.split('/').filter(Boolean);
  const seedSegs = seedParentPath.split('/').filter(Boolean);

  let lcp = 0;
  while (
    lcp < repSegs.length &&
    lcp < sibSegs.length &&
    lcp < seedSegs.length &&
    repSegs[lcp] === sibSegs[lcp]
  ) {
    lcp++;
  }
  const prefixConcrete = seedSegs.slice(0, lcp);
  const remainingCanonical = sibSegs.slice(lcp);

  let cur: unknown = targetDoc;
  for (const seg of prefixConcrete) {
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(seg)) return [];
      const idx = Number(seg);
      if (idx < 0 || idx >= cur.length) return [];
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return [];
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (!remainingCanonical.length) {
    return [Array.isArray(cur) ? '/' + prefixConcrete.join('/') : ''].filter(Boolean);
  }
  const out: string[] = [];
  visit(cur, remainingCanonical, 0, prefixConcrete, out);
  return out;
}

function visit(node: unknown, segs: string[], i: number, absPath: string[], out: string[]): void {
  if (i === segs.length) {
    if (Array.isArray(node)) out.push('/' + absPath.join('/'));
    return;
  }
  const seg = segs[i];
  if (seg === '[]') {
    if (!Array.isArray(node)) return;
    for (let k = 0; k < node.length; k++) {
      visit(node[k], segs, i + 1, [...absPath, String(k)], out);
    }
    return;
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const child = (node as Record<string, unknown>)[seg];
  visit(child, segs, i + 1, [...absPath, seg], out);
}

/**
 * Sibling of {@link resolveCanonicalArrayPaths} that yields any resolved
 * path (array OR object OR — for empty canonicals — the doc root). Used by
 * {@link fanoutFieldAdds} to find the container onto which a new leaf gets
 * planted: for `Rows/i/j` cell adds the container is a row array, but for
 * shorter tails the container might be a plain object, so we can't insist
 * on the terminal being an array.
 */
function resolveCanonicalContainerPaths(doc: unknown, canonicalPath: string): string[] {
  const segs = canonicalPath.split('/').filter(Boolean);
  const out: string[] = [];
  visitAny(doc, segs, 0, [], out);
  return out;
}

function visitAny(node: unknown, segs: string[], i: number, absPath: string[], out: string[]): void {
  if (i === segs.length) {
    if (node !== undefined) out.push('/' + absPath.join('/'));
    return;
  }
  const seg = segs[i];
  if (seg === '[]') {
    if (!Array.isArray(node)) return;
    for (let k = 0; k < node.length; k++) {
      visitAny(node[k], segs, i + 1, [...absPath, String(k)], out);
    }
    return;
  }
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const child = (node as Record<string, unknown>)[seg];
  visitAny(child, segs, i + 1, [...absPath, seg], out);
}

/**
 * Pick a variant entry whose canonical belongs to the given element scope so
 * derived replay has real historical evidence to project onto the new element.
 *
 * Two-tier preference:
 * 1. Prefer entries whose canonical was actually populated on `dtoElement` by
 *    the fanout seeder. Those leaves resolve to a value in the applied doc,
 *    so `seedValueHintFromDoc` in replay yields a valid hint and the picker
 *    can lock in the exact historical step (e.g. "Add Float" vs "Add Guid").
 * 2. Within the preferred (or full) pool, pick the entry with the richest
 *    derived footprint so replay has the most historical evidence to project.
 */
function pickTemplateEntry(
  entries: UiFieldEntry[],
  siblingScope: string,
  backedSiblings?: Set<string>,
): UiFieldEntry | null {
  const prefix = siblingScope + '/';
  // Allow the sibling scope itself as a candidate: for scalar-leaf scopes
  // (e.g. `Table.Rows/[]/[]`) the scope IS the leaf canonical, so no entry
  // ever extends it. Without equality here we'd reject every scalar-array
  // fanout and never emit an EXE add for row cells.
  const candidates = entries.filter(
    (e) => e.canonical === siblingScope || e.canonical.startsWith(prefix),
  );
  if (!candidates.length) return null;

  const preferred = backedSiblings && backedSiblings.size
    ? candidates.filter((e) => backedSiblings.has(e.canonical))
    : [];
  const pool = preferred.length ? preferred : candidates;

  let best: UiFieldEntry | null = null;
  let bestDerived = -1;
  for (const entry of pool) {
    const derived = entry.totals?.derived ?? 0;
    if (derived > bestDerived) {
      bestDerived = derived;
      best = entry;
    }
  }
  return best;
}
