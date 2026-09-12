/**
 * In-browser person detection with COCO-SSD (TensorFlow.js).
 *
 * Runs fully locally — the model weights are fetched from a CDN once and
 * cached by the browser; no image data is ever uploaded.
 *
 * Used as a hard split when stacking: photos with people never stack with
 * photos without people, regardless of how similar their backgrounds are.
 */
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

export function loadPersonDetector(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      // Bundlers (Vite) can drop tfjs's side-effect backend registration,
      // which surfaces as "No backend found in registry". Import the
      // backends explicitly above and wait for one to be ready.
      await tf.setBackend("webgl").catch(() => tf.setBackend("cpu"));
      await tf.ready();
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return modelPromise;
}

export interface PersonDetection {
  /** Number of people detected. */
  count: number;
  /** Highest person score (0..1), or 0. */
  bestScore: number;
}

const SCORE_THRESHOLD = 0.5;
const DETECT_SIZE = 512; // run detection on a downscaled canvas for speed

/**
 * Detect people in an image. The bitmap is drawn to a small canvas first —
 * COCO-SSD is resolution-sensitive and full-res GoPro photos are slow.
 */
export async function detectPersons(
  bitmap: ImageBitmap
): Promise<PersonDetection> {
  const model = await loadPersonDetector();
  const scale = Math.min(1, DETECT_SIZE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const preds = await model.detect(canvas);
  const persons = preds.filter(
    (p) => p.class === "person" && p.score >= SCORE_THRESHOLD
  );
  return {
    count: persons.length,
    bestScore: persons.reduce((m, p) => Math.max(m, p.score), 0),
  };
}
