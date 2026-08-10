import { useMemo } from 'react';
import type { BuildResult } from '@/types/ir';
import { useAppStore } from '@/store/appStore';
import { build } from '@/services/build.service';

/**
 * Memoise the per-variant build so switching variants doesn't rebuild the
 * one you already had. The cache key is (bundle identity, variant).
 */
const cache = new WeakMap<object, Partial<Record<string, BuildResult>>>();

export function useBuild(): BuildResult | null {
  const bundle = useAppStore((s) => s.bundle);
  const variant = useAppStore((s) => s.variant);

  return useMemo(() => {
    if (!bundle) return null;
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
  }, [bundle, variant]);
}
