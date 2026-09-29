/**
 * Drag & drop folder support. Dropping a folder anywhere on the page scans
 * it — no picker needed. Works in the browser and the desktop app.
 */

const IMAGE_TYPE = /^image\//;
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i;

function isImageFile(f: File): boolean {
  return IMAGE_TYPE.test(f.type) || IMAGE_NAME.test(f.name);
}

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: () => Promise<File>;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
  fullPath: string;
}

interface DirReader {
  readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
}

async function readAllEntries(reader: DirReader): Promise<FsEntry[]> {
  const all: FsEntry[] = [];
  // readEntries returns at most 100 entries per call — keep going until empty
  while (true) {
    const batch = await new Promise<FsEntry[]>((res, rej) =>
      reader.readEntries(res, rej)
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function collectFiles(entry: FsEntry, out: { files: File[]; total: number }): Promise<void> {
  if (entry.isFile) {
    const file = await entry.file!();
    out.total++;
    if (isImageFile(file)) out.files.push(file);
    return;
  }
  if (entry.isDirectory) {
    const entries = await readAllEntries(entry.createReader!());
    for (const e of entries) await collectFiles(e, out);
  }
}

export interface DropResult {
  files: File[];
  /** Every file seen, including skipped non-photos. */
  total: number;
  folderName: string;
}

/** Extract all image files from a drop event (files and/or folders). */
export async function filesFromDrop(e: DragEvent): Promise<DropResult | null> {
  const items = Array.from(e.dataTransfer?.items || []);
  const entries: FsEntry[] = items
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean) as FsEntry[];
  if (entries.length === 0) return null;

  const out = { files: [] as File[], total: 0 };
  for (const entry of entries) await collectFiles(entry, out);
  if (out.files.length === 0) return null;

  const folderName =
    entries[0]?.isDirectory ? entries[0].name : "(dropped files)";
  return { files: out.files, total: out.total, folderName };
}
