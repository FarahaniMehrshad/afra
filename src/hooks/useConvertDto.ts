import { useMemo } from 'react';
import { getBuild } from '@/hooks/useBuild';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { applyOperationPlan } from '@/services/dto.applyPlan';
import { replayDerivedChanges } from '@/services/dto.deriveReplay';
import { buildDtoDiffPlan } from '@/services/dto.diffPlan';
import { buildImpactDtoFromStep } from '@/services/impactDto.service';
import { computeUiFieldImpact, mergeAcrossVariants } from '@/services/impact.service';
import type { OperationPlan } from '@/types/convert';
import type { UiFieldEntry } from '@/types/impact';
import type { JourneyStep } from '@/types/journey';

interface UseConvertDtoResult {
  baseStep: JourneyStep | null;
  baseWpfText: string;
  baseExeText: string;
  parseError: string;
  parsedDto: unknown | null;
  plan: OperationPlan | null;
  wpfOut: unknown | null;
  exeOut: unknown | null;
  warnings: string[];
  isReady: boolean;
  hasVerdicts: boolean;
  hasBothVariants: boolean;
  seedEntries: { wpf: UiFieldEntry[]; exe: UiFieldEntry[]; across: UiFieldEntry[] };
  prefillDtoText: string;
}

export function useConvertDto(): UseConvertDtoResult {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const baseOrdinal = useAppStore((s) => s.convertBaseStepOrdinal);
  const dtoText = useAppStore((s) => s.convertDtoText);
  const verdicts = useLlmStore((s) => s.verdicts);

  return useMemo(() => {
    const empty: UseConvertDtoResult = {
      baseStep: null,
      baseWpfText: '',
      baseExeText: '',
      parseError: '',
      parsedDto: null,
      plan: null,
      wpfOut: null,
      exeOut: null,
      warnings: [],
      isReady: false,
      hasVerdicts: verdicts.size > 0,
      hasBothVariants: false,
      seedEntries: { wpf: [], exe: [], across: [] },
      prefillDtoText: '',
    };
    if (!bundle) return empty;

    const wpfBuild = getBuild(bundle, 'wpf');
    const exeBuild = getBuild(bundle, 'exe');
    const selectedIdx = bundle.steps.findIndex((s) => s.ordinal === baseOrdinal);
    const baseStep = bundle.steps[selectedIdx] ?? null;
    const wpfDoc = selectedIdx >= 0 ? wpfBuild.docs[selectedIdx]?.obj ?? null : null;
    const exeDoc = selectedIdx >= 0 ? exeBuild.docs[selectedIdx]?.obj ?? null : null;
    const baseWpfText = selectedIdx >= 0 ? wpfBuild.docs[selectedIdx]?.text ?? '' : '';
    const baseExeText = selectedIdx >= 0 ? exeBuild.docs[selectedIdx]?.text ?? '' : '';

    const wpfEntries =
      verdicts.size === 0
        ? []
        : computeUiFieldImpact({
            build: wpfBuild,
            variant: 'wpf',
            verdicts,
            steps: bundle.steps,
            hideNoise,
            includeCategories: ['derived'],
            includeUnclassified: false,
          });
    const exeEntries =
      verdicts.size === 0
        ? []
        : computeUiFieldImpact({
            build: exeBuild,
            variant: 'exe',
            verdicts,
            steps: bundle.steps,
            hideNoise,
            includeCategories: ['derived'],
            includeUnclassified: false,
          });
    const acrossEntries = mergeAcrossVariants(wpfEntries, exeEntries);
    const prefillDto = buildImpactDtoFromStep(acrossEntries, wpfDoc, exeDoc, {
      withSampleValues: true,
    });
    const prefillDtoText = JSON.stringify(prefillDto, null, 4);

    if (dtoText.trim().length === 0) {
      return {
        ...empty,
        baseStep,
        baseWpfText,
        baseExeText,
        hasBothVariants: Boolean(wpfDoc && exeDoc),
        seedEntries: { wpf: wpfEntries, exe: exeEntries, across: acrossEntries },
        prefillDtoText,
      };
    }

    let parsedDto: unknown;
    try {
      parsedDto = JSON.parse(dtoText);
    } catch (error) {
      return {
        ...empty,
        baseStep,
        baseWpfText,
        baseExeText,
        parseError: error instanceof Error ? error.message : 'Invalid JSON',
        parsedDto: null,
        hasBothVariants: Boolean(wpfDoc && exeDoc),
        seedEntries: { wpf: wpfEntries, exe: exeEntries, across: acrossEntries },
        prefillDtoText,
      };
    }

    if (!wpfDoc || !exeDoc || verdicts.size === 0) {
      return {
        ...empty,
        baseStep,
        baseWpfText,
        baseExeText,
        parsedDto,
        hasBothVariants: Boolean(wpfDoc && exeDoc),
        seedEntries: { wpf: wpfEntries, exe: exeEntries, across: acrossEntries },
        prefillDtoText,
      };
    }

    const plan = buildDtoDiffPlan({
      dto: parsedDto,
      wpfDoc,
      exeDoc,
      wpfEntries,
      exeEntries,
    });
    const applied = applyOperationPlan({
      plan,
      wpfDoc,
      exeDoc,
    });
    const replayed = replayDerivedChanges({
      wpfDoc: applied.wpf.doc,
      exeDoc: applied.exe.doc,
      wpfFields: applied.wpf.fields,
      exeFields: applied.exe.fields,
      wpfElements: applied.wpf.elements,
      exeElements: applied.exe.elements,
      wpfEntries,
      exeEntries,
    });

    return {
      ...empty,
      baseStep,
      baseWpfText,
      baseExeText,
      parsedDto,
      plan,
      wpfOut: replayed.wpfDoc,
      exeOut: replayed.exeDoc,
      warnings: [...applied.warnings, ...replayed.warnings],
      isReady: true,
      hasBothVariants: true,
      seedEntries: { wpf: wpfEntries, exe: exeEntries, across: acrossEntries },
      prefillDtoText,
    };
  }, [bundle, verdicts, hideNoise, baseOrdinal, dtoText]);
}
