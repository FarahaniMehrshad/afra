import { useCallback, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { buildBundle } from '@/services/journey.service';
import {
  DirHandle,
  FolderPermissionError,
  NotADirectoryError,
  readDirEntry,
  readDirHandle,
  readInputList,
} from '@/services/fs.service';
import { saveRecent } from '@/services/recents.service';
import {
  fetchArtifact,
  fetchJourney,
  saveJourneySafe,
} from '@/services/store.service';
import { useLlmStore } from '@/store/llmStore';
import type { LlmVerdict } from '@/types/llm';

/**
 * Wires the three folder-picking modes (native, drag-drop, upload input)
 * into the store. Errors surface via `useAppStore.fail` so the UI just
 * renders the current error string.
 */
export function useIngest() {
  const loadBundle = useAppStore((s) => s.loadBundle);
  const fail = useAppStore((s) => s.fail);
  const setDragOver = useAppStore((s) => s.setDragOver);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingest = useCallback(
    (name: string, files: Record<string, string>) => {
      try {
        const bundle = buildBundle(name, files);
        loadBundle(bundle);
        // Persist the raw journey immediately so the derived-artifact saves
        // that follow have a parent row to hang off. Fire-and-forget.
        void saveJourneySafe(bundle);
        return true;
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [loadBundle, fail],
  );

  const pickFolder = useCallback(async () => {
    const w = window as Window & {
      showDirectoryPicker?: (o: { id?: string; mode?: string }) => Promise<DirHandle>;
    };
    if (!w.showDirectoryPicker) {
      fail(
        'This browser has no folder picker. Use “Upload folder contents” instead (Chrome or Edge give the full experience).',
      );
      return;
    }
    try {
      const handle = await w.showDirectoryPicker({ id: 'afra', mode: 'read' });
      const bag = await readDirHandle(handle);
      if (ingest(bag.name, bag.files)) {
        await saveRecent(handle.name, handle);
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [ingest, fail]);

  const openRecent = useCallback(
    async (handle: DirHandle) => {
      try {
        const bag = await readDirHandle(handle);
        ingest(bag.name, bag.files);
      } catch (e) {
        if (e instanceof FolderPermissionError) fail(e.message);
        else fail(e instanceof Error ? e.message : String(e));
      }
    },
    [ingest, fail],
  );

  /**
   * Rehydrate a journey directly from Postgres. No disk access — the files
   * bag stored with the journey is enough to replay the entire pipeline in
   * the browser. Any previously-saved LLM verdicts are also pulled and
   * pushed into `llmStore` so the schema page renders immediately without
   * a second LLM run.
   */
  const openStoredJourney = useCallback(
    async (name: string) => {
      try {
        const stored = await fetchJourney(name);
        if (!stored) {
          fail('Journey is no longer in the database: ' + name);
          return;
        }
        if (!ingest(stored.name, stored.files)) return;

        // Warm-start the LLM pass from saved verdicts. `useVerdictInvalidation`
        // runs on the next commit and calls reset(bundle); because we call
        // reset ourselves here first, that effect sees `forBundle === bundle`
        // and leaves our verdicts alone.
        try {
          const [wpf, exe] = await Promise.all([
            fetchArtifact<LlmVerdict[]>(name, 'analysis', 'wpf'),
            fetchArtifact<LlmVerdict[]>(name, 'analysis', 'exe'),
          ]);
          const rows: LlmVerdict[] = [
            ...(Array.isArray(wpf?.payload) ? wpf.payload : []),
            ...(Array.isArray(exe?.payload) ? exe.payload : []),
          ];
          if (rows.length) {
            // Mark the bundle as "already reset" so the invalidation effect
            // doesn't wipe our restored verdicts on the next render tick.
            const bundle = useAppStore.getState().bundle;
            const llm = useLlmStore.getState();
            llm.reset(bundle);
            llm.addVerdicts(rows);
          }
        } catch {
          // Verdicts are a nice-to-have on reopen; missing or malformed rows
          // shouldn't spoil the ingest itself.
        }
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    },
    [ingest, fail],
  );

  const pickUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFolderInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(e.target.files ?? []);
      if (!list.length) return;
      try {
        const bag = await readInputList(list);
        ingest(bag.name, bag.files);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      } finally {
        // Reset so re-picking the same folder still fires onChange.
        e.target.value = '';
      }
    },
    [ingest, fail],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    [setDragOver],
  );

  const onDragLeave = useCallback(() => setDragOver(false), [setDragOver]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const item = e.dataTransfer.items?.[0];
      if (!item) return;
      try {
        const asHandle = (
          item as DataTransferItem & {
            getAsFileSystemHandle?: () => Promise<DirHandle | null>;
          }
        ).getAsFileSystemHandle;
        if (asHandle) {
          const h = await asHandle.call(item);
          if (h && (h as unknown as { kind?: string }).kind === 'directory') {
            const bag = await readDirHandle(h);
            if (ingest(bag.name, bag.files)) await saveRecent(h.name, h);
            return;
          }
          fail(new NotADirectoryError().message);
          return;
        }
        const entry = item.webkitGetAsEntry?.();
        if (entry && entry.isDirectory) {
          const bag = await readDirEntry(entry as FileSystemDirectoryEntry);
          ingest(bag.name, bag.files);
          return;
        }
        fail(new NotADirectoryError().message);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    },
    [ingest, fail, setDragOver],
  );

  return {
    fileInputRef,
    pickFolder,
    pickUpload,
    openRecent,
    openStoredJourney,
    onFolderInput,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
