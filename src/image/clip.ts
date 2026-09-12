/**
 * CLIP image embeddings, running fully in-browser via transformers.js
 * (ONNX Runtime Web on WASM/WebGPU). The model downloads once from the
 * Hugging Face CDN and is cached by the browser; all inference — including
 * your photos — stays on this machine.
 *
 * CLIP gives *semantic* similarity: two photos of the same scene from
 * different angles embed close together, while different scenes don't —
 * exactly what pixel-level pHash struggles with.
 */
import {
  CLIPVisionModelWithProjection,
  AutoProcessor,
  RawImage,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/clip-vit-base-patch32";

let visionPromise: Promise<any> | null = null;
let processorPromise: Promise<any> | null = null;

async function getVision() {
  if (!visionPromise) {
    visionPromise = CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
      dtype: "q8",
    }).catch((e) => {
      visionPromise = null; // allow retry on the next photo
      throw e;
    });
  }
  return visionPromise;
}

async function getProcessor() {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_ID);
  }
  return processorPromise;
}

/** Convert an ImageBitmap to a RawImage (via canvas → blob). */
export async function bitmapToRawImage(bitmap: ImageBitmap): Promise<RawImage> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), "image/png")
  );
  return await RawImage.fromBlob(blob);
}

/** Normalized CLIP embedding for an image. */
export async function clipEmbedding(image: RawImage): Promise<Float32Array> {
  const [vision, processor] = await Promise.all([getVision(), getProcessor()]);
  const { pixel_values } = await processor(image);
  const { image_embeds } = await vision({ pixel_values });
  const data = image_embeds.cpu?.()?.data ?? image_embeds.data;
  return normalize(new Float32Array(data));
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

/** Cosine similarity of two normalized vectors: their dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export async function computeClipFeatures(
  bitmap: ImageBitmap
): Promise<{ embedding: Float32Array }> {
  const raw = await bitmapToRawImage(bitmap);
  const embedding = await clipEmbedding(raw);
  return { embedding };
}
