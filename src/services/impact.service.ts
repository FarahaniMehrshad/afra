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
      const row: DerivedChange = { path, category, event: ev };
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
      occ.concretePaths.push({ path, event: ev });
    }
  }

  const entries: UiFieldEntry[] = Array.from(byCanonical.values()).map((entry) => {
    const byKind = {
      add: sortedOccurrences(entry.byKind.add),
      remove: sortedOccurrences(entry.byKind.remove),
      modify: sortedOccurrences(entry.byKind.modify),
    };
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
      };
      rep.occ.mergesFrom.push(sibling);

      cur.occ.mergedInto = rep.canonical;
      cur.occ.attributedDerivedCount = cur.occ.derived.length;
      cur.occ.mergesFrom = undefined;
      cur.occ.derived = [];
      toHide.add(cur.occ);
    }

    rep.occ.mergesFrom.sort((a, b) => a.canonical.localeCompare(b.canonical));
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
    })),
    derived: occ.derived.map((d) => ({
      path: d.path,
      category: d.category,
      event: { ...d.event },
    })),
    mergesFrom: occ.mergesFrom
      ? occ.mergesFrom.map((m) => ({
          canonical: m.canonical,
          concretePaths: [...m.concretePaths],
        }))
      : undefined,
  };
}
