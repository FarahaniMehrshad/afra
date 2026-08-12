export interface LeafPath {
  segs: string[];
  value: unknown;
}

export function toRelativeSegments(path: string): string[] {
  const segs = path.split('/').filter(Boolean);
  if (!segs.length) return [];

  let i = 0;
  if (segs[i] === 'BoardModel') i++;

  if (segs[i] === 'Plugins' && segs[i + 1] === '$values' && segs[i + 2] === '[]') {
    i += 3;
    return segs.slice(i);
  }

  if (
    segs[i] === 'Links' &&
    segs[i + 1] === '$values' &&
    segs[i + 2] === '[]' &&
    segs[i + 3] === 'Map' &&
    segs[i + 4] === '$values' &&
    segs[i + 5] === '[]' &&
    segs[i + 6] === 'Source'
  ) {
    i += 7;
    return segs.slice(i);
  }

  return segs.slice(i);
}

export function flattenLeaves(doc: unknown): LeafPath[] {
  const out: LeafPath[] = [];
  walkLeaves(doc, [], out);
  return out;
}

function walkLeaves(node: unknown, segs: string[], out: LeafPath[]): void {
  if (node === null || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    out.push({ segs: [...segs], value: node });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walkLeaves(node[i], [...segs, String(i)], out);
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkLeaves(v, [...segs, k], out);
    }
  }
}

export function matchingLeaves(leaves: LeafPath[], canonSegs: string[]): LeafPath[] {
  const out: LeafPath[] = [];
  for (const leaf of leaves) {
    if (leaf.segs.length !== canonSegs.length) continue;
    let ok = true;
    for (let i = 0; i < canonSegs.length; i++) {
      const c = canonSegs[i];
      const s = leaf.segs[i];
      if (c !== '[]' && c !== s) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(leaf);
  }
  return out;
}

export function toRelativeConcreteSegments(absSegs: string[]): string[] {
  if (!absSegs.length) return [];
  let i = 0;
  if (absSegs[i] === 'BoardModel') i++;

  if (
    absSegs[i] === 'Plugins' &&
    absSegs[i + 1] === '$values' &&
    isIndexSeg(absSegs[i + 2])
  ) {
    return absSegs.slice(i + 3);
  }

  if (
    absSegs[i] === 'Links' &&
    absSegs[i + 1] === '$values' &&
    isIndexSeg(absSegs[i + 2]) &&
    absSegs[i + 3] === 'Map' &&
    absSegs[i + 4] === '$values' &&
    isIndexSeg(absSegs[i + 5]) &&
    absSegs[i + 6] === 'Source'
  ) {
    return absSegs.slice(i + 7);
  }

  return absSegs.slice(i);
}

export function isIndexSeg(seg: string | undefined): boolean {
  return typeof seg === 'string' && /^\d+$/.test(seg);
}

export function setConcrete(
  root: Record<string, unknown>,
  relSegs: string[],
  value: unknown,
  overwrite: boolean,
): void {
  if (!relSegs.length) return;
  let node: unknown = root;

  for (let i = 0; i < relSegs.length; i++) {
    const seg = relSegs[i];
    const isLast = i === relSegs.length - 1;
    const next = relSegs[i + 1];
    const segIsIndex = /^\d+$/.test(seg);
    const nextIsIndex = /^\d+$/.test(next ?? '');

    if (segIsIndex) {
      const idx = Number(seg);
      if (!Array.isArray(node)) return;
      if (isLast) {
        if (overwrite || node[idx] === undefined) node[idx] = value;
        return;
      }
      if (node[idx] === undefined) node[idx] = nextIsIndex ? [] : {};
      node = node[idx];
      continue;
    }

    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const rec = node as Record<string, unknown>;
    if (isLast) {
      if (overwrite || rec[seg] === undefined) rec[seg] = value;
      return;
    }
    if (rec[seg] === undefined) rec[seg] = nextIsIndex ? [] : {};
    node = rec[seg];
  }
}
