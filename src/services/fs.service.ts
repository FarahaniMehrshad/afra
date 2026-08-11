import type { FileBag } from '@/types/journey';
import { isReadable } from './journey.service';
import { decodeJourneyText } from './text-encoding.service';

/**
 * Adapters for the three browser folder-picking APIs. Each returns
 * `{ name, files }` and swallows individual-file failures rather than
 * aborting the whole ingest.
 *
 * We keep this module thin and free of React so it stays trivially
 * testable in Node with a mocked FileSystemDirectoryHandle.
 */

interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
  getFile(): Promise<File>;
}

async function readJourneyFileText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeJourneyText(bytes);
}

/** Minimal shape of the FileSystemDirectoryHandle we depend on. */
export interface DirHandle {
  name: string;
  entries(): AsyncIterable<[string, DirEntry]>;
  queryPermission?: (o: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState>;
}

export class FolderPermissionError extends Error {
  constructor() {
    super('Read permission was denied for that folder.');
    this.name = 'FolderPermissionError';
  }
}

export class NotADirectoryError extends Error {
  constructor() {
    super('That was a file, not a folder. Drop the folder itself.');
    this.name = 'NotADirectoryError';
  }
}

/**
 * Read a directory that came from `showDirectoryPicker()` (native FS
 * Access API) or from a drag with `getAsFileSystemHandle()`.
 */
export async function readDirHandle(
  handle: DirHandle,
): Promise<{ name: string; files: FileBag }> {
  if (handle.queryPermission) {
    let p = await handle.queryPermission({ mode: 'read' });
    if (p !== 'granted' && handle.requestPermission) {
      p = await handle.requestPermission({ mode: 'read' });
    }
    if (p !== 'granted') throw new FolderPermissionError();
  }
  const files: FileBag = {};
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    if (!isReadable(name)) continue;
    try {
      files[name] = await readJourneyFileText(await entry.getFile());
    } catch {
      /* Skip unreadable files silently. */
    }
  }
  return { name: handle.name, files };
}

/** Read a legacy webkit `FileSystemDirectoryEntry`. */
export async function readDirEntry(
  dirEntry: FileSystemDirectoryEntry,
): Promise<{ name: string; files: FileBag }> {
  const reader = dirEntry.createReader();
  const entries: FileSystemEntry[] = await new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const step = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) resolve(all);
          else {
            all.push(...batch);
            step();
          }
        },
        () => resolve(all),
      );
    };
    step();
  });
  const files: FileBag = {};
  for (const en of entries) {
    if (!en.isFile || !isReadable(en.name)) continue;
    const file: File = await new Promise((resolve, reject) =>
      (en as FileSystemFileEntry).file(resolve, reject),
    );
    files[en.name] = await readJourneyFileText(file);
  }
  return { name: dirEntry.name, files };
}

/**
 * Read the flat list of Files an `<input webkitdirectory>` control gives
 * back. We only take direct children of the picked folder so nested
 * artefacts (screenshots inside sub-folders etc.) don't confuse ingest.
 */
export async function readInputList(
  list: File[],
): Promise<{ name: string; files: FileBag }> {
  const relOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath;
  const first = list[0];
  const root = (relOf(first) ?? '').split('/')[0] || 'folder';
  const files: FileBag = {};
  for (const f of list) {
    const rel = relOf(f) ?? f.name;
    const parts = rel.split('/');
    if (parts.length > 2) continue;
    if (!isReadable(f.name)) continue;
    files[f.name] = await readJourneyFileText(f);
  }
  return { name: root, files };
}
