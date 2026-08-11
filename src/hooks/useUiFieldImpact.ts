import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import type { ImpactDerivedCategory, UiFieldImpact } from '@/types/impact';
import { getBuild } from './useBuild';
import {
  computeUiFieldImpact,
  mergeAcrossVariants,
  mergeSameValueClusters,
} from '@/services/impact.service';

interface UseUiFieldImpactResult {
  mode: 'off' | 'within' | 'across';
  wpf: UiFieldImpact | null;
  exe: UiFieldImpact | null;
  combined: UiFieldImpact | null;
  hasVerdicts: boolean;
  hasBothVariants: boolean;
  totals: {
    fields: number;
    occurrences: number;
    derived: number;
  };
}

export function useUiFieldImpact(): UseUiFieldImpactResult {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const includeRandomId = useAppStore((s) => s.impactIncludeRandomId);
  const includeUnclassified = useAppStore((s) => s.impactIncludeUnclassified);
  const mergeMode = useAppStore((s) => s.impactMergeMode);
  const verdicts = useLlmStore((s) => s.verdicts);

  return useMemo(() => {
    if (!bundle) {
      return {
        mode: mergeMode,
        wpf: null,
        exe: null,
        combined: null,
        hasVerdicts: false,
        hasBothVariants: false,
        totals: { fields: 0, occurrences: 0, derived: 0 },
      };
    }

    const include: ImpactDerivedCategory[] = ['derived'];
    if (includeRandomId) include.push('random-id');

    const wpfBuild = getBuild(bundle, 'wpf');
    const exeBuild = getBuild(bundle, 'exe');

    const wpfEntries = computeUiFieldImpact({
      build: wpfBuild,
      variant: 'wpf',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: include,
      includeUnclassified,
    });
    const exeEntries = computeUiFieldImpact({
      build: exeBuild,
      variant: 'exe',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: include,
      includeUnclassified,
    });

    let wpf: UiFieldImpact | null = null;
    let exe: UiFieldImpact | null = null;
    let combined: UiFieldImpact | null = null;

    if (mergeMode === 'off') {
      wpf = toImpact('wpf', 'wpf', wpfEntries);
      exe = toImpact('exe', 'exe', exeEntries);
    } else if (mergeMode === 'within') {
      wpf = toImpact('wpf', 'wpf', mergeSameValueClusters(wpfEntries));
      exe = toImpact('exe', 'exe', mergeSameValueClusters(exeEntries));
    } else {
      combined = toImpact(
        'combined',
        'wpf + exe',
        mergeAcrossVariants(wpfEntries, exeEntries),
      );
    }

    return {
      mode: mergeMode,
      wpf,
      exe,
      combined,
      hasVerdicts: verdicts.size > 0,
      hasBothVariants: Boolean(wpfBuild && exeBuild),
      totals: {
        fields:
          combined?.totals.fields ?? (wpf?.totals.fields ?? 0) + (exe?.totals.fields ?? 0),
        occurrences:
          combined?.totals.occurrences ??
          (wpf?.totals.occurrences ?? 0) + (exe?.totals.occurrences ?? 0),
        derived:
          combined?.totals.derived ?? (wpf?.totals.derived ?? 0) + (exe?.totals.derived ?? 0),
      },
    };
  }, [
    bundle,
    verdicts,
    hideNoise,
    includeRandomId,
    includeUnclassified,
    mergeMode,
  ]);
}

function toImpact(
  variant: 'wpf' | 'exe' | 'combined',
  label: string,
  entries: ReturnType<typeof computeUiFieldImpact>,
): UiFieldImpact {
  const occurrences = entries.reduce(
    (n, e) => n + e.byKind.add.length + e.byKind.remove.length + e.byKind.modify.length,
    0,
  );
  const derived = entries.reduce((n, e) => n + e.totals.derived, 0);
  return {
    variant,
    label,
    entries,
    totals: {
      fields: entries.length,
      occurrences,
      derived,
    },
  };
}
