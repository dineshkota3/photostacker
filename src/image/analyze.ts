/**
 * One-stop per-photo analysis: pixel hash, CLIP embedding, person count.
 * Each stage is guarded — a failure degrades gracefully instead of killing
 * the scan (pHash-only fallback if CLIP fails, CLIP-only if hashing fails).
 */
import { computeFeatures, ImageFeatures } from "./phash";
import { detectPersons } from "./detect";
import { computeClipFeatures } from "./clip";

export interface PhotoAnalysis {
  features?: ImageFeatures;
  clip?: Float32Array;
  persons?: number;
}

export async function analyzePhoto(bitmap: ImageBitmap): Promise<PhotoAnalysis> {
  const out: PhotoAnalysis = {};

  try {
    out.features = await computeFeatures(bitmap);
  } catch {
    /* hashing failed */
  }

  try {
    out.clip = (await computeClipFeatures(bitmap)).embedding;
  } catch (e) {
    console.warn("[clip] embedding failed:", e);
  }

  try {
    out.persons = (await detectPersons(bitmap)).count;
  } catch (e) {
    console.warn("[detect] person detection failed:", e);
  }

  return out;
}
