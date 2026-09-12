/**
 * Headless replica of the browser pipeline (phash.ts + similarity.ts +
 * cluster.ts) using sharp, so we can test stacking on real photos without
 * a browser. Math is copied 1:1 from src/image/*.
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const GRAY_SIZE = 32;
const HASH_N = 8;

async function decodeToGrayScale(file) {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .greyscale() // sharp luma ≈ (0.2126,0.7152,0.0722) — close enough to our 601 luma
    .resize(GRAY_SIZE, GRAY_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gray = new Float32Array(GRAY_SIZE * GRAY_SIZE);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * info.channels];
  return gray;
}

function hashRegion(gray, region) {
  const cellAvg = new Float32Array(HASH_N * HASH_N);
  for (let cy = 0; cy < HASH_N; cy++) {
    for (let cx = 0; cx < HASH_N; cx++) {
      const fx0 = region.x0 + ((region.x1 - region.x0) * cx) / HASH_N;
      const fy0 = region.y0 + ((region.y1 - region.y0) * cy) / HASH_N;
      const fx1 = region.x0 + ((region.x1 - region.x0) * (cx + 1)) / HASH_N;
      const fy1 = region.y0 + ((region.y1 - region.y0) * (cy + 1)) / HASH_N;
      let sum = 0, count = 0;
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
  const sorted = Array.from(cellAvg).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let hash = 0n;
  for (let i = 0; i < cellAvg.length; i++) if (cellAvg[i] > median) hash |= 1n << BigInt(i);
  return hash;
}

function popcount(x) { let c = 0, v = x; while (v) { v &= v - 1n; c++; } return c; }
const hamming = (a, b) => popcount(a ^ b);

async function features(file) {
  const gray = await decodeToGrayScale(file);
  const gridSize = 2, patches = [], step = GRAY_SIZE / gridSize;
  for (let gy = 0; gy < gridSize; gy++)
    for (let gx = 0; gx < gridSize; gx++)
      patches.push(hashRegion(gray, {
        x0: Math.floor(gx * step), y0: Math.floor(gy * step),
        x1: Math.floor((gx + 1) * step), y1: Math.floor((gy + 1) * step),
      }));
  const global = hashRegion(gray, { x0: 0, y0: 0, x1: GRAY_SIZE, y1: GRAY_SIZE });
  return { global, patches };
}

function compare(a, b, level) {
  const globalDist = hamming(a.global, b.global);
  let matched = 0;
  for (const pa of a.patches) {
    let best = 64;
    for (const pb of b.patches) { const d = hamming(pa, pb); if (d < best) best = d; }
    if (best <= 14) matched++;
  }
  const patchMatchRatio = matched / a.patches.length;
  const globalMax = Math.round(8 + (level / 100) * 22);
  const patchMin = 0.75 - (level / 100) * 0.45;
  return { globalDist, patchMatchRatio, similar: globalDist <= globalMax || patchMatchRatio >= patchMin };
}

const dir = process.argv[2] || "test-photos";
const level = Number(process.argv[3] ?? 45);
const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).map((f) => join(dir, f)).sort();
const feats = await Promise.all(files.map(features));

console.log(`\n=== ${files.length} photos, level=${level} ===\nPairwise globalDist / patchMatchRatio (sorted by globalDist):\n`);
const pairs = [];
for (let i = 0; i < files.length; i++)
  for (let j = i + 1; j < files.length; j++) {
    const c = compare(feats[i], feats[j], level);
    pairs.push({ a: files[i].split("/").pop(), b: files[j].split("/").pop(), ...c });
  }
pairs.sort((x, y) => x.globalDist - y.globalDist);
for (const p of pairs.slice(0, 25))
  console.log(
    `${p.a} vs ${p.b}: g=${String(p.globalDist).padStart(2)} pmr=${p.patchMatchRatio.toFixed(2)} similar=${p.similar}`
  );

// union-find
const parent = files.map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
for (const p of pairs) {
  if (!p.similar) continue;
  const i = files.findIndex((f) => f.endsWith(p.a)), j = files.findIndex((f) => f.endsWith(p.b));
  parent[find(i)] = find(j);
}
const groups = new Map();
files.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f.split("/").pop()); });
console.log(`\nStacks:`);
for (const g of groups.values()) console.log(`  [${g.length}] ${g.join(", ")}`);
