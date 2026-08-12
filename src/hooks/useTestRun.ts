import { useMemo } from 'react';
import { getBuild } from '@/hooks/useBuild';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { applyOperationPlan } from '@/services/dto.applyPlan';
import { replayDerivedChanges } from '@/services/dto.deriveReplay';
import { buildDtoDiffPlan } from '@/services/dto.diffPlan';
import { computeUiFieldImpact, mergeAcrossVariants } from '@/services/impact.service';
import { buildImpactDtoFromStep } from '@/services/impactDto.service';
import { diffTexts } from '@/services/diff.service';
import type { DiffRow } from '@/types/diff';
import type { OperationPlan } from '@/types/convert';
import type { ImpactDerivedCategory } from '@/types/impact';
import type { JourneyStep, Variant } from '@/types/journey';

/**
 * For the round-trip test we widen replay to every non-step-operation category
 * so ids, timestamps, and env-specific fields also get planted from history.
 * Entries themselves are still step-operation-only (see `impact.service.ts`),
 * so DTO shape, coverage, and sibling bridges are unaffected — only
 * `template.derived` grows, giving replay evidence for the "noise" leaves.
 */
const REPLAY_CATEGORIES: readonly ImpactDerivedCategory[] = [
  'derived',
  'random-id',
  'timestamp',
  'environment',
  'unknown',
];

/**
 * Round-trip regression harness. For a chosen base step S, we:
 *   1) build a DTO from step S+1's real WPF/EXE docs using merge:across seeds,
 *   2) run the full Apply-DTO pipeline (plan → apply → replay) against S,
 *   3) compare the generated docs against step S+1's actual docs.
 *
 * Any divergence means the DTO→JSON conversion still has a defect.
 */

export interface VariantTestResult {
  variant: Variant;
  expectedText: string;
  generatedText: string;
  diffRows: DiffRow[];
  diffCount: number;
  match: boolean;
}

export interface TestRunResult {
  baseStep: JourneyStep | null;
  nextStep: JourneyStep | null;
  dtoText: string;
  plan: OperationPlan | null;
  wpf: VariantTestResult | null;
  exe: VariantTestResult | null;
  warnings: string[];
  isReady: boolean;
  hasVerdicts: boolean;
  hasBothVariants: boolean;
  seedCount: number;
  ranAt: number;
}

const EMPTY: TestRunResult = {
  baseStep: null,
  nextStep: null,
  dtoText: '',
  plan: null,
  wpf: null,
  exe: null,
  warnings: [],
  isReady: false,
  hasVerdicts: false,
  hasBothVariants: false,
  seedCount: 0,
  ranAt: 0,
};

