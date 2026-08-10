import type { Primitive } from '@/types/ir';
import type { SchemaNode, YamlLine, YamlMode } from '@/types/schema';

/**
 * Emits the UI-field schema as YAML, one `YamlLine` at a time so every line
 * remembers the canonical path it came from — that link is what lets the
 * mapping panel answer "which wpf/exe field is this?".
 *
 * Hand-rolled rather than delegating to a serialiser precisely because a
 * serialiser would throw that per-line provenance away.
 */

export function emitYaml(root: SchemaNode, mode: YamlMode): YamlLine[] {
  const out: YamlLine[] = [];

  if (!root.children.length) {
    out.push(line('{}', root, 0));
    return out;
  }

  if (root.kind === 'arr') {
    if (collapses(root, mode)) out.push(line('[]', root, 0));
    else emitSeqItem(root.children[0], 0, mode, out);
    return out;
  }

  for (const child of root.children) emitMember(child, 0, mode, out);
  return out;
}

export function toYamlText(lines: YamlLine[]): string {
  return lines.map((l) => l.text).join('\n') + '\n';
}

/** One `key: …` entry of an enclosing mapping. */
function emitMember(n: SchemaNode, depth: number, mode: YamlMode, out: YamlLine[]): void {
  const pad = '  '.repeat(depth);
  const key = formatKey(n.key);

  if (n.kind === 'val') {
    out.push(line(pad + key + ': ' + formatScalar(n.sample), n, depth));
    return;
  }

  if (n.kind === 'arr') {
    if (collapses(n, mode)) {
      out.push(line(pad + key + ': []', n, depth));
      return;
    }
    out.push(line(pad + key + ':', n, depth));
    emitSeqItem(n.children[0], depth + 1, mode, out);
    return;
  }

  if (!n.children.length) {
    out.push(line(pad + key + ': {}', n, depth));
    return;
  }
  out.push(line(pad + key + ':', n, depth));
  for (const child of n.children) emitMember(child, depth + 1, mode, out);
}

/** The single representative element of an array. */
function emitSeqItem(el: SchemaNode, depth: number, mode: YamlMode, out: YamlLine[]): void {
  const pad = '  '.repeat(depth);

  if (el.kind === 'val') {
    out.push(line(pad + '- ' + formatScalar(el.sample), el, depth));
    return;
  }

  if (el.kind === 'arr') {
    if (collapses(el, mode)) {
      out.push(line(pad + '- []', el, depth));
      return;
    }
    out.push(line(pad + '-', el, depth));
    emitSeqItem(el.children[0], depth + 1, mode, out);
    return;
  }

  if (!el.children.length) {
    out.push(line(pad + '- {}', el, depth));
    return;
  }

  const start = out.length;
  for (const child of el.children) emitMember(child, depth + 1, mode, out);
  // YAML puts the dash on the same line as the element's first key. Rewriting
  // the line afterwards keeps that formatting quirk out of emitMember.
  const first = out[start];
  out[start] = { ...first, text: pad + '- ' + first.text.slice((depth + 1) * 2) };
}

/**
 * Whether an array is written as `[]` rather than showing its element.
 *
 * Only arrays that *directly hold values* empty out, because those elements
 * are sample data and nothing else. An array of objects is structure: the UI
 * fields live inside its element, so emptying it would delete them from the
 * document — which is the one thing the empty file must not do.
 */
function collapses(n: SchemaNode, mode: YamlMode): boolean {
  if (!n.children.length) return true;
  return mode === 'empty' && n.children[0].kind === 'val';
}

function line(text: string, n: SchemaNode, depth: number): YamlLine {
  return {
    text,
    canon: n.canon,
    depth,
    selected: n.selected,
    variants: n.variants,
  };
}

/** YAML plain scalars are ambiguous in enough cases to be worth checking. */
const RESERVED_RE = /^(y|n|yes|no|true|false|on|off|null|~)$/i;
const NUMBERISH_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const NEEDS_QUOTE_RE = /[:#\n\r\t"'\\{}[\],&*!|>%@`]|^[-?]|^\s|\s$/;

export function formatScalar(v: Primitive | null): string {
  if (v === null) return 'null';
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
    // JSON string escaping is valid YAML double-quoted style.
    return JSON.stringify(s);
  }
  return s;
}
