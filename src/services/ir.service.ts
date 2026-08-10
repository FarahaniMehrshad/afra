import { ID_KEYS, EMPTY_GUID } from '@/constants';
import type {
  IRArr,
  IRNode,
  IRObj,
  IRVal,
  MergedLine,
  Primitive,
} from '@/types/ir';

/**
 * Utilities for turning arbitrary JSON into the AFRA intermediate
 * representation and reasoning about it.
 *
 * The IR keeps insertion order for objects (which JSON.stringify respects)
 * and, crucially, gives each array element a *stable identity key* so
 * merges across steps don't collapse unrelated items just because their
 * ordinal position happens to line up.
 */

/**
 * Choose a stable identity key for an array element. The application's
 * IDs are far more meaningful than positional indices when the very same
 * plugin instance moves around between snapshots.
 *
 * An ID only earns that role when it actually recurs across the journey —
 * the exe exporter regenerates some IDs on every write, and keying on those
 * would make every step look like a wholesale remove + add. Pass the set of
 * IDs seen in more than one step as `stableIds` to fall back to the
 * structural key for the volatile ones.
 */
export function itemKey(
  el: unknown,
  i: number,
  stableIds?: ReadonlySet<string>,
): string {
  if (el && typeof el === 'object' && !Array.isArray(el)) {
    const record = el as Record<string, unknown>;
    for (const k of ID_KEYS) {
      const v = record[k];
      if (typeof v === 'string' && v.length > 8 && v !== EMPTY_GUID) {
        const key = '#' + v;
        if (!stableIds || stableIds.has(key)) return key;
      }
    }
    const t = record.$type;
    if (typeof t === 'string') {
      return '@' + t.split(',')[0] + ':' + i;
    }
  }
  return String(i);
}

/**
 * Collect every id-style array-item key present in a raw JSON value. The
 * build phase counts how many step documents each key shows up in to tell
 * durable identities apart from per-export churn.
 */
export function collectIdKeys(v: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(v)) {
    v.forEach((el, i) => {
      const k = itemKey(el, i);
      if (k.startsWith('#')) out.add(k);
      collectIdKeys(el, out);
    });
    return out;
  }
  if (v && typeof v === 'object') {
    for (const val of Object.values(v as object)) collectIdKeys(val, out);
  }
  return out;
}

/** Recursively sort object keys so that JSON.stringify is stable. */
export function sortKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sortKeys) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort((a, b) => a.localeCompare(b))) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return v;
}

/** Convert plain JSON into the IR tree. */
export function toIR(v: unknown, stableIds?: ReadonlySet<string>): IRNode {
  if (Array.isArray(v)) {
    const arr: IRArr = {
      t: 'arr',
      items: v.map((el, i) => ({
        k: itemKey(el, i, stableIds),
        n: toIR(el, stableIds),
      })),
    };
    return arr;
  }
  if (v && typeof v === 'object') {
    const obj: IRObj = {
      t: 'obj',
      items: Object.keys(v as object).map((k) => ({
        k,
        n: toIR((v as Record<string, unknown>)[k], stableIds),
      })),
    };
    return obj;
  }
  const val: IRVal = { t: 'val', v: v as Primitive };
  return val;
}

/**
 * Merge two IR trees. Order comes from `a` first; new keys from `b` are
 * appended. Primitive values collapse to `b` — the newer snapshot wins.
 * A type change (val → obj etc) also picks the non-`val` side so the
 * merged view keeps the richer structure.
 */
export function mergeIR(a: IRNode | null, b: IRNode | null): IRNode | null {
  if (!a) return b;
  if (!b) return a;
  if (a.t !== b.t) return a.t === 'val' ? b : a;
  if (a.t === 'val') return { t: 'val', v: (b as IRVal).v };

  const container = a as IRObj | IRArr;
  const other = b as IRObj | IRArr;

  const map = new Map<string, IRNode>();
  const order: string[] = [];
  for (const it of container.items) {
    map.set(it.k, it.n);
    order.push(it.k);
  }
  for (const it of other.items) {
    const existing = map.get(it.k);
    if (existing) {
      map.set(it.k, mergeIR(existing, it.n)!);
    } else {
      map.set(it.k, it.n);
      order.push(it.k);
    }
  }
  return {
    t: container.t,
    items: order.map((k) => ({ k, n: map.get(k)! })),
  };
}

/** Flatten an IR to a `path → node` map. Paths look like `/a/b/#guid/c`. */
export function flatten(
  ir: IRNode,
  path: string,
  out: Map<string, IRNode>,
): Map<string, IRNode> {
  out.set(path, ir);
  if (ir.t !== 'val') {
    for (const it of ir.items) flatten(it.n, path + '/' + it.k, out);
  }
  return out;
}

/** Compact string preview used by the history panel. */
export function shortVal(ir: IRNode | undefined | null): string {
  if (!ir) return '—';
  if (ir.t === 'val') return fmt(ir.v);
  if (ir.t === 'arr') return '[ ' + ir.items.length + ' items ]';
  return '{ ' + ir.items.length + ' keys }';
}

/** JSON-format a primitive, coercing undefined into null. */
export function fmt(v: Primitive | undefined): string {
  return JSON.stringify(v === undefined ? null : v);
}

/** Compare two primitive IR nodes by their JSON encoding. */
export function sameVal(a: IRNode, b: IRNode): boolean {
  return a.t === 'val' && b.t === 'val' && fmt(a.v) === fmt(b.v);
}

/**
 * Emit the IR as JSON-shaped lines. We track the source path per line so
 * clicking a line in the "Total diff" pane can look up its history.
 */
export function emitLines(
  n: IRNode,
  path: string,
  label: string,
  depth: number,
  last: boolean,
  out: MergedLine[],
): void {
  const ind = '  '.repeat(depth);
  const tail = last ? '' : ',';

  if (n.t === 'val') {
    out.push({ path, text: ind + label + fmt(n.v), tail, depth });
    return;
  }

  const open = n.t === 'obj' ? '{' : '[';
  const close = n.t === 'obj' ? '}' : ']';

  if (!n.items.length) {
    out.push({ path, text: ind + label + open + close, tail, depth });
    return;
  }

  out.push({ path, text: ind + label + open, tail: '', depth });
  n.items.forEach((it, i) => {
    const lbl = n.t === 'obj' ? JSON.stringify(it.k) + ': ' : '';
    emitLines(
      it.n,
      path + '/' + it.k,
      lbl,
      depth + 1,
      i === n.items.length - 1,
      out,
    );
  });
  out.push({ path, text: ind + close, tail, depth, closer: true });
}
