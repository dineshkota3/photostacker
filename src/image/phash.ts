/**
 * Perceptual hashing for content-aware stacking.
 *
 * We extract, from a small grayscale version of each image:
 *   - a GLOBAL pHash (64-bit)  -> catches near-duplicates and identical shots
 *   - a GRID of patch pHashes  -> lets us match the SAME person in different
 *     poses, even when their position shifts, while NOT matching two DIFFERENT
 *     people who merely share a background.
 *
 * The matching logic lives in similarity.ts; this file only computes features.
 */

export interface ImageFeatures {
  /** 64-bit global perceptual hash as a bigint. */
  global: bigint;
  /** NxN grid of 64-bit patch hashes (row-major). */
  patches: bigint[];
  gridSize: number;
  /** Average per-channel color (0-255) for rough color layout. */
  meanColor: [number, number, number];
}

const GRAY_SIZE = 32; // working grayscale canvas size
const HASH_N = 8; // 8x8 = 64-bit hashes

/**
 * Load an image from an object URL / blob URL into an ImageBitmap.
 */
export async function loadImage(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  const blob = await res.blob();
  // Apply EXIF orientation — iPhone portraits are stored landscape with an
  // orientation flag; without this the hash is computed on a sideways image.
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(blob); // older browsers
  }
}

/**
 * Decode an image to a normalized grayscale + RGBA buffer at GRAY_SIZE.
 * Returns the grayscale values and average color.
 */
function decodeToGrayScale(
  bitmap: ImageBitmap
): { gray: Float32Array; mean: [number, number, number] } {
  const canvas = document.createElement("canvas");
  canvas.width = GRAY_SIZE;
  canvas.height = GRAY_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, GRAY_SIZE, GRAY_SIZE);
  const { data } = ctx.getImageData(0, 0, GRAY_SIZE, GRAY_SIZE);

  const gray = new Float32Array(GRAY_SIZE * GRAY_SIZE);
  let rs = 0;
  let gs = 0;
  let bs = 0;
  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Luma
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    rs += r;
    gs += g;
    bs += b;
  }
  const n = gray.length;
  return {
    gray,
    mean: [rs / n, gs / n, bs / n],
  };
}

/**
 * Compute a 64-bit DCT-ish pHash over a square region of the grayscale buffer.
 * region: { x0, y0, x1, y1 } in GRAY_SIZE coordinates.
 */
function hashRegion(
  gray: Float32Array,
  region: { x0: number; y0: number; x1: number; y1: number }
): bigint {
  // Sample HASH_N x HASH_N cells within the region, averaging gray values.
  const cellAvg = new Float32Array(HASH_N * HASH_N);
  for (let cy = 0; cy < HASH_N; cy++) {
    for (let cx = 0; cx < HASH_N; cx++) {
      const fx0 =
        region.x0 + ((region.x1 - region.x0) * cx) / HASH_N;
      const fy0 =
        region.y0 + ((region.y1 - region.y0) * cy) / HASH_N;
      const fx1 =
        region.x0 + ((region.x1 - region.x0) * (cx + 1)) / HASH_N;
      const fy1 =
        region.y0 + ((region.y1 - region.y0) * (cy + 1)) / HASH_N;
      let sum = 0;
      let count = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          if (x >= 0 && x < GRAY_SIZE && y >= 0 && y < GRAY_SIZE) {
            sum += gray[y * GRAY_SIZE + x];
            count++;
          }
        }
      }
      cellAvg[cy * HASH_N + cx] = count ? sum / count : 0;
    }
  }

  // Median threshold for robustness to lighting.
  const sorted = Array.from(cellAvg).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let hash = 0n;
  for (let i = 0; i < cellAvg.length; i++) {
    if (cellAvg[i] > median) hash |= 1n << BigInt(i);
  }
  return hash;
}

export async function computeFeatures(
  bitmap: ImageBitmap
): Promise<ImageFeatures> {
  const { gray, mean } = decodeToGrayScale(bitmap);

  // 2x2 grid = 4 patches of 16x16 px. Small patches (8x8 px = one pixel per
  // hash bit) are pure noise — a 1px framing shift flips half the bits.
  const gridSize = 2;
  const patches: bigint[] = [];
  const step = GRAY_SIZE / gridSize;
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      patches.push(
        hashRegion(gray, {
          x0: Math.floor(gx * step),
          y0: Math.floor(gy * step),
          x1: Math.floor((gx + 1) * step),
          y1: Math.floor((gy + 1) * step),
        })
      );
    }
  }

  const global = hashRegion(gray, { x0: 0, y0: 0, x1: GRAY_SIZE, y1: GRAY_SIZE });

  return { global, patches, gridSize, meanColor: mean };
}

export function popcount(x: bigint): number {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1n;
    c++;
  }
  return c;
}
