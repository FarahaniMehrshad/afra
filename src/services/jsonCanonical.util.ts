/**
 * Stable, key-sorted stringify so structurally equal documents don't produce
 * spurious line-level diffs from key order or formatting drift.
 */
export function canonicalStringify(value: unknown): string {
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
