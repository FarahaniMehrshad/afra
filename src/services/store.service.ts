import type { JourneyBundle, JourneyStep } from '@/types/journey';

/**
 * Transport for the persistence layer. Speaks only to `/api/store` on the
 * same origin, so the database URL never reaches the browser.
 *
 * Every call is best-effort: callers use `saveArtifactSafe` which swallows
 * errors so a database outage never breaks the UI. Reads use the strict
 * variant so callers can distinguish "not saved" from "network broken".
 */

const API = '/api/store';

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export interface StoreHealth {
  configured: boolean;
  reachable: boolean;
  error: string | null;
}

export interface JourneySummary {
  name: string;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredJourney {
  id: string;
  name: string;
  journeyMd: string;
  steps: JourneyStep[];
  files: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredArtifactMeta {
  kind: string;
  key: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredArtifact<T = unknown> {
  kind: string;
  key: string;
  payload: T;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Kinds of artefact the app currently produces. Free-form on the server. */
export type ArtifactKind =
  | 'build'
  | 'step-diff'
  | 'total-diff'
  | 'analysis'
  | 'schema'
  | 'converter'
  | 'yaml';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    const err = (body as { error?: string } | null)?.error;
    throw new StoreError(err ?? 'Request failed (' + res.status + ')');
  }
  return body as T;
}

export async function fetchStoreHealth(): Promise<StoreHealth> {
  return jsonFetch<StoreHealth>(API + '/health');
}

/* ------------------------- Journeys -------------------------------------- */

export async function listJourneys(): Promise<JourneySummary[]> {
  const res = await jsonFetch<{ journeys: JourneySummary[] }>(API + '/journeys');
  return res.journeys;
}

export async function fetchJourney(name: string): Promise<StoredJourney | null> {
  const res = await fetch(API + '/journeys/' + encodeURIComponent(name));
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new StoreError(body?.error ?? 'fetchJourney failed (' + res.status + ')');
  }
  return (await res.json()) as StoredJourney;
}

/**
 * Upsert a journey. The journey `name` is the identity — re-ingesting a
 * folder with the same name overwrites its stored contents and cascades
 * updated_at forward.
 */
export async function saveJourney(bundle: JourneyBundle): Promise<void> {
  await jsonFetch(API + '/journeys/' + encodeURIComponent(bundle.name), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      journeyMd: bundle.journeyMd,
      steps: bundle.steps,
      files: bundle.files,
    }),
  });
}

export async function deleteJourney(name: string): Promise<void> {
  await jsonFetch(API + '/journeys/' + encodeURIComponent(name), {
    method: 'DELETE',
  });
}

/* ------------------------- Artifacts ------------------------------------- */

export async function listArtifacts(name: string): Promise<StoredArtifactMeta[]> {
  const res = await jsonFetch<{ artifacts: StoredArtifactMeta[] }>(
    API + '/journeys/' + encodeURIComponent(name) + '/artifacts',
  );
  return res.artifacts;
}

export async function fetchArtifact<T = unknown>(
  name: string,
  kind: ArtifactKind,
  key: string,
): Promise<StoredArtifact<T> | null> {
  const res = await fetch(artifactUrl(name, kind, key));
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new StoreError(body?.error ?? 'fetchArtifact failed (' + res.status + ')');
  }
  return (await res.json()) as StoredArtifact<T>;
}

export async function saveArtifact(
  name: string,
  kind: ArtifactKind,
  key: string,
  payload: unknown,
  meta?: Record<string, unknown>,
): Promise<void> {
  await jsonFetch(artifactUrl(name, kind, key), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, meta: meta ?? {} }),
  });
}

/**
 * Fire-and-forget variant used by the persist hooks. Errors are swallowed
 * — persistence is a nice-to-have, not a critical path. A warn goes to the
 * console so failures are still discoverable during development.
 */
export function saveArtifactSafe(
  name: string,
  kind: ArtifactKind,
  key: string,
  payload: unknown,
  meta?: Record<string, unknown>,
): Promise<void> {
  return saveArtifact(name, kind, key, payload, meta).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[afra.store]', kind, key, 'save failed:', e);
  });
}

export function saveJourneySafe(bundle: JourneyBundle): Promise<void> {
  return saveJourney(bundle).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[afra.store] journey save failed:', e);
  });
}

function artifactUrl(name: string, kind: ArtifactKind, key: string): string {
  return (
    API +
    '/journeys/' +
    encodeURIComponent(name) +
    '/artifacts/' +
    encodeURIComponent(kind) +
    '/' +
    encodeURIComponent(key)
  );
}
