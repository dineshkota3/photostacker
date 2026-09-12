import { ImageFeatures } from "./phash";
import { compare, stackSimilar, SimilarityOptions } from "./similarity";

export interface PhotoRecord {
  id: string;
  name: string;
  thumbUrl: string;
  size?: number;
  modified?: string;
  features?: ImageFeatures; // undefined if hashing failed
  /** Normalized CLIP embedding (undefined if CLIP unavailable). */
  clip?: Float32Array;
  /** Number of people detected (undefined if detection failed/unavailable). */
  persons?: number;
}

export interface Stack {
  id: string;
  members: PhotoRecord[];
  /** Average similarity among members (for sorting/display). */
  cohesion: number;
}

/**
 * Union-find clustering of photos into stacks based on pairwise similarity.
 * Two photos land in the same stack if `compare` says they're similar for the
 * given sensitivity level. Transitive: if A~B and B~C, all three stack together.
 */
export function buildStacks(
  photos: PhotoRecord[],
  opts: SimilarityOptions
): Stack[] {
  const n = photos.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  let compared = 0;
  for (let i = 0; i < n; i++) {
    const fi = photos[i].features;
    if (!fi && !photos[i].clip) continue;
    for (let j = i + 1; j < n; j++) {
      const fj = photos[j].features;
      if (!fj && !photos[j].clip) continue;
      // Hard split: photos with people never stack with photos without people,
      // no matter how similar the background is. (Only when detection ran on
      // both — if either count is unknown we fall back to pure similarity.)
      const pi = photos[i].persons;
      const pj = photos[j].persons;
      if (pi !== undefined && pj !== undefined && (pi > 0) !== (pj > 0)) {
        continue;
      }
      compared++;
      // Hybrid: CLIP semantic similarity if available, else pure pHash.
      const res =
        photos[i].clip || photos[j].clip
          ? stackSimilar(photos[i], photos[j], opts)
          : fi && fj
            ? compare(fi, fj, opts)
            : { similar: false, score: 0, detail: null as never };
      if (res.similar) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const stacks: Stack[] = [];
  let k = 0;
  for (const indices of groups.values()) {
    const members = indices.map((i) => photos[i]);
    // cohesion: average pairwise score among feature-bearing members.
    let total = 0;
    let pairs = 0;
    for (let a = 0; a < indices.length; a++) {
      const ra = photos[indices[a]];
      if (!ra.features && !ra.clip) continue;
      for (let b = a + 1; b < indices.length; b++) {
        const rb = photos[indices[b]];
        if (!rb.features && !rb.clip) continue;
        total += (
          ra.clip || rb.clip
            ? stackSimilar(ra, rb, opts)
            : ra.features && rb.features
              ? compare(ra.features, rb.features, opts)
              : { score: 0 }
        ).score;
        pairs++;
      }
    }
    stacks.push({
      id: `stack-${k++}`,
      members,
      cohesion: pairs ? total / pairs : 1,
    });
  }

  // Sort: multi-member stacks first (by size desc), then singletons.
  stacks.sort((x, y) => {
    if (x.members.length > 1 && y.members.length === 1) return -1;
    if (x.members.length === 1 && y.members.length > 1) return 1;
    return y.members.length - x.members.length;
  });

  return stacks;
}