export function useTestRun(): TestRunResult {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const baseOrdinal = useAppStore((s) => s.testBaseStepOrdinal);
  const verdicts = useLlmStore((s) => s.verdicts);

  return useMemo(() => {
    if (!bundle) return EMPTY;

    const hasVerdicts = verdicts.size > 0;
    const wpfBuild = getBuild(bundle, 'wpf');
    const exeBuild = getBuild(bundle, 'exe');
    const baseIdx = bundle.steps.findIndex((s) => s.ordinal === baseOrdinal);
    const baseStep = bundle.steps[baseIdx] ?? null;
    const nextStep = baseIdx >= 0 ? bundle.steps[baseIdx + 1] ?? null : null;
    const hasBothVariants = Boolean(
      wpfBuild.docs[baseIdx]?.obj && exeBuild.docs[baseIdx]?.obj,
    );

    if (!hasVerdicts || !baseStep || !nextStep || !hasBothVariants) {
      return {
        ...EMPTY,
        baseStep,
        nextStep,
        hasVerdicts,
        hasBothVariants,
      };
    }

    const baseWpf = wpfBuild.docs[baseIdx]?.obj ?? null;
    const baseExe = exeBuild.docs[baseIdx]?.obj ?? null;
    const nextWpf = wpfBuild.docs[baseIdx + 1]?.obj ?? null;
    const nextExe = exeBuild.docs[baseIdx + 1]?.obj ?? null;

    if (!baseWpf || !baseExe || !nextWpf || !nextExe) {
      return { ...EMPTY, baseStep, nextStep, hasVerdicts, hasBothVariants };
    }

    // Entries themselves stay under the user's hideNoise preference so DTO
    // shape / cluster seeds line up with the impact UI. The derived stream is
    // widened separately so replay can plant `ID`, `ViewUID`, `Order`, etc.
    // onto brand-new elements even though those keys are flagged as noise.
    const wpfEntries = computeUiFieldImpact({
      build: wpfBuild,
      variant: 'wpf',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: REPLAY_CATEGORIES,
      includeUnclassified: true,
      derivedHideNoise: false,
    });
    const exeEntries = computeUiFieldImpact({
      build: exeBuild,
      variant: 'exe',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: REPLAY_CATEGORIES,
      includeUnclassified: true,
      derivedHideNoise: false,
    });
    const acrossEntries = mergeAcrossVariants(wpfEntries, exeEntries);

    const dtoObj = buildImpactDtoFromStep(acrossEntries, nextWpf, nextExe, {
      withSampleValues: true,
    });
    const dtoText = JSON.stringify(dtoObj, null, 4);

    const plan = buildDtoDiffPlan({
      dto: dtoObj,
      wpfDoc: baseWpf,
      exeDoc: baseExe,
      wpfEntries,
      exeEntries,
      acrossEntries,
      // Cap history carry-over to events recorded at the transition into the
      // next step. `event.i` is 0-based over the maps array, so the transition
      // "base → next" carries the next step's index. Without this cap, later
      // steps' modifies would leak forward and over-shoot the expected doc.
      maxStep: baseIdx + 1,
    });
    const applied = applyOperationPlan({ plan, wpfDoc: baseWpf, exeDoc: baseExe });
    // Replay mutates its input docs in place. Clone so postApply probes stay
    // truthful and we never double-apply derived ops onto the applier output
    // snapshot.
    const replayed = replayDerivedChanges({
      wpfDoc: structuredClone(applied.wpf.doc),
      exeDoc: structuredClone(applied.exe.doc),
      wpfFields: applied.wpf.fields,
      exeFields: applied.exe.fields,
      wpfElements: applied.wpf.elements,
      exeElements: applied.exe.elements,
      wpfEntries,
      exeEntries,
      wpfWrittenPaths: applied.wpf.writtenPaths,
      exeWrittenPaths: applied.exe.writtenPaths,
    });

    const wpfExpected = canonicalStringify(nextWpf);
    const exeExpected = canonicalStringify(nextExe);
    const wpfGenerated = canonicalStringify(replayed.wpfDoc);
    const exeGenerated = canonicalStringify(replayed.exeDoc);

    // Diff against the noise-normalised twins so random guids, RND column
    // names, and timestamps stop dominating the report. Presence of the
    // field is preserved (both sides collapse to the same placeholder), so
    // any surviving diff represents a real structural or value drift.
    const wpfRows = diffTexts(normalizeNoise(wpfExpected), normalizeNoise(wpfGenerated));
    const exeRows = diffTexts(normalizeNoise(exeExpected), normalizeNoise(exeGenerated));

    const wpf: VariantTestResult = {
      variant: 'wpf',
      expectedText: wpfExpected,
      generatedText: wpfGenerated,
      diffRows: wpfRows,
      diffCount: countDiffs(wpfRows),
      match: countDiffs(wpfRows) === 0,
    };
    const exe: VariantTestResult = {
      variant: 'exe',
      expectedText: exeExpected,
      generatedText: exeGenerated,
      diffRows: exeRows,
      diffCount: countDiffs(exeRows),
      match: countDiffs(exeRows) === 0,
    };

    const warnings = [...applied.warnings, ...replayed.warnings];
    const ranAt = Date.now();

    logTestRun({
      baseStep,
      nextStep,
      seedCount: acrossEntries.length,
      dtoBytes: dtoText.length,
      plan,
      warnings,
      wpf,
      exe,
      ranAt,
      probes: {
        dtoInputFields: probeInputFields(dtoObj, 'dto'),
        baseWpfInputFields: probeInputFields(baseWpf, 'base-wpf'),
        nextWpfInputFields: probeInputFields(nextWpf, 'next-wpf'),
        generatedWpfInputFields: probeInputFields(replayed.wpfDoc, 'generated-wpf'),
        wpfLeafDiffs: probeLeafDiffs(nextWpf, replayed.wpfDoc, 20),
        exeLeafDiffs: probeLeafDiffs(nextExe, replayed.exeDoc, 20),
        // For every leaf that ended up drifting from the expected doc, also
        // show what BASE and DTO had there. This tells us whether the miss
        // is (a) base drifted before we even ran, (b) DTO says one thing and
        // applier overrode it, or (c) something in replay wrote a stale value.
        wpfDriftContext: probeDriftContext(
          nextWpf,
          replayed.wpfDoc,
          baseWpf,
          applied.wpf.doc,
          20,
        ),
        exeDriftContext: probeDriftContext(
          nextExe,
          replayed.exeDoc,
          baseExe,
          applied.exe.doc,
          20,
        ),
      },
    });

    return {
      baseStep,
      nextStep,
      dtoText,
      plan,
      wpf,
      exe,
      warnings,
      isReady: true,
      hasVerdicts,
      hasBothVariants,
      seedCount: acrossEntries.length,
      ranAt,
    };
  }, [bundle, verdicts, hideNoise, baseOrdinal]);
}

