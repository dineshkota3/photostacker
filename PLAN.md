# Photo Deduplication / Stacking App — Implementation Plan

## Goal
A **local** web app that:
1. Authenticates to the user's OneDrive account ("Sign in with Microsoft" widget).
2. Lets the user paste/browse a OneDrive folder URL containing photos.
3. Reads all images in that folder (read-only — **never deletes or modifies anything**).
4. Detects visually similar / duplicate photos and **stacks** them together in the UI.
5. Lets the user review stacks and (optionally later) act on them — but for now, **no deletion**. Pure organization view.

---

## 1. Core Design Decisions

### 1.1 Auth & Data access: Microsoft Graph + MSAL (not the File Picker)
The OneDrive File Picker v8 widget is designed for *picking individual files*. We need to enumerate an entire folder and download thumbnails to compare photos pairwise. That requires:
- **Microsoft Graph API** to list folder contents + fetch thumbnails.
- **MSAL.js (`@azure/msal-browser` / `@azure/msal-react`)** for OAuth 2.0 authorization-code flow with PKCE (a "Sign in with Microsoft" button — this is the "OneDrive widget").

Scopes (delegated, **read-only**): `Files.Read`, `Files.Read.All`, `User.Read`, `offline_access`.

> We deliberately do **not** request `Files.ReadWrite` so the app is physically incapable of modifying or deleting the user's photos.

### 1.2 Folder input: paste a OneDrive sharing URL
User pastes a URL like `https://1drv.ms/...` or a personal OneDrive web URL. We resolve it via Graph:
- `POST /sharing/v1.0/shares/{u!<base64-url>}/root` (`microsoft.graph.shares` / `shares` endpoint) to turn the sharing link into a `driveItem`, then enumerate children via `/children`.
- Fallback: if the user signs into their own account, we offer their whole drive + a folder browser built from Graph `/children` calls (folder tree picker of our own — read only).

### 1.3 Read-only guarantee
- App requests only `Files.Read.All`.
- No write/DELETE Graph calls anywhere in code.
- Prominent "Read-only mode" badge in UI.

### 1.4 Tech stack
- **Frontend**: React + Vite + TypeScript (clean, fast local dev).
- **Auth**: `@azure/msal-browser` + `@azure/msal-react`.
- **Backend**: a tiny local Node/Express proxy is **optional**. MSAL + Graph can run fully client-side (SPA). We'll go **client-side only** to keep it simple and truly local — no server secrets to manage. (CORS is supported by Graph for browser calls with a valid access token.)
- **Perceptual hashing** for similarity:
  - Compute **pHash (perceptual hash)** + **average color histogram** per image in the browser.
  - Group images by Hamming distance threshold (pHash) + histogram similarity to form "stacks" (exact/near duplicates + visually similar).
  - Library: `sharp` is server-side; for browser we use the Canvas API to downscale to 32×32 grayscale and compute the hash in JS (no native deps → easy to run locally).
- **Clustering**: simple union-find over pairs whose similarity is below threshold → produces stacks.

### 1.5 "Stack" UI
- Each stack shown as a card with a cover thumbnail + count badge.
- Click a stack → see all members side by side with metadata (filename, size, dimensions, date, similarity score).
- Non-matched images shown individually.
- No delete/modify actions. A "collapse/expand" toggle is the only interaction.

---

## 2. Microsoft App Registration (manual, one-time — you do this)
1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**.
2. Name: `Local Photo Stacker`. Supported account types: **Personal Microsoft accounts + Work/school** (or just personal if your photos are in a personal OneDrive).
3. Redirect URI → **Single-page application (SPA)**: `http://localhost:5173` (Vite default).
4. API permissions → add delegated `Files.Read`, `Files.Read.All`, `User.Read`, `offline_access`.
5. Copy the **Application (client) ID** → put it in `.env` as `VITE_CLIENT_ID`.
6. (No client secret needed for the SPA/public flow.)

> Note: a small "Picker / Sign in with Microsoft" widget will be built from MSAL. There is no official drop-in OneDrive *folder* widget that fits a dedupe scan, so we build the minimal equivalent.

