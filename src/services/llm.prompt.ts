import type { LlmChunk } from '@/types/llm';
import { LLM_CATEGORIES } from '@/types/llm';

/**
 * Prompt construction, kept separate from transport so the debug panel can
 * render the byte-exact messages without touching the network.
 */

export interface RenderedPrompt {
  system: string;
  user: string;
}

const CATEGORY_DOC: Record<(typeof LLM_CATEGORIES)[number], string> = {
  'random-id':
    'a GUID, handle or opaque identifier that the exporter regenerates on its own — the value carries no meaning and the change is not something the operator did',
  timestamp:
    'a clock, date, duration, revision counter or sequence number that advances by itself',
  'step-operation':
    'a direct, intended result of the UI operation performed in the step that changed it — the operator did this on purpose',
  derived:
    'a side effect recomputed from some other change: element counts, indices, ordering, cached totals, back-references',
  environment:
    'machine-, user- or install-specific: file paths, hostnames, screen geometry, locale, hardware ids',
  unknown:
    'the evidence does not support any of the above with reasonable confidence',
};

const SYSTEM = [
  'You analyse configuration diffs from RAS, a legacy Windows desktop application.',
  '',
  'A "journey" is one recorded run: at every step an operator performs a single UI',
  'operation and the whole configuration is exported to JSON. Two variants are',
  'exported side by side, "wpf" (the designer) and "exe" (the built runtime).',
  'Merging every step gives one union document; each JSON path in it carries the',
  'history of how it changed from step to step.',
  '',
  'You are given the changed paths of one variant. For each path, decide what kind',
  'of change it is. Categories:',
  '',
  ...LLM_CATEGORIES.map((c) => '- "' + c + '": ' + CATEGORY_DOC[c]),
  '',
  'How to judge:',
  '- Read the step operation text. If the change plainly implements what the',
  '  operation describes, it is "step-operation".',
  '- A value that changes at every single step, to an unrelated value each time,',
  '  and whose key or value looks like an id, is "random-id" even if the key is',
  '  not literally named Id.',
  '- Values that only ever move forward, or that look like dates or counters, are',
  '  "timestamp".',
  '- Use the neighbouring paths in the batch as context: if one path is the',
  '  obvious cause and another merely follows from it, the follower is "derived".',
  '- Prefer "unknown" with low confidence over guessing.',
  '',
  'Reply with JSON only, no prose and no code fences, in exactly this shape:',
  '{"results":[{"path":"<the path verbatim>","category":"<one of the categories>",',
  '"confidence":<number between 0 and 1>,"reason":"<under 140 characters>"}]}',
  '',
  'Emit exactly one result per path you were given, using the path string',
  'byte-for-byte as it appears in the input.',
].join('\n');

export function renderChunk(chunk: LlmChunk): RenderedPrompt {
  const steps = chunk.steps
    .map(
      (s) =>
        String(s.step).padStart(2, '0') +
        '  ' +
        s.label +
        (s.operation ? ' — ' + s.operation : ''),
    )
    .join('\n');

  const user = [
    'Journey folder: ' + chunk.folder,
    'Variant: ' + chunk.variant,
    'Batch ' + chunk.index + ' of ' + chunk.ofVariant + ' for this variant',
    'Paths in this batch: ' + chunk.entries.length,
    '',
    'Steps of the run:',
    steps,
    '',
    'Changed paths. "noise" is this tool\'s own crude id/timestamp guess — treat it',
    'as a hint you are free to overrule. "value" is the path\'s value in the merged',
    'document. Each event is one step boundary where the path changed.',
    '',
    JSON.stringify(chunk.entries, null, 1),
  ].join('\n');

  return { system: SYSTEM, user };
}

/** Rough size of what would go over the wire, for the debug panel. */
export function promptBytes(p: RenderedPrompt): number {
  return new TextEncoder().encode(p.system + p.user).length;
}
