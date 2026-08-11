import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import type { ImpactDerivedCategory, UiFieldImpact } from '@/types/impact';
import { getBuild } from './useBuild';
import { computeUiFieldImpact } from '@/services/impact.service';

interface UseUiFieldImpactResult {
  wpf: UiFieldImpact | null;
  exe: UiFieldImpact | null;
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
  const verdicts = useLlmStore((s) => s.verdicts);

  return useMemo(() => {
    if (!bundle) {
      return {
        wpf: null,
        exe: null,
        hasVerdicts: false,
        hasBothVariants: false,
        totals: { fields: 0, occurrences: 0, derived: 0 },
      };
    }

    const include: ImpactDerivedCategory[] = ['derived'];
    if (includeRandomId) include.push('random-id');

    const wpfBuild = getBuild(bundle, 'wpf');
    const exeBuild = getBuild(bundle, 'exe');

    const wpf = toImpact('wpf', computeUiFieldImpact({
      build: wpfBuild,
      variant: 'wpf',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: include,
      includeUnclassified,
    }));
    const exe = toImpact('exe', computeUiFieldImpact({
      build: exeBuild,
      variant: 'exe',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: include,
      includeUnclassified,
    }));

    return {
      wpf,
      exe,
      hasVerdicts: verdicts.size > 0,
      hasBothVariants: Boolean(wpfBuild && exeBuild),
      totals: {
        fields: (wpf?.totals.fields ?? 0) + (exe?.totals.fields ?? 0),
        occurrences: (wpf?.totals.occurrences ?? 0) + (exe?.totals.occurrences ?? 0),
        derived: (wpf?.totals.derived ?? 0) + (exe?.totals.derived ?? 0),
      },
    };
  }, [bundle, verdicts, hideNoise, includeRandomId, includeUnclassified]);
}

function toImpact(variant: 'wpf' | 'exe', entries: ReturnType<typeof computeUiFieldImpact>): UiFieldImpact {
  const occurrences = entries.reduce(
    (n, e) => n + e.byKind.add.length + e.byKind.remove.length + e.byKind.modify.length,
    0,
  );
  const derived = entries.reduce((n, e) => n + e.totals.derived, 0);
  return {
    variant,
    entries,
    totals: {
      fields: entries.length,
      occurrences,
      derived,
    },
  };
}
