import { useMemo } from 'react';
import type { BuildResult } from '@/types/ir';
import type { JourneyBundle, Variant } from '@/types/journey';
import { useAppStore } from '@/store/appStore';
import { build } from '@/services/build.service';

/**
 * Memoise the per-variant build so switching variants doesn't rebuild the
 * one you already had. The cache key is (bundle identity, variant).
 */
const cache = new WeakMap<object, Partial<Record<Variant, BuildResult>>>();

/**
 * Build outside of React. The LLM pass needs both variants at once and must
 * not disturb the variant the user is looking at.
 */
export function getBuild(bundle: JourneyBundle, variant: Variant): BuildResult {
  let bucket = cache.get(bundle);
  if (!bucket) {
    bucket = {};
    cache.set(bundle, bucket);
  }
  let res = bucket[variant];
  if (!res) {
    res = build(bundle, variant);
    bucket[variant] = res;
  }
  return res;
}

export function useBuild(): BuildResult | null {
  const bundle = useAppStore((s) => s.bundle);
  const variant = useAppStore((s) => s.variant);

  return useMemo(() => (bundle ? getBuild(bundle, variant) : null), [bundle, variant]);
}
