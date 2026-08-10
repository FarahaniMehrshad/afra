import type { DirHandle } from './fs.service';

/**
 * Remembers previously ingested folders in IndexedDB so the user can
 * reopen them with one click. Handles are stored raw — modern browsers
 * serialise them, older ones will simply throw and we swallow it.
 */

const DB_NAME = 'afra-recents';
const STORE = 'folders';

export interface RecentFolder {
  name: string;
  handle: DirHandle;
  ts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE, { keyPath: 'name' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listRecents(): Promise<RecentFolder[]> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .getAll();
      tx.onsuccess = () => {
        const all = (tx.result || []) as RecentFolder[];
        resolve(all.sort((a, b) => b.ts - a.ts).slice(0, 6));
      };
      tx.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveRecent(name: string, handle: DirHandle): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put({ name, handle, ts: Date.now() });
      tx.onsuccess = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* Storage is best-effort; private browsing throws here. */
  }
}

export async function forgetRecent(name: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .delete(name);
      tx.onsuccess = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* Ignore. */
  }
}
