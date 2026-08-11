import type { Primitive } from '@/types/ir';
import type {
  CompactionReport,
  DuplicateGroup,
  YamlLine,
} from '@/types/schema';

/**
 * Renders the sample YAML for one variant's raw configuration.
 *
 * Every step's JSON is a *real* document — it actually appeared on disk. The
 * sample YAML pane is meant to mirror that document, not describe an abstract
 * shape, so this renderer keeps every array element rather than collapsing
 * arrays onto a single representative like the schema-tree view used to.
 *
 * Four passes, matching the semantics of the generated `converter.js`:
 *
 *   1. Pick. Trim the raw JSON down to just the LLM-labelled canonical paths
 *      (`selected`) and their ancestor containers.
 *   2. Compact + annotate. Peel framework wrappers (`{ $values: [...] }` →
 *      `[...]`, `{ $type, $value }` → the primitive, drop `$type`/`$id`/`$ref`
 *      leaves from mixed objects) while tagging each surviving subtree with
 *      the raw canonical path it came from so the mapping panel still works.
 *   3. Duplicate detection. Hash every subtree and give repeated ones an
 *      anchor name; first occurrence carries `&d1`, later occurrences render
 *      as `*d1` with no body.
 *   4. Emit. Walk the tree and produce `YamlLine[]` tagged with canons.
 *
 * The generated converter (`converter.codegen.ts`) implements the same rules
 * inline as its own JS file — one day worth extracting into a shared source
 * of truth, but the two are simple enough that living side by side is fine
 * as long as they stay in sync.
 */

const META_KEYS = new Set(['$type', '$id', '$ref']);
const ARRAY_SEG = '[]';

type CNode =
  | { kind: 'val'; canon: string; value: Primitive }
  | { kind: 'obj'; canon: string; entries: Array<{ key: string; node: CNode }> }
  | { kind: 'arr'; canon: string; items: CNode[] };

interface PrefixNode {
  children: Map<string, PrefixNode>;
  /** True when a canonical path terminates here — i.e. the LLM asked to keep this exact field. */
  keep: boolean;
}

/** Returned by `pick` for anything the selected set doesn't ask for. */
const DROP = Symbol('drop');

export interface SampleYamlOptions {
  /** Minimum leaf count for a subtree to be worth aliasing. */
  duplicateLeafThreshold?: number;
  /** Minimum number of occurrences for a group to become an alias group. */
  duplicateMinCount?: number;
}

const DEFAULTS: Required<SampleYamlOptions> = {
  duplicateLeafThreshold: 2,
  duplicateMinCount: 2,
};

export interface SampleYamlResult {
  lines: YamlLine[];
  report: CompactionReport;
}

/**
 * Build the YAML pane for one variant.
 *
 * `raw` is the picked step's parsed JSON. `selected` is the set of canonical
 * paths the LLM attributed to a UI operation (schema.selected). Both come
 * straight from `useSchema`.
 */
export function buildSampleYaml(
  raw: unknown,
  selected: ReadonlySet<string>,
  opts: SampleYamlOptions = {},
): SampleYamlResult {
  const o = { ...DEFAULTS, ...opts };
  const report: CompactionReport = {
    collapsedValues: 0,
    collapsedTypeWrappers: 0,
    strippedMetaLeaves: 0,
    duplicates: [],
  };

  const spec = buildPrefixTree(selected);
  const picked = pick(raw, spec);
  if (picked === DROP) {
    return { lines: [emptyLine('')], report };
  }

  const annotated = compactAndAnnotate(picked, '', report);
  const anchors = detectDuplicates(annotated, o, report);

  const lines: YamlLine[] = [];
  emitRoot(annotated, selected, anchors, new Set(), lines);
  if (!lines.length) lines.push(emptyLine(''));

  return { lines, report };
}

/** Serialise `YamlLine[]` back to text, suitable for download. */
export function yamlLinesToText(lines: YamlLine[]): string {
  return lines.map((l) => l.text).join('\n') + '\n';
}

/* ------------------------- Prefix tree ---------------------------------- */

function buildPrefixTree(selected: ReadonlySet<string>): PrefixNode {
  const root: PrefixNode = { children: new Map(), keep: false };
  for (const canon of selected) {
    if (canon === '') {
      root.keep = true;
      continue;
    }
    const segs = canon.split('/').slice(1);
    let cur = root;
    for (const s of segs) {
      let next = cur.children.get(s);
      if (!next) {
        next = { children: new Map(), keep: false };
        cur.children.set(s, next);
      }
      cur = next;
    }
    cur.keep = true;
  }
  return root;
}

