/** Minimal shape of a Graph driveItem we care about. */
export interface DriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime?: string;
  image?: { width?: number; height?: number };
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  thumbnails?: { large?: { url: string }; medium?: { url: string } }[];
  parentReference?: { driveId?: string };
}

export const IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
];

export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i;

export function isImage(item: DriveItem): boolean {
  if (item.file?.mimeType && IMAGE_MIME.includes(item.file.mimeType))
    return true;
  if (!item.folder && item.name && IMAGE_EXT.test(item.name)) return true;
  return false;
}
