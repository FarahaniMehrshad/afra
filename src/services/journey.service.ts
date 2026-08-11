import { JOURNEY_INDEX, JOURNEY_MARKDOWN, READABLE_EXTS } from '@/constants';
import type { FileBag, JourneyBundle, JourneyStep } from '@/types/journey';
import { normalizePossiblyMojibake } from './text-encoding.service';

/**
 * Ingest utilities — turn a browser-supplied file bag into a validated
 * `JourneyBundle`. All I/O side effects live outside this module.
 */

export class JourneyIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JourneyIngestError';
  }
}

/** Parse the ND-JSON journey index into typed step records. */
export function parseJourneyIndex(text: string): JourneyStep[] {
  const steps: JourneyStep[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s) as Partial<{
        Ordinal: number;
        Label: string;
        Operation: string;
        Files: string[];
        Error: string | null;
      }>;
      const ordinal = typeof o.Ordinal === 'number' ? o.Ordinal : steps.length + 1;
      steps.push({
        ordinal,
        label: o.Label ?? 'step ' + ordinal,
        operation: o.Operation ?? '',
        files: Array.isArray(o.Files) ? o.Files : [],
        error: o.Error ?? null,
      });
    } catch {
      /* Ignore malformed lines rather than fail the whole ingest. */
    }
  }
  return steps;
}

/**
 * Validate a raw file bag and produce a `JourneyBundle`. Throws a
 * `JourneyIngestError` with a human-readable message on failure so callers
 * can pipe the message straight to the UI.
 */
export function buildBundle(name: string, files: FileBag): JourneyBundle {
  // Re-open flows can load previously-saved rows that were ingested with an
  // older decoder. Normalize once so both fresh and persisted journeys render.
  const normalized: FileBag = {};
  for (const [key, value] of Object.entries(files)) {
    normalized[key] = normalizePossiblyMojibake(value);
  }

  const jl = normalized[JOURNEY_INDEX];
  const md = normalized[JOURNEY_MARKDOWN];
  if (!jl || !md) {
    throw new JourneyIngestError(
      '“' +
        name +
        '” is not a journey folder — journey.md and journey.jsonl must both be present. Found ' +
        Object.keys(normalized).length +
        ' readable file(s).',
    );
  }
  const steps = parseJourneyIndex(jl);
  if (!steps.length) {
    throw new JourneyIngestError('journey.jsonl held no readable step records.');
  }
  return { name, files: normalized, steps, journeyMd: md };
}

/** True for the extensions the app actually reads. */
export function isReadable(name: string): boolean {
  return READABLE_EXTS.test(name);
}