/* ------------------------- Pick ----------------------------------------- */
// Mirrors the picker in the generated converter: keep only what the field
// list asks for, drop the rest, and preserve raw structure while doing it.

function pick(value: unknown, spec: PrefixNode): unknown | typeof DROP {
  if (!spec.children.size) return spec.keep ? value : DROP;

  if (Array.isArray(value)) {
    const itemSpec = spec.children.get(ARRAY_SEG);
    if (!itemSpec) return spec.keep ? [] : DROP;
    const out: unknown[] = [];
    for (const item of value) {
      const got = pick(item, itemSpec);
      if (got !== DROP) out.push(got);
    }
    return out;
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    // Preserve source key order so the emitted YAML mirrors the input.
    for (const key of Object.keys(value)) {
      const childSpec = spec.children.get(key);
      if (!childSpec) continue;
      const got = pick((value as Record<string, unknown>)[key], childSpec);
      if (got !== DROP) out[key] = got;
    }
    if (Object.keys(out).length || spec.keep) return out;
    return DROP;
  }

  return spec.keep ? value : DROP;
}

/* --------------------- Compact + canon-annotate ------------------------- */
// Walks the picked JSON, applies structural compaction rules, and hangs the
// original canonical path off every surviving node so the mapping panel can
// still recover the source paths from a clicked line.

function compactAndAnnotate(
  v: unknown,
  canon: string,
  report: CompactionReport,
): CNode {
  if (v === null || typeof v !== 'object') {
    return { kind: 'val', canon, value: v as Primitive };
  }
  if (Array.isArray(v)) {
    return {
      kind: 'arr',
      canon,
      items: v.map((x) =>
        compactAndAnnotate(x, canon + '/' + ARRAY_SEG, report),
      ),
    };
  }

  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Rule 1: `{ $values: [...] }` alone — the parent becomes an array. The
  // parent's canon stays put; the array items' canons include `/$values/[]`
  // so they still line up with `schema.index`.
  if (
    keys.length === 1 &&
    keys[0] === '$values' &&
    Array.isArray(obj.$values)
  ) {
    report.collapsedValues++;
    return {
      kind: 'arr',
      canon,
      items: (obj.$values as unknown[]).map((x) =>
        compactAndAnnotate(x, canon + '/$values/' + ARRAY_SEG, report),
      ),
    };
  }

  // Rule 2: `{ $type, $value }` with a primitive `$value` collapses to the
  // primitive. Only when both keys are present and there's nothing else — a
  // sibling would mean the wrapper is carrying real content.
  if (
    keys.length === 2 &&
    keys.includes('$type') &&
    keys.includes('$value')
  ) {
    const v2 = obj.$value;
    if (v2 === null || typeof v2 !== 'object') {
      report.collapsedTypeWrappers++;
      return { kind: 'val', canon, value: v2 as Primitive };
    }
  }

  // Rule 3: strip framework meta-key leaves from mixed objects. Only leaves
  // — a nested `$type` object is real structure and stays.
  const entries: Array<{ key: string; node: CNode }> = [];
  for (const k of keys) {
    const child = obj[k];
    const isLeaf = child === null || typeof child !== 'object';
    if (META_KEYS.has(k) && keys.length > 1 && isLeaf) {
      report.strippedMetaLeaves++;
      continue;
    }
    entries.push({
      key: k,
      node: compactAndAnnotate(child, canon + '/' + k, report),
    });
  }
  return { kind: 'obj', canon, entries };
}

/* ------------------------ Duplicate detection --------------------------- */

interface Occurrence {
  node: CNode;
  canon: string;
  pretty: string;
}

function detectDuplicates(
  root: CNode,
  opts: Required<SampleYamlOptions>,
  report: CompactionReport,
): Map<CNode, string> {
  const groups = new Map<string, Occurrence[]>();
  gather(root, '', groups);

  const worth = [...groups.entries()]
    .filter(([, occs]) => occs.length >= opts.duplicateMinCount)
    .filter(
      ([, occs]) => leafCount(occs[0].node) >= opts.duplicateLeafThreshold,
    )
    // Biggest duplicates get the earliest anchor numbers.
    .sort((a, b) => leafCount(b[1][0].node) - leafCount(a[1][0].node));

  const anchors = new Map<CNode, string>();
  worth.forEach(([hash, occs], i) => {
    const name = 'd' + (i + 1);
    for (const o of occs) anchors.set(o.node, name);
    const group: DuplicateGroup = {
      anchor: name,
      hash,
      count: occs.length,
      leafCount: leafCount(occs[0].node),
      preview: preview(occs[0].node),
      canons: occs.map((o) => o.canon),
      keyPaths: occs.map((o) => o.pretty),
    };
    report.duplicates.push(group);
  });
  return anchors;
}

