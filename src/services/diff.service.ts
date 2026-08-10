import { COLORS } from '@/constants';
import type { DiffRow, WordSegment } from '@/types/diff';
import { isNoiseLine } from './noise.service';

/**
 * Line-level diff for the per-step pane.
 *
 * The heart of the algorithm is a Myers O(ND) implementation with a hard
 * upper bound on the search depth — if two files diverge wildly we fall
 * back to a naïve remove-everything-then-add-everything script rather than
 * hang the UI.
 */

interface MyersOp {
  t: '=' | '+' | '-';
  ai?: number;
  bi?: number;
}

function myers(A: string[], B: string[]): MyersOp[] {
  const N = A.length;
  const M = B.length;
  const MAX = Math.min(N + M, 4000);
  const off = MAX + 1;
  const V = new Int32Array(2 * MAX + 3);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= MAX; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) {
        x = V[off + k + 1];
      } else {
        x = V[off + k - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) {
        x++;
        y++;
      }
      V[off + k] = x;

      if (x >= N && y >= M) {
        const res: MyersOp[] = [];
        let cx = N;
        let cy = M;
        for (let D = d; D > 0; D--) {
          const Vp = trace[D];
          const kk = cx - cy;
          let pk: number;
          if (kk === -D || (kk !== D && Vp[off + kk - 1] < Vp[off + kk + 1])) {
            pk = kk + 1;
          } else {
            pk = kk - 1;
          }
          const px = Vp[off + pk];
          const py = px - pk;
          while (cx > px && cy > py) {
            cx--;
            cy--;
            res.push({ t: '=', ai: cx, bi: cy });
          }
          if (cx > px) {
            cx--;
            res.push({ t: '-', ai: cx });
          } else {
            cy--;
            res.push({ t: '+', bi: cy });
          }
        }
        while (cx > 0 && cy > 0) {
          cx--;
          cy--;
          res.push({ t: '=', ai: cx, bi: cy });
        }
        return res.reverse();
      }
    }
  }

  // Fallback for pathological inputs.
  const fb: MyersOp[] = [];
  for (let i = 0; i < N; i++) fb.push({ t: '-', ai: i });
  for (let j = 0; j < M; j++) fb.push({ t: '+', bi: j });
  return fb;
}

/** Fast prefix/suffix trim wrapping Myers so common runs cost O(n). */
export function diffLines(a: string[], b: string[]): MyersOp[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (
    e < a.length - s &&
    e < b.length - s &&
    a[a.length - 1 - e] === b[b.length - 1 - e]
  ) {
    e++;
  }
  const ops = myers(a.slice(s, a.length - e), b.slice(s, b.length - e));
  const out: MyersOp[] = [];
  for (let i = 0; i < s; i++) out.push({ t: '=', ai: i, bi: i });
  for (const o of ops) {
    out.push({
      t: o.t,
      ai: o.ai === undefined ? undefined : o.ai + s,
      bi: o.bi === undefined ? undefined : o.bi + s,
    });
  }
  for (let i = 0; i < e; i++) {
    out.push({ t: '=', ai: a.length - e + i, bi: b.length - e + i });
  }
  return out;
}

/** Highlight the *inside* of a modify pair by common prefix/suffix. */
export function wordSegs(
  oldS: string | null,
  newS: string | null,
): { del: WordSegment[]; add: WordSegment[] } | null {
  if (oldS === null || newS === null) return null;
  let p = 0;
  while (p < oldS.length && p < newS.length && oldS[p] === newS[p]) p++;
  let q = 0;
  while (
    q < oldS.length - p &&
    q < newS.length - p &&
    oldS[oldS.length - 1 - q] === newS[newS.length - 1 - q]
  ) {
    q++;
  }
  const filter = (segs: WordSegment[]) => segs.filter((x) => x.t);
  return {
    del: filter([
      { t: oldS.slice(0, p), bg: 'transparent' },
      { t: oldS.slice(p, oldS.length - q), bg: COLORS.removeWordBg },
      { t: oldS.slice(oldS.length - q), bg: 'transparent' },
    ]),
    add: filter([
      { t: newS.slice(0, p), bg: 'transparent' },
      { t: newS.slice(p, newS.length - q), bg: COLORS.addWordBg },
      { t: newS.slice(newS.length - q), bg: 'transparent' },
    ]),
  };
}

/**
 * Rewrite raw Myers ops into the row shape the view layer wants. Groups
 * runs of - then + into paired "mod" rows so side-by-side lines up.
 */
export function opsToRows(
  ops: MyersOp[],
  prev: string[],
  cur: string[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < ops.length) {
    const o = ops[i];
    if (o.t === '=') {
      rows.push({
        k: '=',
        a: prev[o.ai!],
        b: cur[o.bi!],
        an: o.ai! + 1,
        bn: o.bi! + 1,
      });
      i++;
      continue;
    }
    const dels: MyersOp[] = [];
    const adds: MyersOp[] = [];
    while (i < ops.length && ops[i].t === '-') {
      dels.push(ops[i]);
      i++;
    }
    while (i < ops.length && ops[i].t === '+') {
      adds.push(ops[i]);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let j = 0; j < n; j++) {
      const d = dels[j];
      const p = adds[j];
      const dt = d ? prev[d.ai!] : null;
      const pt = p ? cur[p.bi!] : null;
      const segs = d && p ? wordSegs(dt, pt) : null;
      rows.push({
        k: d && p ? 'mod' : d ? 'del' : 'add',
        a: dt,
        b: pt,
        an: d ? d.ai! + 1 : null,
        bn: p ? p.bi! + 1 : null,
        lsegs: segs
          ? segs.del
          : dt !== null && dt !== undefined
            ? [{ t: dt, bg: 'transparent' }]
            : null,
        rsegs: segs
          ? segs.add
          : pt !== null && pt !== undefined
            ? [{ t: pt, bg: 'transparent' }]
            : null,
        noise: isNoiseLine(dt) || isNoiseLine(pt),
      });
    }
  }
  return rows;
}

/**
 * Compare two chunks of JSON text. The prev text can be empty for the
 * baseline step; in that case every line reads as an addition.
 */
export function diffTexts(prevText: string, curText: string): DiffRow[] {
  const cur = curText ? curText.split('\n') : [];
  const prev = prevText ? prevText.split('\n') : [];
  const ops = diffLines(prev, cur);
  return opsToRows(ops, prev, cur);
}
