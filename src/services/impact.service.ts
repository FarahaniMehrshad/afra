import type { BuildResult, EventKind, HistoryEvent } from '@/types/ir';
import type {
  ClusterSibling,
  DerivedChange,
  ImpactDerivedCategory,
  UiFieldEntry,
  UiFieldStepOccurrence,
} from '@/types/impact';
import type { LlmCategory, LlmVerdict } from '@/types/llm';
import type { JourneyStep, Variant } from '@/types/journey';

const STEP_OPERATION = 'step-operation';
const DEFAULT_DERIVED_CATEGORIES: readonly ImpactDerivedCategory[] = ['derived'];

interface ComputeInput {
  build: BuildResult | null;
  variant: Variant;
  verdicts: ReadonlyMap<string, LlmVerdict>;
  steps: JourneyStep[];
  hideNoise: boolean;
  includeCategories?: readonly ImpactDerivedCategory[];
  includeUnclassified?: boolean;
}

interface EntryBuilder {
  canonical: string;
  variant: Variant;
  byKind: Record<EventKind, Map<number, UiFieldStepOccurrence>>;
}

/**
 * Collapse volatile array-item path segments into `[]` so the same logical UI
 * field can be grouped across WPF and EXE snapshots.
 */
export function canonicalizePath(path: string): string {
  if (!path) return path;
  return path.replace(/\/(?:#[^/]+|@[^/]+|\d+)(?=\/|$)/g, '/[]');
}

export function computeUiFieldImpact({
  build,
  variant,
  verdicts,
  steps,
  hideNoise,
  includeCategories = DEFAULT_DERIVED_CATEGORIES,
  includeUnclassified = false,
}: ComputeInput): UiFieldEntry[] {
  if (!build) return [];

  const include = new Set<ImpactDerivedCategory>(includeCategories);
  const derivedByStep = new Map<number, DerivedChange[]>();
  const uiEventsByStep = new Map<number, number>();

  for (const [path, events] of build.hist) {
    const category = verdictCategory(verdicts, variant, path);
    const kept = hideNoise ? events.filter((e) => !e.noise) : events;
    if (!kept.length) continue;

    if (category === STEP_OPERATION) {
      for (const ev of kept) {
        uiEventsByStep.set(ev.i, (uiEventsByStep.get(ev.i) ?? 0) + 1);
      }
      continue;
    }

    const shouldInclude =
      (category === 'unclassified' && includeUnclassified) ||
      (category !== 'unclassified' && include.has(category));
    if (!shouldInclude) continue;

    for (const ev of kept) {
      const bucket = derivedByStep.get(ev.i);
      const row: DerivedChange = { path, category, event: ev, variant };
      if (bucket) bucket.push(row);
      else derivedByStep.set(ev.i, [row]);
    }
  }

  const byCanonical = new Map<string, EntryBuilder>();
  for (const [path, events] of build.hist) {
    const category = verdictCategory(verdicts, variant, path);
    if (category !== STEP_OPERATION) continue;
    const kept = hideNoise ? events.filter((e) => !e.noise) : events;
    if (!kept.length) continue;

    const canonical = canonicalizePath(path);
    const entry = ensureEntry(byCanonical, canonical, variant);

    for (const ev of kept) {
      const stepMeta = steps[ev.i];
      const step = stepMeta?.ordinal ?? ev.i + 1;
      const kindMap = entry.byKind[ev.st];
      let occ = kindMap.get(step);
      if (!occ) {
        occ = {
          step,
          label: stepMeta?.label ?? 'step ' + step,
          operation: stepMeta?.operation ?? '',
          concretePaths: [],
          derived: [...(derivedByStep.get(ev.i) ?? [])],
          sharedWith: Math.max(0, (uiEventsByStep.get(ev.i) ?? 0) - 1),
        };
        kindMap.set(step, occ);
      }
      occ.concretePaths.push({ path, event: ev, variant });
    }
  }

  const entries: UiFieldEntry[] = Array.from(byCanonical.values()).map((entry) => {
    const byKindRaw = {
      add: sortedOccurrences(entry.byKind.add),
      remove: sortedOccurrences(entry.byKind.remove),
      modify: sortedOccurrences(entry.byKind.modify),
    };
    const byKind = normalizeArrayTransitions(byKindRaw);
    const totals = {
      add: byKind.add.reduce((n, o) => n + o.concretePaths.length, 0),
      remove: byKind.remove.reduce((n, o) => n + o.concretePaths.length, 0),
      modify: byKind.modify.reduce((n, o) => n + o.concretePaths.length, 0),
      derived: [...byKind.add, ...byKind.remove, ...byKind.modify].reduce(
        (n, o) => n + o.derived.length,
        0,
      ),
    };
    return { canonical: entry.canonical, variant: entry.variant, byKind, totals };
  });

  entries.sort((a, b) => a.canonical.localeCompare(b.canonical));
  return entries;
}

function ensureEntry(
  map: Map<string, EntryBuilder>,
  canonical: string,
  variant: Variant,
): EntryBuilder {
  const hit = map.get(canonical);
  if (hit) return hit;
  const made: EntryBuilder = {
    canonical,
    variant,
    byKind: {
      add: new Map(),
      remove: new Map(),
      modify: new Map(),
    },
  };
  map.set(canonical, made);
  return made;
}

function sortedOccurrences(map: Map<number, UiFieldStepOccurrence>): UiFieldStepOccurrence[] {
  const rows = Array.from(map.values());
  rows.sort((a, b) => a.step - b.step || a.label.localeCompare(b.label));
  for (const row of rows) {
    row.concretePaths.sort((a, b) => a.path.localeCompare(b.path));
    row.derived.sort((a, b) => {
      const byPath = a.path.localeCompare(b.path);
      if (byPath) return byPath;
      return rankKind(a.event.st) - rankKind(b.event.st);
    });
  }
  return rows;
}

function verdictCategory(
  verdicts: ReadonlyMap<string, LlmVerdict>,
  variant: Variant,
  path: string,
): LlmCategory | 'unclassified' {
  const verdict = verdicts.get(variant + '\u0000' + path);
  return verdict?.category ?? 'unclassified';
}

function rankKind(k: HistoryEvent['st']): number {
  if (k === 'add') return 0;
  if (k === 'modify') return 1;
  return 2;
}

/**
 * Array index churn can produce misleading pairs like:
 * - modify i: "A" -> "B"
 * - remove i+1: "B"
 * when the true user action was "remove A".
 *
 * We collapse those synthetic shift pairs so UI-impact reflects semantic ops.
 */
function normalizeArrayTransitions(byKind: {
  add: UiFieldStepOccurrence[];
  remove: UiFieldStepOccurrence[];
  modify: UiFieldStepOccurrence[];
}): {
  add: UiFieldStepOccurrence[];
  remove: UiFieldStepOccurrence[];
  modify: UiFieldStepOccurrence[];
} {
  const add = [...byKind.add];
  const remove = [...byKind.remove];
  const modify = [...byKind.modify];

  const steps = new Set<number>([
    ...add.map((r) => r.step),
    ...remove.map((r) => r.step),
    ...modify.map((r) => r.step),
  ]);

  for (const step of steps) {
    const modRow = modify.find((r) => r.step === step);
    if (!modRow) continue;

    const remRow = remove.find((r) => r.step === step);
    const addRow = add.find((r) => r.step === step);

    const consumedMod = new Set<number>();
    const consumedRem = new Set<number>();
    const consumedAdd = new Set<number>();
    const convToRemove: UiFieldStepOccurrence['concretePaths'] = [];
    const convToAdd: UiFieldStepOccurrence['concretePaths'] = [];

    for (let mi = 0; mi < modRow.concretePaths.length; mi++) {
      const modCp = modRow.concretePaths[mi];

      if (remRow) {
        let matched = false;
        for (let ri = 0; ri < remRow.concretePaths.length; ri++) {
          if (consumedRem.has(ri)) continue;
          const remCp = remRow.concretePaths[ri];
          if (isShiftDeletePair(modCp, remCp)) {
            consumedMod.add(mi);
            consumedRem.add(ri);
            convToRemove.push({
              path: modCp.path,
              variant: modCp.variant,
              event: {
                ...modCp.event,
                st: 'remove',
                to: null,
              },
            });
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }

      if (addRow) {
        for (let ai = 0; ai < addRow.concretePaths.length; ai++) {
          if (consumedAdd.has(ai)) continue;
          const addCp = addRow.concretePaths[ai];
          if (isShiftInsertPair(modCp, addCp)) {
            consumedMod.add(mi);
            consumedAdd.add(ai);
            convToAdd.push({
              path: modCp.path,
              variant: modCp.variant,
              event: {
                ...modCp.event,
                st: 'add',
                from: null,
              },
            });
            break;
          }
        }
      }
    }

    if (!consumedMod.size && !consumedRem.size && !consumedAdd.size) continue;

    modRow.concretePaths = modRow.concretePaths.filter((_, i) => !consumedMod.has(i));
    if (remRow) remRow.concretePaths = remRow.concretePaths.filter((_, i) => !consumedRem.has(i));
    if (addRow) addRow.concretePaths = addRow.concretePaths.filter((_, i) => !consumedAdd.has(i));

    if (convToRemove.length) {
      const target =
        remRow ??
        makeOccurrenceFrom(modRow, step, 'remove', modRow.derived);
      target.concretePaths.push(...convToRemove);
      if (!remRow) remove.push(target);
    }

    if (convToAdd.length) {
      const target =
        addRow ??
        makeOccurrenceFrom(modRow, step, 'add', modRow.derived);
      target.concretePaths.push(...convToAdd);
      if (!addRow) add.push(target);
    }
  }

  const cleaned = {
    add: add.filter((r) => r.concretePaths.length > 0),
    remove: remove.filter((r) => r.concretePaths.length > 0),
    modify: modify.filter((r) => r.concretePaths.length > 0),
  };

  for (const row of [...cleaned.add, ...cleaned.remove, ...cleaned.modify]) {
    normalizeOccurrence(row);
  }

  cleaned.add.sort((a, b) => a.step - b.step || a.label.localeCompare(b.label));
  cleaned.remove.sort((a, b) => a.step - b.step || a.label.localeCompare(b.label));
  cleaned.modify.sort((a, b) => a.step - b.step || a.label.localeCompare(b.label));

  return cleaned;
}

/**
 * Build a merge signature for "same UI action" clustering.
 * - add: `to`
 * - remove: `from`
 * - modify: `from -> to`
 */
export function signatureFor(ev: HistoryEvent): string {
  if (ev.st === 'add') return ev.to ?? 'null';
  if (ev.st === 'remove') return ev.from ?? 'null';
  return (ev.from ?? 'null') + '→' + (ev.to ?? 'null');
}

/**
 * Collapse same-step, same-kind, same-value UI rows into a representative row.
 * This is a post-processing step over `computeUiFieldImpact` output so the full
 * mode stays byte-identical when the toggle is off.
 */
export function mergeSameValueClusters(entries: UiFieldEntry[]): UiFieldEntry[] {
  const out = cloneEntries(entries);

  interface OccRef {
    entry: UiFieldEntry;
    canonical: string;
    kind: EventKind;
    occ: UiFieldStepOccurrence;
  }

  const clusters = new Map<string, OccRef[]>();
  for (const entry of out) {
    for (const kind of ['add', 'remove', 'modify'] as const) {
      for (const occ of entry.byKind[kind]) {
        const seed = occ.concretePaths[0]?.event;
        if (!seed) continue;
        const sig = signatureFor(seed);
        occ.valueSignature = sig;
        const key = occ.step + '\u0000' + kind + '\u0000' + sig;
        const list = clusters.get(key);
        const ref: OccRef = { entry, canonical: entry.canonical, kind, occ };
        if (list) list.push(ref);
        else clusters.set(key, [ref]);
      }
    }
  }

  const toHide = new Set<UiFieldStepOccurrence>();

  for (const refs of clusters.values()) {
    if (refs.length < 2) continue;
    refs.sort(
      (a, b) =>
        a.canonical.length - b.canonical.length ||
        a.canonical.localeCompare(b.canonical),
    );

    const rep = refs[0];
    rep.occ.mergedInto = null;
    rep.occ.mergesFrom = [];

    for (let i = 1; i < refs.length; i++) {
      const cur = refs[i];
      const sibling: ClusterSibling = {
        canonical: cur.canonical,
        concretePaths: Array.from(
          new Set(cur.occ.concretePaths.map((p) => p.path)),
        ).sort((a, b) => a.localeCompare(b)),
        variant: cur.entry.variant,
      };
      rep.occ.mergesFrom.push(sibling);

      cur.occ.mergedInto = rep.canonical;
      cur.occ.attributedDerivedCount = cur.occ.derived.length;
      cur.occ.mergesFrom = undefined;
      cur.occ.derived = [];
      toHide.add(cur.occ);
    }

    rep.occ.mergesFrom.sort(
      (a, b) =>
        rankVariant(a.variant) - rankVariant(b.variant) ||
        a.canonical.localeCompare(b.canonical),
    );
  }

  for (const entry of out) {
    entry.byKind.add = entry.byKind.add.filter((row) => !toHide.has(row));
    entry.byKind.remove = entry.byKind.remove.filter((row) => !toHide.has(row));
    entry.byKind.modify = entry.byKind.modify.filter((row) => !toHide.has(row));
  }

  const visible = out.filter(
    (entry) =>
      entry.byKind.add.length > 0 ||
      entry.byKind.remove.length > 0 ||
      entry.byKind.modify.length > 0,
  );

  for (const entry of visible) {
    entry.totals = {
      add: entry.byKind.add.reduce((n, o) => n + o.concretePaths.length, 0),
      remove: entry.byKind.remove.reduce((n, o) => n + o.concretePaths.length, 0),
      modify: entry.byKind.modify.reduce((n, o) => n + o.concretePaths.length, 0),
      derived: [...entry.byKind.add, ...entry.byKind.remove, ...entry.byKind.modify].reduce(
        (n, o) => n + o.derived.length,
        0,
      ),
    };
  }

  return visible;
}

/**
 * Collapse same-step, same-kind, same-value UI rows across BOTH variants.
 * The returned list is one unified set of entries for the combined column.
 */
export function mergeAcrossVariants(
  wpfEntries: UiFieldEntry[],
  exeEntries: UiFieldEntry[],
): UiFieldEntry[] {
  const out = cloneEntries([...wpfEntries, ...exeEntries]);

  interface OccRef {
    entry: UiFieldEntry;
    canonical: string;
    occ: UiFieldStepOccurrence;
  }

  const clusters = new Map<string, OccRef[]>();
  for (const entry of out) {
    for (const kind of ['add', 'remove', 'modify'] as const) {
      for (const occ of entry.byKind[kind]) {
        const seed = occ.concretePaths[0]?.event;
        if (!seed) continue;
        const sig = signatureFor(seed);
        occ.valueSignature = sig;
        const key = occ.step + '\u0000' + kind + '\u0000' + sig;
        const list = clusters.get(key);
        const ref: OccRef = { entry, canonical: entry.canonical, occ };
        if (list) list.push(ref);
        else clusters.set(key, [ref]);
      }
    }
  }

  const toHide = new Set<UiFieldStepOccurrence>();

  for (const refs of clusters.values()) {
    if (refs.length < 2) continue;
    refs.sort(
      (a, b) =>
        a.canonical.length - b.canonical.length ||
        a.canonical.localeCompare(b.canonical) ||
        rankVariant(a.entry.variant) - rankVariant(b.entry.variant),
    );

    const rep = refs[0];
    rep.occ.mergedInto = null;
    rep.occ.mergesFrom = [];

    for (let i = 1; i < refs.length; i++) {
      const cur = refs[i];
      rep.occ.mergesFrom.push({
        canonical: cur.canonical,
        concretePaths: Array.from(
          new Set(cur.occ.concretePaths.map((p) => p.path)),
        ).sort((a, b) => a.localeCompare(b)),
        variant: cur.entry.variant,
      });

      // One representative row owns all concrete/derived evidence.
      rep.occ.concretePaths.push(...cur.occ.concretePaths);
      rep.occ.derived.push(...cur.occ.derived);
      rep.occ.sharedWith = Math.max(rep.occ.sharedWith, refs.length - 1);

      cur.occ.mergedInto = rep.canonical;
      cur.occ.attributedDerivedCount = cur.occ.derived.length;
      cur.occ.mergesFrom = undefined;
      cur.occ.derived = [];
      toHide.add(cur.occ);
    }

    rep.occ.mergesFrom.sort(
      (a, b) =>
        rankVariant(a.variant) - rankVariant(b.variant) ||
        a.canonical.localeCompare(b.canonical),
    );
    normalizeOccurrence(rep.occ);
  }

  for (const entry of out) {
    entry.byKind.add = entry.byKind.add.filter((row) => !toHide.has(row));
    entry.byKind.remove = entry.byKind.remove.filter((row) => !toHide.has(row));
    entry.byKind.modify = entry.byKind.modify.filter((row) => !toHide.has(row));
  }

  const visible = out.filter(
    (entry) =>
      entry.byKind.add.length > 0 ||
      entry.byKind.remove.length > 0 ||
      entry.byKind.modify.length > 0,
  );

  for (const entry of visible) {
    for (const row of [...entry.byKind.add, ...entry.byKind.remove, ...entry.byKind.modify]) {
      normalizeOccurrence(row);
    }
    entry.totals = {
      add: entry.byKind.add.reduce((n, o) => n + o.concretePaths.length, 0),
      remove: entry.byKind.remove.reduce((n, o) => n + o.concretePaths.length, 0),
      modify: entry.byKind.modify.reduce((n, o) => n + o.concretePaths.length, 0),
      derived: [...entry.byKind.add, ...entry.byKind.remove, ...entry.byKind.modify].reduce(
        (n, o) => n + o.derived.length,
        0,
      ),
    };
  }

  visible.sort(
    (a, b) =>
      a.canonical.localeCompare(b.canonical) ||
      rankVariant(a.variant) - rankVariant(b.variant),
  );

  return visible;
}

function cloneEntries(entries: UiFieldEntry[]): UiFieldEntry[] {
  return entries.map((entry) => ({
    canonical: entry.canonical,
    variant: entry.variant,
    byKind: {
      add: entry.byKind.add.map(cloneOccurrence),
      remove: entry.byKind.remove.map(cloneOccurrence),
      modify: entry.byKind.modify.map(cloneOccurrence),
    },
    totals: { ...entry.totals },
  }));
}

function cloneOccurrence(occ: UiFieldStepOccurrence): UiFieldStepOccurrence {
  return {
    ...occ,
    concretePaths: occ.concretePaths.map((p) => ({
      path: p.path,
      event: { ...p.event },
      variant: p.variant,
    })),
    derived: occ.derived.map((d) => ({
      path: d.path,
      category: d.category,
      event: { ...d.event },
      variant: d.variant,
    })),
    mergesFrom: occ.mergesFrom
      ? occ.mergesFrom.map((m) => ({
          canonical: m.canonical,
          concretePaths: [...m.concretePaths],
          variant: m.variant,
        }))
      : undefined,
  };
}

function normalizeOccurrence(occ: UiFieldStepOccurrence): void {
  const concreteSeen = new Set<string>();
  occ.concretePaths = occ.concretePaths
    .filter((p) => {
      const key =
        p.variant +
        '\u0000' +
        p.path +
        '\u0000' +
        p.event.i +
        '\u0000' +
        p.event.st +
        '\u0000' +
        String(p.event.from) +
        '\u0000' +
        String(p.event.to);
      if (concreteSeen.has(key)) return false;
      concreteSeen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        rankVariant(a.variant) - rankVariant(b.variant) ||
        a.path.localeCompare(b.path),
    );

  const derivedSeen = new Set<string>();
  occ.derived = occ.derived
    .filter((d) => {
      const key =
        d.variant +
        '\u0000' +
        d.path +
        '\u0000' +
        d.event.i +
        '\u0000' +
        d.event.st +
        '\u0000' +
        String(d.event.from) +
        '\u0000' +
        String(d.event.to) +
        '\u0000' +
        d.category;
      if (derivedSeen.has(key)) return false;
      derivedSeen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        rankVariant(a.variant) - rankVariant(b.variant) ||
        a.path.localeCompare(b.path) ||
        rankKind(a.event.st) - rankKind(b.event.st),
    );
}

function rankVariant(v: Variant): number {
  return v === 'wpf' ? 0 : 1;
}

function makeOccurrenceFrom(
  row: UiFieldStepOccurrence,
  step: number,
  _kind: EventKind,
  derived: DerivedChange[],
): UiFieldStepOccurrence {
  return {
    step,
    label: row.label,
    operation: row.operation,
    concretePaths: [],
    derived: [...derived],
    sharedWith: row.sharedWith,
    valueSignature: row.valueSignature,
    mergedInto: row.mergedInto,
    mergesFrom: row.mergesFrom ? [...row.mergesFrom] : undefined,
    attributedDerivedCount: row.attributedDerivedCount,
  };
}

function isShiftDeletePair(
  modCp: UiFieldStepOccurrence['concretePaths'][number],
  remCp: UiFieldStepOccurrence['concretePaths'][number],
): boolean {
  if (modCp.variant !== remCp.variant) return false;
  if (modCp.event.st !== 'modify' || remCp.event.st !== 'remove') return false;
  if ((modCp.event.to ?? null) !== (remCp.event.from ?? null)) return false;

  const m = indexedPathInfo(modCp.path);
  const r = indexedPathInfo(remCp.path);
  if (!m || !r) return false;

  return (
    m.prefix === r.prefix &&
    m.suffix === r.suffix &&
    r.index === m.index + 1
  );
}

function isShiftInsertPair(
  modCp: UiFieldStepOccurrence['concretePaths'][number],
  addCp: UiFieldStepOccurrence['concretePaths'][number],
): boolean {
  if (modCp.variant !== addCp.variant) return false;
  if (modCp.event.st !== 'modify' || addCp.event.st !== 'add') return false;
  if ((modCp.event.from ?? null) !== (addCp.event.to ?? null)) return false;

  const m = indexedPathInfo(modCp.path);
  const a = indexedPathInfo(addCp.path);
  if (!m || !a) return false;

  return (
    m.prefix === a.prefix &&
    m.suffix === a.suffix &&
    a.index === m.index + 1
  );
}

function indexedPathInfo(path: string): { prefix: string; suffix: string; index: number } | null {
  const parts = path.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      return {
        prefix: parts.slice(0, i).join('/'),
        suffix: parts.slice(i + 1).join('/'),
        index: Number(parts[i]),
      };
    }
  }
  return null;
}
