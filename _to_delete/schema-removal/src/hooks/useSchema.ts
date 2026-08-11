import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { getBuild } from './useBuild';
import { buildSchema, longestStepIndex } from '@/services/schema.service';
import { buildSampleYaml } from '@/services/sampleYaml.service';
import type { Variant } from '@/types/journey';
import type { BuildResult } from '@/types/ir';
import type {
  CompactionReport,
  SchemaResult,
  YamlLine,
} from '@/types/schema';
import { emptyCompactionReport } from '@/types/schema';

/**
 * The JSON-to-YML page's whole data layer: the distilled schema plus a YAML
 * document per variant.
 *
 * Each variant renders its own YAML — one for wpf, one for exe — built from
 * the picked step's raw JSON, trimmed to the LLM-labelled canonical paths
 * (`schema.selected`), then structurally compacted and deduped. That means
 * arrays keep every element (the sample YAML is a real configuration, not a
 * shape) and the two panes are honest about the fact that wpf and exe are
 * two different documents.
 */
export interface SchemaView {
  schema: SchemaResult | null;
  wpf: YamlLine[];
  exe: YamlLine[];
  /** Which step (per variant) actually fed the YAML — falls back to longest when picked step has no doc. */
  effective: Record<Variant, number | null>;
}

const VARIANTS: Variant[] = ['wpf', 'exe'];

export function useSchema(): SchemaView {
  const bundle = useAppStore((s) => s.bundle);
  const verdicts = useLlmStore((s) => s.verdicts);
  const sampleStepIdx = useAppStore((s) => s.sampleStepIdx);

  const built = useMemo<SchemaView | null>(() => {
    if (!bundle) return null;
    const builds: Record<Variant, BuildResult> = {
      wpf: getBuild(bundle, 'wpf'),
      exe: getBuild(bundle, 'exe'),
    };

    const schema = buildSchema(
      { wpf: builds.wpf, exe: builds.exe },
      verdicts,
    );

    const perVariant: Record<Variant, { lines: YamlLine[]; report: CompactionReport; idx: number | null }> = {
      wpf: renderVariant(builds.wpf, sampleStepIdx, schema.selected),
      exe: renderVariant(builds.exe, sampleStepIdx, schema.selected),
    };

    const compaction: Record<Variant, CompactionReport> = {
      wpf: perVariant.wpf.report,
      exe: perVariant.exe.report,
    };

    return {
      schema: { ...schema, compaction },
      wpf: perVariant.wpf.lines,
      exe: perVariant.exe.lines,
      effective: {
        wpf: perVariant.wpf.idx,
        exe: perVariant.exe.idx,
      },
    };
  }, [bundle, verdicts, sampleStepIdx]);

  if (!built) {
    return {
      schema: null,
      wpf: [],
      exe: [],
      effective: { wpf: null, exe: null },
    };
  }
  return built;
}

/**
 * Pick which step's JSON feeds the YAML for a single variant, then run it
 * through the sample-YAML renderer. When the operator picks a step but that
 * variant has no readable doc for it (the RAS run sometimes skips an .exe.json
 * for a step), we fall back to the longest doc so rows don't blank.
 */
function renderVariant(
  build: BuildResult,
  stepIdx: number | null,
  selected: ReadonlySet<string>,
): { lines: YamlLine[]; report: CompactionReport; idx: number | null } {
  let idx = stepIdx;
  if (
    idx === null ||
    idx < 0 ||
    idx >= build.docs.length ||
    !build.docs[idx]?.obj
  ) {
    idx = longestStepIndex(build);
  }
  if (idx < 0) {
    return { lines: [], report: emptyCompactionReport(), idx: null };
  }
  const raw = build.docs[idx]?.obj;
  if (raw === null || raw === undefined) {
    return { lines: [], report: emptyCompactionReport(), idx: null };
  }
  const { lines, report } = buildSampleYaml(raw, selected);
  return { lines, report, idx };
}

/**
 * Small helper kept for the footer stat elsewhere in the app: the longest
 * step and its size for one variant. Returns null when the variant has
 * nothing readable.
 */
export function sampleStepInfo(
  bundle: ReturnType<typeof useAppStore.getState>['bundle'],
  variant: Variant,
): { stepIdx: number; bytes: number } | null {
  if (!bundle) return null;
  const b = getBuild(bundle, variant);
  const i = longestStepIndex(b);
  if (i < 0) return null;
  return { stepIdx: i, bytes: b.docs[i]?.text.length ?? 0 };
}

export { VARIANTS };