function countDiffs(rows: DiffRow[]): number {
  let n = 0;
  for (const row of rows) if (row.k !== '=') n++;
  return n;
}

/**
 * Stable, key-sorted stringify so that a "structurally equal but key-order
 * different" document doesn't produce spurious line-level diffs.
 */
function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = sortDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

const GUID_RX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const RND_COL_RX = /RND[A-Z0-9]{8,}/g;
const ISO_TS_RX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g;

/**
 * Replace inherently non-deterministic tokens (guids, RND column names, ISO
 * timestamps) with stable placeholders so the diff highlights only real
 * structural or value drift. The zero-guid stays as-is since it is a
 * meaningful "unset" marker in this domain — collapsing it to the same
 * placeholder as real guids would hide the difference between "unset" and
 * "assigned a real id".
 */
function normalizeNoise(text: string): string {
  const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
  return text
    .replace(GUID_RX, (m) => (m.toLowerCase() === ZERO_GUID ? m : '<guid>'))
    .replace(RND_COL_RX, '<rnd-col>')
    .replace(ISO_TS_RX, '<ts>');
}

interface LogInput {
  baseStep: JourneyStep;
  nextStep: JourneyStep;
  seedCount: number;
  dtoBytes: number;
  plan: OperationPlan;
  warnings: string[];
  wpf: VariantTestResult;
  exe: VariantTestResult;
  ranAt: number;
  probes: Record<string, unknown>;
}

/**
 * Snapshot every `InputFields.$values` array in the doc so we can see (in the
 * debug log) which plugin actually hosts the round-tripped columns. The DTO
 * uses relative form and only exposes a single `InputFields`, whereas the raw
 * WPF doc keeps a `Plugins[]` array where any index (usually not 0) hosts
 * the field-mapping subtree.
 */
function probeInputFields(doc: unknown, label: string): unknown {
  const locations = collectInputFieldsLocations(doc);
  if (!locations.length) return { label, present: false };
  return {
    label,
    present: true,
    plugins: locations.map((loc) => ({
      plugin: loc.plugin,
      length: loc.values.length,
      elements: loc.values.map((el) => {
        if (!el || typeof el !== 'object') return { keys: [], title: null };
        const rec = el as Record<string, unknown>;
        const bd = rec.BaseDataType as Record<string, unknown> | undefined;
        const ct = bd?.ColumnType as Record<string, unknown> | undefined;
        return {
          keys: Object.keys(rec).sort(),
          title: rec.Title ?? null,
          columnType: ct?.$value ?? null,
          length: bd?.Length ?? null,
          scale: bd?.Scale ?? null,
        };
      }),
    })),
  };
}

interface InputFieldsLocation {
  plugin: string;
  values: unknown[];
}

/**
 * Walk `expected` and `generated` in parallel and return the first N leaf
 * mismatches with their exact JSON path + both values. Complements the
 * text-diff by naming *which* field drifted (e.g. every path where a
 * `Title` leaf silently became empty string) instead of just showing line
 * numbers whose meaning depends on file layout.
 */
function probeLeafDiffs(
  expected: unknown,
  generated: unknown,
  limit: number,
): Array<{ path: string; expected: unknown; generated: unknown }> {
  const out: Array<{ path: string; expected: unknown; generated: unknown }> = [];
  walkPairs(expected, generated, [], out, limit);
  return out;
}

function walkPairs(
  a: unknown,
  b: unknown,
  path: string[],
  out: Array<{ path: string; expected: unknown; generated: unknown }>,
  limit: number,
): void {
  if (out.length >= limit) return;
  const aIsObj = a !== null && typeof a === 'object';
  const bIsObj = b !== null && typeof b === 'object';
  if (!aIsObj && !bIsObj) {
    if (!primitivesEqual(a, b)) out.push({ path: '/' + path.join('/'), expected: a, generated: b });
    return;
  }
  if (aIsObj !== bIsObj) {
    out.push({ path: '/' + path.join('/'), expected: summarize(a), generated: summarize(b) });
    return;
  }
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) {
    out.push({ path: '/' + path.join('/'), expected: summarize(a), generated: summarize(b) });
    return;
  }
  if (aIsArr) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    const n = Math.max(arrA.length, arrB.length);
    for (let i = 0; i < n; i++) {
      walkPairs(arrA[i], arrB[i], [...path, String(i)], out, limit);
      if (out.length >= limit) return;
    }
    return;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(recA), ...Object.keys(recB)]);
  for (const k of Array.from(keys).sort()) {
    walkPairs(recA[k], recB[k], [...path, k], out, limit);
    if (out.length >= limit) return;
  }
}

function primitivesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return false;
}