function gather(
  n: CNode,
  parentPretty: string,
  groups: Map<string, Occurrence[]>,
): void {
  if (n.kind === 'obj') {
    for (const e of n.entries) {
      const kidPretty = parentPretty
        ? parentPretty + '.' + e.key
        : e.key;
      gather(e.node, kidPretty, groups);
    }
  } else if (n.kind === 'arr') {
    for (const item of n.items) {
      gather(item, parentPretty + '[]', groups);
    }
  }

  if (n.kind === 'val') return;
  const bodyCount = n.kind === 'obj' ? n.entries.length : n.items.length;
  if (bodyCount === 0) return;

  const h = hashNode(n);
  const occ: Occurrence = { node: n, canon: n.canon, pretty: parentPretty };
  const bucket = groups.get(h);
  if (bucket) bucket.push(occ);
  else groups.set(h, [occ]);
}

/**
 * Stable stringification of a subtree. Arrays keep their positional order
 * (semantically `[a, b]` != `[b, a]`); object keys sort so two objects with
 * the same fields in different declaration order still alias.
 */
function hashNode(n: CNode): string {
  return JSON.stringify(normalise(n));
}

function normalise(n: CNode): unknown {
  if (n.kind === 'val') return ['v', sampleKey(n.value)];
  if (n.kind === 'arr') return ['a', n.items.map(normalise)];
  const kids = [...n.entries]
    .map((e) => [e.key, normalise(e.node)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return ['o', kids];
}

/**
 * Include both value and type in the hash so `"1"` and `1` don't collide,
 * and give `null` its own stable key so absent-vs-null-vs-empty-string stay
 * distinguishable.
 */
function sampleKey(v: Primitive | null): unknown {
  if (v === null) return ['null'];
  return [typeof v, v];
}

function leafCount(n: CNode): number {
  if (n.kind === 'val') return 1;
  if (n.kind === 'arr') return n.items.reduce((s, x) => s + leafCount(x), 0);
  return n.entries.reduce((s, e) => s + leafCount(e.node), 0);
}

function preview(n: CNode): string {
  if (n.kind === 'val') return String(n.value);
  if (n.kind === 'arr') {
    const first = n.items[0];
    if (!first) return '[]';
    if (first.kind === 'val') return '[' + String(first.value) + ', …]';
    return '[…]';
  }
  const first = n.entries[0];
  if (!first) return '{}';
  if (first.node.kind === 'val') return first.key + ': ' + first.node.value;
  return first.key + ': …';
}

/* ----------------------------- Emit ------------------------------------- */

function emitRoot(
  root: CNode,
  selected: ReadonlySet<string>,
  anchors: Map<CNode, string>,
  seen: Set<string>,
  out: YamlLine[],
): void {
  if (root.kind === 'val') {
    out.push({
      text: formatScalar(root.value),
      canon: root.canon,
      depth: 0,
      selected: selected.has(root.canon),
    });
    return;
  }
  if (root.kind === 'arr') {
    if (!root.items.length) {
      out.push(emptyLine(root.canon, '[]'));
      return;
    }
    for (const item of root.items) {
      emitSeqItem(item, 0, selected, anchors, seen, out);
    }
    return;
  }
  if (!root.entries.length) {
    out.push(emptyLine(root.canon));
    return;
  }
  for (const e of root.entries) {
    emitMember(e.key, e.node, 0, selected, anchors, seen, out);
  }
}

function emitMember(
  key: string,
  n: CNode,
  depth: number,
  selected: ReadonlySet<string>,
  anchors: Map<CNode, string>,
  seen: Set<string>,
  out: YamlLine[],
): void {
  const pad = '  '.repeat(depth);
  const k = formatKey(key);
  const sel = selected.has(n.canon);

  const anchor = anchors.get(n);
  if (anchor && seen.has(anchor)) {
    out.push({
      text: pad + k + ': *' + anchor,
      canon: n.canon,
      depth,
      selected: sel,
      aliasOf: anchor,
    });
    return;
  }
  if (anchor) seen.add(anchor);
  const anchorMark = anchor ? ' &' + anchor : '';
  const anchorProp = anchor ? { anchor } : {};

  if (n.kind === 'val') {
    out.push({
      text: pad + k + ': ' + formatScalar(n.value),
      canon: n.canon,
      depth,
      selected: sel,
    });
    return;
  }
  if (n.kind === 'arr') {
    if (!n.items.length) {
      out.push({
        text: pad + k + ':' + anchorMark + ' []',
        canon: n.canon,
        depth,
        selected: sel,
        ...anchorProp,
      });
      return;
    }
    out.push({
      text: pad + k + ':' + anchorMark,
      canon: n.canon,
      depth,
      selected: sel,
      ...anchorProp,
    });
    for (const item of n.items) {
      emitSeqItem(item, depth + 1, selected, anchors, seen, out);
    }
    return;
  }
  if (!n.entries.length) {
    out.push({
      text: pad + k + ':' + anchorMark + ' {}',
      canon: n.canon,
      depth,
      selected: sel,
      ...anchorProp,
    });
    return;
  }
  out.push({
    text: pad + k + ':' + anchorMark,
    canon: n.canon,
    depth,
    selected: sel,
    ...anchorProp,
  });
  for (const e of n.entries) {
    emitMember(e.key, e.node, depth + 1, selected, anchors, seen, out);
  }
}

function emitSeqItem(
  el: CNode,
  depth: number,
  selected: ReadonlySet<string>,
  anchors: Map<CNode, string>,
  seen: Set<string>,
  out: YamlLine[],
): void {
  const pad = '  '.repeat(depth);
  const sel = selected.has(el.canon);

  const anchor = anchors.get(el);
  if (anchor && seen.has(anchor)) {
    out.push({
      text: pad + '- *' + anchor,
      canon: el.canon,
      depth,
      selected: sel,
      aliasOf: anchor,
    });
    return;
  }
  if (anchor) seen.add(anchor);
  const anchorMark = anchor ? ' &' + anchor : '';
  const anchorProp = anchor ? { anchor } : {};

  if (el.kind === 'val') {
    out.push({
      text: pad + '- ' + formatScalar(el.value),
      canon: el.canon,
      depth,
      selected: sel,
    });
    return;
  }
  if (el.kind === 'arr') {
    if (!el.items.length) {
      out.push({
        text: pad + '-' + anchorMark + ' []',
        canon: el.canon,
        depth,
        selected: sel,
        ...anchorProp,
      });
      return;
    }
    out.push({
      text: pad + '-' + anchorMark,
      canon: el.canon,
      depth,
      selected: sel,
      ...anchorProp,
    });
    for (const item of el.items) {
      emitSeqItem(item, depth + 1, selected, anchors, seen, out);
    }
    return;
  }
  if (!el.entries.length) {
    out.push({
      text: pad + '-' + anchorMark + ' {}',
      canon: el.canon,
      depth,
      selected: sel,
      ...anchorProp,
    });
    return;
  }
  // YAML puts the dash on the same line as the element's first key. Rewriting
  // the first line afterwards keeps that quirk out of `emitMember`.
  const start = out.length;
  for (const e of el.entries) {
    emitMember(e.key, e.node, depth + 1, selected, anchors, seen, out);
  }
  const first = out[start];
  const head =
    pad +
    '- ' +
    (anchor ? '&' + anchor + ' ' : '') +
    first.text.slice((depth + 1) * 2);
  out[start] = { ...first, text: head, ...anchorProp };
}

function emptyLine(canon: string, text = '{}'): YamlLine {
  return { text, canon, depth: 0, selected: false };
}

/* ------------------------ Scalar formatting ----------------------------- */

const RESERVED_RE = /^(y|n|yes|no|true|false|on|off|null|~)$/i;
const NUMBERISH_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const NEEDS_QUOTE_RE = /[:#\n\r\t"'\\{}[\],&*!|>%@`]|^[-?]|^\s|\s$/;

export function formatScalar(v: Primitive | null | undefined): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  }
  return quote(v);
}

function formatKey(k: string): string {
  return quote(k);
}

function quote(s: string): string {
  if (s === '') return '""';
  if (RESERVED_RE.test(s) || NUMBERISH_RE.test(s) || NEEDS_QUOTE_RE.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}
