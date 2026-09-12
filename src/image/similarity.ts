import { ImageFeatures, popcount } from "./phash";
import { cosine } from "./clip";

/** Hamming distance between two 64-bit hashes. */
export function hamming(a: bigint, b: bigint): number {
  return popcount(a ^ b);
}

export interface SimilarityOptions {
  /**
   * Sensitivity level 0..100 (UI slider). Higher = more aggressive stacking.
   * Internally maps to thresholds below.
   */
  level: number;
}

export interface SimilarityResult {
  similar: boolean;
  score: number; // 0..1, higher = more similar
  detail: {
    globalDist: number;
    patchMatchRatio: number; // fraction of patches that closely match
    colorDist: number;
    /** Convenience 0..1 views for display. */
    globalSimilarity: number;
    colorSimilarity: number;
  };
}

/**
 * Two images are considered "stackable" if:
 *  (a) they're near-duplicates by the GLOBAL hash, OR
 *  (b) enough of their local PATCHES match (same person/content visible even
 *      when the pose or framing shifts), AND their overall color/layout is close.
 *
 * This is what keeps "same person, different pose" together while separating
 * "different person, same background" — the latter shares background patches but
 * the person-region patches differ, so patchMatchRatio stays low.
 */
export function compare(
  a: ImageFeatures,
  b: ImageFeatures,
  opts: SimilarityOptions
): SimilarityResult {
  const level = Math.max(0, Math.min(100, opts.level));

  const globalDist = hamming(a.global, b.global);

  // Patch matching: for each patch in a, find min distance to any patch in b
  // (translation tolerance -> handles pose/framing shift). Count matches within
  // a per-patch distance threshold.
  const patchHammingThreshold = 18; // bits (patch hashes are noisy; small shifts flip bits)
  let matched = 0;
  for (const pa of a.patches) {
    let best = 64;
    for (const pb of b.patches) {
      const d = hamming(pa, pb);
      if (d < best) best = d;
    }
    if (best <= patchHammingThreshold) matched++;
  }
  const patchMatchRatio = matched / a.patches.length;

  // Color distance (0-1)
  const [ar, ag, ab] = a.meanColor;
  const [br, bg, bb] = b.meanColor;
  const colorDist =
    Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) /
    (Math.sqrt(3) * 255);

  // Map sensitivity level to thresholds.
  // Higher level => looser thresholds => stack more.
  const globalMax = Math.round(8 + (level / 100) * 22); // 8..30 bits
  const patchMin = 0.75 - (level / 100) * 0.45; // 0.75..0.30
  const colorMax = 0.10 + (level / 100) * 0.25; // 0.10..0.35

  const isNearDup = globalDist <= globalMax;
  // Content match must ALSO stay within a global-hash cap — patch matching
  // alone lets different-but-texturally-similar scenes (stone buildings, sky)
  // chain into one giant stack via transitive union-find.
  const contentGlobalCap = Math.min(30, globalMax + 8);
  const isContentMatch =
    patchMatchRatio >= patchMin &&
    colorDist <= colorMax &&
    globalDist <= contentGlobalCap;

  const similar = isNearDup || isContentMatch;

  // Blended 0..1 score for sorting/display. The global hash is the reliable
  // near-duplicate signal, so it carries the most weight — patch matching is
  // noisy at 8×8px granularity and shouldn't sink visually-identical pairs.
  const globalScore = 1 - globalDist / 64;
  const score = 0.5 * globalScore + 0.35 * patchMatchRatio + 0.15 * (1 - colorDist);

  return {
    similar,
    score: Math.max(0, Math.min(1, score)),
    detail: {
      globalDist,
      patchMatchRatio,
      colorDist,
      globalSimilarity: globalScore,
      colorSimilarity: 1 - colorDist,
    },
  };
}

/**
 * Hybrid stacking rule (pHash + CLIP):
 *   similar = near-duplicate by pixel hash  OR  CLIP semantic cosine ≥ threshold.
 * CLIP handles "same scene/subject from a different angle"; pHash catches
 * near-identical shots CLIP might embed slightly apart.
 * If CLIP is unavailable (model failed to load), falls back to pure pHash
 * via the legacy compare() above.
 */
export interface PhotoFeatures {
  phash?: ImageFeatures;
  clip?: Float32Array;
}

export function stackSimilar(
  a: PhotoFeatures,
  b: PhotoFeatures,
  opts: SimilarityOptions
): SimilarityResult {
  const level = Math.max(0, Math.min(100, opts.level));
  const globalDist =
    a.phash && b.phash ? hamming(a.phash.global, b.phash.global) : 64;
  const globalMax = Math.round(8 + (level / 100) * 22); // 8..30 bits
  // CLIP cosine for same-scene pairs is typically 0.85-0.97; unrelated
  // scenes 0.55-0.75. Map the slider across that range.
  const clipMin = 0.94 - (level / 100) * 0.16; // 0.94..0.78
  const clipSim = a.clip && b.clip ? cosine(a.clip, b.clip) : 0;

  const colorDist =
    a.phash && b.phash ? colorDistance(a.phash, b.phash) : 1;

  const similar =
    globalDist <= globalMax || (a.clip && b.clip ? clipSim >= clipMin : false);

  const globalScore = 1 - globalDist / 64;
  // Display score: the strongest of the two signals.
  const score = a.clip && b.clip ? Math.max(globalScore, clipSim) : globalScore;

  return {
    similar,
    score: Math.max(0, Math.min(1, score)),
    detail: {
      globalDist,
      patchMatchRatio: 0, // legacy metric; CLIP supersedes it
      colorDist,
      globalSimilarity: globalScore,
      colorSimilarity: 1 - colorDist,
    },
  };
}

function colorDistance(a: ImageFeatures, b: ImageFeatures): number {
  const [ar, ag, ab] = a.meanColor;
  const [br, bg, bb] = b.meanColor;
  return (
    Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) /
    (Math.sqrt(3) * 255)
  );
}