/**
 * For every leaf that differs between expected and generated, also report
 * what BASE (the untouched clone-source) and the POST-APPLY doc (before
 * derived replay) held at the same path. Separates "base drift" from
 * "applier drift" from "replay drift" without instrumenting every writer.
 */
function probeDriftContext(
  expected: unknown,
  generated: unknown,
  base: unknown,
  postApply: unknown,
  limit: number,
): Array<{
  path: string;
  expected: unknown;
  base: unknown;
  postApply: unknown;
  generated: unknown;
}> {
  const diffs = probeLeafDiffs(expected, generated, limit);
  return diffs.map((d) => ({
    path: d.path,
    expected: d.expected,
    base: readPath(base, d.path),
    postApply: readPath(postApply, d.path),
    generated: d.generated,
  }));
}

function readPath(doc: unknown, path: string): unknown {
  const segs = path.split('/').filter(Boolean);
  let cur = doc;
  for (const seg of segs) {
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function summarize(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return `[array len=${v.length}]`;
  return `{keys=${Object.keys(v as Record<string, unknown>).sort().join(',')}}`;
}

function collectInputFieldsLocations(doc: unknown): InputFieldsLocation[] {
  if (!doc || typeof doc !== 'object') return [];
  const root = doc as Record<string, unknown>;
  const out: InputFieldsLocation[] = [];
  // DTO / relative form.
  const directInput = (root.InputFields as Record<string, unknown> | undefined)?.$values;
  if (Array.isArray(directInput)) out.push({ plugin: 'dto-root', values: directInput });
  // Raw WPF form: BoardModel.Plugins.$values[i].InputFields.$values.
  const board = root.BoardModel as Record<string, unknown> | undefined;
  const plugins = (board?.Plugins ?? root.Plugins) as Record<string, unknown> | undefined;
  const arr = plugins?.$values as unknown[] | undefined;
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i++) {
      const plugin = arr[i] as Record<string, unknown> | null;
      const input = plugin?.InputFields as Record<string, unknown> | undefined;
      const values = input?.$values;
      if (Array.isArray(values)) out.push({ plugin: `Plugins[${i}]`, values });
    }
  }
  return out;
}

/**
 * Persist a compact NDJSON entry per run to the local debug ingest endpoint.
 * The user asked for durable logs to make regressions traceable across runs.
 */
function logTestRun(input: LogInput): void {
  const summary = {
    baseStep: input.baseStep.ordinal,
    baseLabel: input.baseStep.label,
    nextStep: input.nextStep.ordinal,
    nextLabel: input.nextStep.label,
    nextOperation: input.nextStep.operation,
    seedCount: input.seedCount,
    dtoBytes: input.dtoBytes,
    warnings: input.warnings,
    probes: input.probes,
    wpf: {
      match: input.wpf.match,
      diffCount: input.wpf.diffCount,
      firstMismatches: firstMismatchLines(input.wpf.diffRows, 25),
      elementOps: input.plan.wpf.elements.map((op) => ({
        kind: op.kind,
        parent: op.parentArrayPath,
        mintedIndex: op.mintedIndex ?? null,
        template: op.templateEntry.canonical,
      })),
      fieldOps: input.plan.wpf.fields.map((op) => ({
        kind: op.kind,
        path: op.concretePath,
        from: op.fromValue,
        to: op.toValue,
      })),
    },
    exe: {
      match: input.exe.match,
      diffCount: input.exe.diffCount,
      firstMismatches: firstMismatchLines(input.exe.diffRows, 25),
      elementOps: input.plan.exe.elements.map((op) => ({
        kind: op.kind,
        parent: op.parentArrayPath,
        mintedIndex: op.mintedIndex ?? null,
        template: op.templateEntry.canonical,
      })),
      fieldOps: input.plan.exe.fields.map((op) => ({
        kind: op.kind,
        path: op.concretePath,
        from: op.fromValue,
        to: op.toValue,
      })),
    },
    ranAt: input.ranAt,
  };

  try {
    fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '26b876',
      },
      body: JSON.stringify({
        sessionId: '26b876',
        runId: 'test-run',
        location: 'useTestRun.ts',
        message: 'test round-trip summary',
        data: summary,
        timestamp: input.ranAt,
      }),
    }).catch(() => {});
  } catch {}
}

function firstMismatchLines(rows: DiffRow[], limit: number): Array<{
  k: DiffRow['k'];
  an: number | null;
  bn: number | null;
  expected: string | null;
  generated: string | null;
}> {
  const out: Array<{
    k: DiffRow['k'];
    an: number | null;
    bn: number | null;
    expected: string | null;
    generated: string | null;
  }> = [];
  for (const row of rows) {
    if (row.k === '=') continue;
    out.push({ k: row.k, an: row.an, bn: row.bn, expected: row.a, generated: row.b });
    if (out.length >= limit) break;
  }
  return out;
}
