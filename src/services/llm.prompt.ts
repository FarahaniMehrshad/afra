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
    'a value the operator TYPED IN or PICKED FROM a UI control in this step. The value is content the operator is aware of and, if asked, could recite: a title they typed, a number they entered, an item they chose from a dropdown, a checkbox they toggled. The user encountered this specific value in the UI.',
  derived:
    'a value the framework/serialiser/exporter emitted as a side effect of the operator\'s action, NOT a value the operator typed or picked. This is the largest bucket. Includes: (a) .NET type discriminators — $type, $id, $ref, $values; (b) capability flags whose value is determined by the picked type — HasLength, HasScale, HasFormat, HasGroup, HasTrim, and other Has* siblings; (c) framework state flags — IsSelected, IsExpanded, IsBidirectional, IsFade, IsLocked, IsInsert and other Is* bookkeeping; (d) auto-assigned internal identifiers separate from the user-visible name — ColumnName next to Title, OwnerID, back-reference ids; (e) default sub-structures that materialise the moment an object of some type is instantiated — DefaultType, ErrorHandling, FieldType/Format, FieldType/Group, FieldType/Trim substructures that appear with all their own defaults just because the user picked a column type; (f) counts, indices, ordering, cached totals, back-references.',
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
  'How to judge — READ THIS CAREFULLY:',
  '',
  '- The distinction between "step-operation" and "derived" is the whole point of',
  '  this task. The lifecycle test alone is NOT enough. "This path was added in',
  '  the step where the user added a column" does NOT make it step-operation. When',
  '  a user creates one column of type Float, dozens of paths appear together in',
  '  that same step: the Title they typed, the Length they entered, and ALSO the',
  '  $type discriminator, every Has* flag, an auto-assigned ColumnName, and every',
  '  default sub-structure that the framework materialises for a Float column',
  '  (DefaultType, ErrorHandling, FieldType/Format, FieldType/Group, etc.). Only',
  '  Title and Length are "step-operation"; everything else is "derived", even',
  '  though every one of them appeared in the same step.',
  '',
  '- The one-question test for "step-operation": if you asked the operator, right',
  '  after the step, "what did you set this field to?", could they answer with',
  '  this exact value? If yes → step-operation. If they would say "I don\'t know',
  '  what that is" or "the app filled that in" → derived.',
  '',
  '- Specific patterns that are ALWAYS "derived", never "step-operation":',
  '     * A path ending in $type, $id, $ref, or $values.',
  '     * A path ending in Has<Something> that mirrors a capability of the picked',
  '       type (HasLength, HasScale, HasFormat, HasGroup, HasTrim, ...).',
  '     * A path ending in Is<Something> that reflects framework bookkeeping',
  '       (IsSelected, IsExpanded, IsBidirectional, IsFade, IsInsert, ...).',
  '     * ColumnName when a sibling Title also exists — Title is what the user',
  '       typed, ColumnName is the auto-generated internal identifier.',
  '     * A subtree that appears wholesale with all its own default values',
  '       because the user chose an enclosing type (e.g. every child of a newly',
  '       created FieldType/Format when the user just picked "Float").',
  '',
  '- Only mark a leaf as "step-operation" when the value on that leaf is content',
  '  the operator produced through the UI — a title they typed, a number they',
  '  entered, an item they selected. A wrapper primitive $value inside a $type',
  '  envelope IS step-operation when it carries the picked enum value; the sibling',
  '  $type on the same wrapper is still derived.',
  '',
  '- A value that changes at every single step, to an unrelated value each time,',
  '  and whose key or value looks like an id, is "random-id" even if the key is',
  '  not literally named Id.',
  '- Values that only ever move forward, or that look like dates or counters, are',
  '  "timestamp".',
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
