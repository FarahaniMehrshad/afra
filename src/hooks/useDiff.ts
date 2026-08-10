import { useMemo } from 'react';
import { diffTexts } from '@/services/diff.service';
import type { DiffRow } from '@/types/diff';
import type { BuildResult } from '@/types/ir';

/**
 * Compute (and memoise) the diff rows for the current step. We diff
 * against the previous step's document, which is what the "one operation
 * per step" mental model asks for.
 */
export function useDiff(build: BuildResult | null, idx: number): DiffRow[] {
  return useMemo(() => {
    if (!build) return [];
    const cur = build.docs[idx]?.text ?? '';
    const prev = idx > 0 ? build.docs[idx - 1]?.text ?? '' : '';
    return diffTexts(prev, cur);
  }, [build, idx]);
}