---

## 3. Project Structure
```
photo_classification/
├── PLAN.md                  # this file
├── README.md                # setup + app registration steps
├── package.json
├── vite.config.ts
├── .env.example             # VITE_CLIENT_ID=...
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── authConfig.ts        # MSAL config
    ├── api/
    │   ├── graph.ts         # resolve share link, list children, get thumbnails
    │   └── types.ts
    ├── image/
    │   ├── phash.ts         # downscale + perceptual hash via Canvas
    │   ├── similarity.ts    # hamming distance, histogram compare
    │   └── cluster.ts       # union-find stacking
    ├── components/
    │   ├── SignIn.tsx       # "Sign in with Microsoft" widget
    │   ├── FolderInput.tsx  # paste OneDrive URL / browse
    │   ├── ScanProgress.tsx # progress while hashing
    │   ├── StackCard.tsx    # a stack of similar photos
    │   └── StackGrid.tsx
    └── pages/
        └── Home.tsx
```

---

## 4. Implementation Steps

### Phase 0 — Scaffold (done during impl)
- `npm create vite@latest . -- --template react-ts`
- Add deps: `@azure/msal-browser @azure/msal-react`
- `.env.example` with `VITE_CLIENT_ID`.

### Phase 1 — Auth widget
- `MsalProvider` wrapping the app.
- `SignIn.tsx`: "Sign in with Microsoft" button → `loginPopup({ scopes })`. Shows signed-in user's name + "Read-only" badge + Sign out.

### Phase 2 — Folder resolution & listing
- `resolveShareUrl(url)` → POST `/shares/{encoded}` → driveItem.
- `listChildren(itemId)` → `/me/drive/items/{id}/children?select=name,size,id,lastModifiedDateTime,image,folder`.
- Filter to image mime/types only.
- Folder-tree browser (own UI) as alternative to pasting a URL.

### Phase 3 — Thumbnails + perceptual hashing
- For each image: fetch thumbnail via `/items/{id}/thumbnails/0/c400x400/content` (small, fast, uses token).
- Decode to `ImageBitmap`, draw to 32×32 grayscale canvas, compute pHash (64-bit) + simple RGB histogram.
- All client-side, no uploads anywhere.

### Phase 4 — Clustering into stacks
- Pairwise: Hamming(pHash) ≤ threshold (e.g., 8 bits) **and** histogram distance < ε → "similar".
- Union-find → stacks. Configurable sensitivity slider in UI.
- Solo images (no matches) → singletons.

### Phase 5 — Stack UI
- Grid of `StackCard`s (cover + count badge).
- Click → expand member gallery with metadata + pairwise similarity.
- Read-only badge, no destructive controls.

### Phase 6 — Polish
- Caching of thumbnails + hashes in IndexedDB (so re-scans are instant).
- Loading states, error handling for token/share-link failures.
- README with app-registration walkthrough.

---

## 5. Privacy & Safety
- All image processing happens **locally in the browser**. Image bytes are never uploaded to any third-party server (only fetched from OneDrive into memory).
- App holds **read-only** Graph permissions; code contains no write/delete calls.
- Tokens stay in browser storage via MSAL; never logged.

---

## 6. Out of scope (explicitly)
- No deletion, moving, or renaming of OneDrive photos (per your instruction).
- No backend server (kept fully client-side for simplicity; can add later if needed).
- Not processing videos — images only (jpg/png/heic/webp). HEIC decode in-browser may need a fallback library; we'll handle best-effort.

---

## 7. Decisions (confirmed)
- **Account type: Personal Microsoft account** → app registration supports "Personal Microsoft accounts"; MSAL authority = `consumers` / `https://login.microsoftonline.com/consumers`.
- **Architecture: client-side SPA only** (no backend). All hashing/thumbnails in-browser.

## 8. Order of work
1. Scaffold + MSAL sign-in widget working locally.
2. Paste/share-link folder resolution + listing images.
3. Thumbnails + pHash + clustering.
4. Stack UI.
5. README + finalize.
