import { deleteAtAbsolutePath, setAtAbsolutePath } from '@/services/dto.applyPlan';
import { canonicalizePath } from '@/services/impact.service';
import { toRelativeSegments } from '@/services/impactDto.paths';
import type { ElementOp, FieldOp } from '@/types/convert';
import type { UiFieldEntry, UiFieldStepOccurrence } from '@/types/impact';
import type { Variant } from '@/types/journey';

interface ReplayInput {
  wpfDoc: unknown;
  exeDoc: unknown;
  wpfFields: FieldOp[];
  exeFields: FieldOp[];
  wpfElements: ElementOp[];
  exeElements: ElementOp[];
  wpfEntries: UiFieldEntry[];
  exeEntries: UiFieldEntry[];
  /**
   * Absolute paths the applier already planted (from `dto.applyPlan`). Replay
   * must not overwrite these so DTO-supplied values stay authoritative. When
   * omitted we fall back to the coarser "any step-op canonical" guard.
   */
  wpfWrittenPaths?: ReadonlySet<string>;
  exeWrittenPaths?: ReadonlySet<string>;
}

interface ReplayResult {
  wpfDoc: unknown;
  exeDoc: unknown;
  warnings: string[];
  applied: { wpf: number; exe: number };
}

interface ReplayGroup {
  kind: 'add' | 'remove' | 'modify';
  elementParent: string;
  elementIndex: string;
  entry: UiFieldEntry;
}

export function replayDerivedChanges(input: ReplayInput): ReplayResult {
  const warnings: string[] = [];
  const wpf = replayForVariant(
    'wpf',
    input.wpfDoc,
    input.wpfFields,
    input.wpfElements,
    input.wpfEntries,
    input.wpfWrittenPaths,
    warnings,
  );
  const exe = replayForVariant(
    'exe',
    input.exeDoc,
    input.exeFields,
    input.exeElements,
    input.exeEntries,
    input.exeWrittenPaths,
    warnings,
  );
  return {
    wpfDoc: wpf.doc,
    exeDoc: exe.doc,
    warnings,
    applied: { wpf: wpf.applied, exe: exe.applied },
  };
}

function replayForVariant(
  variant: Variant,
  doc: unknown,
  fields: FieldOp[],
  elements: ElementOp[],
  entries: UiFieldEntry[],
  writtenPaths: ReadonlySet<string> | undefined,
  warnings: string[],
): { doc: unknown; applied: number } {
  const groups = collectGroups(fields, elements);
  // When applyPlan gave us the exact abs paths it wrote, protect only those
  // (leaves *and* intermediates) — everything else in a new element is fair
  // game for historical fill-ins. Falling back to the coarser step-op-canonical
  // guard used to block valid metadata like ID/Order/ViewUID from being
  // replayed onto a fresh element.
  const useWrittenGuard = writtenPaths !== undefined;
  const seedCanonicalFallback = useWrittenGuard
    ? null
    : new Set(entries.map((entry) => entry.canonical));
  let applied = 0;

  for (const group of groups) {
    const entryRel = toRelativeSegments(group.entry.canonical);
    const arrAt = lastArrayIndex(entryRel);
    if (arrAt < 0) continue;
    const scope = entryRel.slice(0, arrAt + 1);
    const targetElementSegs = splitPath(group.elementParent + '/' + group.elementIndex);

    // Pick a template whose recorded seed value matches the DTO's own value at
    // this element. Without this hint the picker falls back to "most derived"
    // and can end up cloning an unrelated historical add (e.g. a Guid column's
    // add gets replayed onto a Float column's add, planting HasLength=false).
    const valueHint =
      group.kind === 'add' || group.kind === 'modify'
        ? seedValueHintFromDoc(doc, targetElementSegs, entryRel, arrAt)
        : undefined;
    const template = pickTemplate(group.entry, group.kind, valueHint);
    if (!template || !template.derived.length) continue;

    for (const derived of template.derived) {
      const rel = toRelativeSegments(canonicalizePath(derived.path));
      if (!hasCanonicalPrefix(rel, scope)) continue;

      const suffix = rel.slice(scope.length).map((seg) => (seg === '[]' ? '0' : seg));
      const targetSegs = [...targetElementSegs, ...suffix];
      const targetPath = '/' + targetSegs.join('/');

      if (useWrittenGuard) {
        if (writtenPaths!.has(targetPath)) continue;
      } else if (seedCanonicalFallback!.has(canonicalizePath(targetPath))) {
        continue;
      }

      if (derived.event.st === 'remove') {
        if (deleteAtAbsolutePath(doc, targetPath)) applied++;
        continue;
      }

      const value = parseLiteral(derived.event.to);
      if (value === undefined) {
        warnings.push(variant + ': skipped derived value (non-JSON literal) at ' + derived.path);
        continue;
      }
      const ok = setAtAbsolutePath(doc, targetPath, value);
      if (ok) applied++;
    }
  }

  return { doc, applied };
}

