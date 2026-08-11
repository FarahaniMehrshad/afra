import { useCallback, useEffect, useState } from 'react';
import {
  forgetRecent,
  listRecents,
  RecentFolder,
} from '@/services/recents.service';
import {
  deleteJourney,
  JourneySummary,
  listJourneys,
} from '@/services/store.service';
import type { DirHandle } from '@/services/fs.service';

/**
 * Unified "previously ingested" list combining two sources:
 *
 * - `db`   — Postgres-backed. Survives browser changes / other machines. The
 *            stored bundle can be rehydrated without touching disk.
 * - `idb`  — Browser-local IndexedDB. Holds the FileSystem handle so opening
 *            it goes back to the actual folder and picks up any new files.
 *
 * When a name exists in both, DB wins in the display (its timestamp is the
 * `updated_at` of the journey row). We keep both source entries reachable so
 * `forget` can remove from the right store without wiping the other.
 */

export type RecentSource = 'db' | 'idb';

export interface UnifiedRecent {
  /** Stable key for React lists — includes source so both variants coexist. */
  key: string;
  name: string;
  source: RecentSource;
  /** ms-since-epoch. Sort field. */
  ts: number;
  /** Populated for `db` entries. */
  stepCount?: number;
  /** Populated for `idb` entries. */
  handle?: DirHandle;
}

const MAX_SHOWN = 12;

export function useRecents() {
  const [recents, setRecents] = useState<UnifiedRecent[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch both in parallel; a broken source degrades to `[]` without
      // knocking the other one out of the list.
      const [idbRes, dbRes] = await Promise.all([
        listRecents().catch(() => [] as RecentFolder[]),
        listJourneys().catch(() => [] as JourneySummary[]),
      ]);

      const merged = new Map<string, UnifiedRecent>();

      // Seed with local IDB entries first…
      for (const r of idbRes) {
        merged.set(r.name, {
          key: 'idb:' + r.name,
          name: r.name,
          source: 'idb',
          ts: r.ts,
          handle: r.handle,
        });
      }
      // …then let DB entries win. The DB is the source of truth once it
      // knows about a name; the FileSystem handle is only useful when the
      // journey is *not* already committed.
      for (const s of dbRes) {
        merged.set(s.name, {
          key: 'db:' + s.name,
          name: s.name,
          source: 'db',
          ts: new Date(s.updatedAt).getTime(),
          stepCount: s.stepCount,
        });
      }

      setRecents(
        Array.from(merged.values())
          .sort((a, b) => b.ts - a.ts)
          .slice(0, MAX_SHOWN),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Remove the entry from *its own* source. Deleting from DB cascades every
   * artefact belonging to that journey; deleting from IDB only forgets the
   * FileSystem handle. If a name lived in both stores, this leaves the other
   * behind — call twice with each source to fully clear it.
   */
  const forget = useCallback(
    async (name: string, source: RecentSource) => {
      try {
        if (source === 'db') await deleteJourney(name);
        else await forgetRecent(name);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  return { recents, loading, refresh, forget };
}
