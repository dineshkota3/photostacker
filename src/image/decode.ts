/**
 * HEIC/HEIF support. Chrome doesn't decode HEIC natively (Safari does), so
 * for HEIC files we convert to JPEG in-browser via libheif (WASM) before
 * display/hashing. Everything stays local — nothing is uploaded.
 */
import { loadImage as loadBitmap } from "./phash";

export function isHeic(file: File): boolean {
  return (
    /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

/** Convert an HEIC file to a JPEG blob (best-effort; returns input on failure). */
export async function heicToJpeg(file: File): Promise<Blob> {
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    return Array.isArray(out) ? out[0] : out;
  } catch {
    return file; // undecodable — image will end up a singleton
  }
}

/**
 * Load any image file to an ImageBitmap, converting HEIC first if needed.
 * Returns the (possibly converted) blob for object-URL display too.
 */
export async function prepareImageFile(
  file: File
): Promise<{ blob: Blob; bitmap: ImageBitmap }> {
  const blob = isHeic(file) ? await heicToJpeg(file) : file;
  const bitmap = await loadBitmap(URL.createObjectURL(blob));
  return { blob, bitmap };
}
