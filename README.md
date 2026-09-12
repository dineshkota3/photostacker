# Photo Stacker

A local web app that scans a folder of photos and **stacks visually similar
ones together**. **Fully local**: all analysis runs in your browser, photos never leave your
machine, and nothing is ever written back to your folders.

## How matching works
For each photo, computed in-browser:
- a **CLIP ViT-B/32 embedding** — semantic similarity ("same subject/scene"),
  robust to angle, framing, and lighting changes
- a **global perceptual hash** — catches near-duplicates / identical shots
- **COCO-SSD person detection** — photos with people never stack with photos
  without people, regardless of background similarity

Photos stack when CLIP cosine similarity ≥ threshold **or** the pixel hash
says near-duplicate. A **sensitivity slider** (0–100) tunes the threshold.
HEIC/HEIF photos are decoded locally via a WASM codec.

## Select & download originals
After a scan, use **Select photos to download** — open any stack and check
individual photos (or the whole stack), then download them all. Downloads are
**byte-for-byte originals** (HEIC downloads as HEIC, no re-encoding).

## Run
```bash
npm install
npm run dev
```
Open <http://localhost:5173>. No configuration, no sign-in.

First scan downloads the AI models once (~65 MB total, then cached by the
browser): CLIP from Hugging Face CDN, COCO-SSD from Google Storage. After
that, no network access is needed and no image data ever leaves the machine.

## Notes / limitations
- Works on jpg, png, webp, gif, bmp, tiff, heic/heif.
- Pairwise comparison is O(n²); fine for hundreds of photos per folder.
- Tested in Chrome; headless e2e harness in `scripts/e2e.mjs`.