function collectGroups(fields: FieldOp[], elements: ElementOp[]): ReplayGroup[] {
  const byKey = new Map<string, ReplayGroup>();

  for (const field of fields) {
    if (!field.elementParent || field.elementIndex === undefined) continue;
    const key = field.kind + '\u0000' + field.elementParent + '\u0000' + String(field.elementIndex);
    if (!byKey.has(key)) {
      byKey.set(key, {
        kind: field.kind,
        elementParent: field.elementParent,
        elementIndex: String(field.elementIndex),
        entry: field.seedVariantEntry,
      });
    }
  }

  for (const el of elements) {
    if (!Number.isInteger(el.mintedIndex)) continue;
    const key = el.kind + '\u0000' + el.parentArrayPath + '\u0000' + String(el.mintedIndex);
    if (!byKey.has(key)) {
      byKey.set(key, {
        kind: el.kind,
        elementParent: el.parentArrayPath,
        elementIndex: String(el.mintedIndex),
        entry: el.templateEntry,
      });
    }
  }

  return Array.from(byKey.values());
}

function pickTemplate(
  entry: UiFieldEntry,
  kind: 'add' | 'remove' | 'modify',
  valueHint: string | undefined,
): UiFieldStepOccurrence | null {
  const rows = entry.byKind[kind];
  if (!rows.length) return null;

  if (valueHint !== undefined) {
    const matches = rows.filter((row) =>
      row.concretePaths.some((cp) => cp.event.to === valueHint),
    );
    if (matches.length) {
      matches.sort((a, b) => b.derived.length - a.derived.length || b.step - a.step);
      return matches[0];
    }
  }

  const sorted = rows
    .slice()
    .sort((a, b) => b.derived.length - a.derived.length || b.step - a.step);
  return sorted[0] ?? null;
}

/**
 * Read the DTO/base value at the seed path within the target element and
 * return its JSON-encoded form so it can be compared to `HistoryEvent.to`.
 */
function seedValueHintFromDoc(
  doc: unknown,
  elementSegs: string[],
  entryRel: string[],
  arrAt: number,
): string | undefined {
  const suffix = entryRel.slice(arrAt + 1).map((seg) => (seg === '[]' ? '0' : seg));
  if (!suffix.length) return undefined;
  let cur: unknown = doc;
  for (const seg of [...elementSegs, ...suffix]) {
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(seg)) return undefined;
      cur = cur[Number(seg)];
      continue;
    }
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === undefined) return undefined;
  try {
    return JSON.stringify(cur);
  } catch {
    return undefined;
  }
}

function lastArrayIndex(segs: string[]): number {
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] === '[]') return i;
  }
  return -1;
}

function hasCanonicalPrefix(rel: string[], scope: string[]): boolean {
  if (rel.length < scope.length) return false;
  for (let i = 0; i < scope.length; i++) {
    if (scope[i] === '[]') continue;
    if (scope[i] !== rel[i]) return false;
  }
  return true;
}

function parseLiteral(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}
