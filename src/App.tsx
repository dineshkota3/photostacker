import { useCallback, useMemo, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import SignIn from "./components/SignIn";
import FolderInput from "./components/FolderInput";
import LocalFolderInput from "./components/LocalFolderInput";
import StackCard from "./components/StackCard";
import StackModal from "./components/StackModal";
import Compare from "./components/Compare";
import {
  resolveShareUrl,
  listChildren,
  getThumbnailUrl,
  filterImages,
} from "./api/graph";
import { loadImage } from "./image/phash";
import { analyzePhoto, PhotoAnalysis } from "./image/analyze";
import { prepareImageFile } from "./image/decode";
import { buildStacks, PhotoRecord, Stack } from "./image/cluster";

interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  message?: string;
  done?: number;
  total?: number;
}

export default function App() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0] || null;

  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [level, setLevel] = useState(45);
  const [tab, setTab] = useState<"stack" | "compare">("stack");
  const [openStack, setOpenStack] = useState<Stack | null>(null);

  const handleScan = useCallback(
    async (shareUrl: string) => {
      if (!account) return;
      setScan({ status: "scanning", done: 0, total: 0, message: "Resolving link…" });
      setPhotos([]);
      try {
        const { driveId, itemId } = await resolveShareUrl(
          instance,
          account,
          shareUrl
        );
        setScan({ status: "scanning", message: "Listing photos…" });
        const children = await listChildren(instance, account, driveId, itemId);
        const images = filterImages(children);
        if (images.length === 0) {
          setScan({ status: "error", message: "No images found in that folder." });
          return;
        }

        const total = images.length;
        let detectFailed = false;
        const records: PhotoRecord[] = [];
        for (let i = 0; i < total; i++) {
          const item = images[i];
          setScan({
            status: "scanning",
            done: i,
            total,
            message: `Loading thumbnails…`,
          });
          const thumbUrl = await getThumbnailUrl(
            instance,
            account,
            driveId,
            item.id
          );
          if (!thumbUrl) continue;
          let analysis: PhotoAnalysis = {};
          try {
            const bitmap = await loadImage(thumbUrl);
            analysis = await analyzePhoto(bitmap);
            if (analysis.persons === undefined) detectFailed = true;
            bitmap.close?.();
          } catch {
            analysis = {}; // undecodable; image becomes a singleton
          }
          records.push({
            id: item.id,
            name: item.name,
            thumbUrl,
            size: item.size,
            modified: item.lastModifiedDateTime,
            features: analysis.features,
            clip: analysis.clip,
            persons: analysis.persons,
          });
        }

        setPhotos(records);
        setScan({
          status: "done",
          done: total,
          total,
          message: detectFailed
            ? "Person detection failed (model download?) — stacking by visual similarity only."
            : undefined,
        });
      } catch (e: any) {
        setScan({ status: "error", message: e?.message || String(e) });
      }
    },
    [instance, account]
  );

  /** Local-folder mode: no auth, files come straight from disk. */
  const handleLocalScan = useCallback(async (files: File[]) => {
    setScan({ status: "scanning", done: 0, total: files.length, message: "Reading local photos…" });
    setPhotos([]);
    let detectFailed = false;
    const records: PhotoRecord[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setScan({ status: "scanning", done: i, total: files.length, message: "Hashing, CLIP & detecting people…" });
      let thumbUrl: string = "";
      let analysis: PhotoAnalysis = {};
      try {
        const { blob, bitmap } = await prepareImageFile(file);
        thumbUrl = URL.createObjectURL(blob);
        analysis = await analyzePhoto(bitmap);
        if (analysis.persons === undefined) detectFailed = true;
        bitmap.close?.();
      } catch {
        analysis = {}; // undecodable (e.g. some HEIC); becomes a singleton
      }
      records.push({
        id: `${file.name}-${i}`,
        // If decoding failed entirely, still show the original (may render blank in Chrome for HEIC).
        thumbUrl: thumbUrl || URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        modified: new Date(file.lastModified).toISOString(),
        features: analysis.features,
        clip: analysis.clip,
        persons: analysis.persons,
      });
    }
    setPhotos(records);
    setScan({
      status: "done",
      done: files.length,
      total: files.length,
      message: detectFailed
        ? "Person detection failed (model download?) — stacking by visual similarity only."
        : undefined,
    });
  }, []);

  const stacks = useMemo(
    () => buildStacks(photos, { level }),
    [photos, level]
  );

  const multiStacks = stacks.filter((s) => s.members.length > 1);
  const singletons = stacks.filter((s) => s.members.length === 1);

  const progress =
    scan.total && scan.total > 0 ? (scan.done! / scan.total) * 100 : 0;

  return (
    <div className="app">
      <div className="topbar">
        <h1>📸 Photo Stacker</h1>
        <div className="tabs">
          <button
            className={tab === "stack" ? "tab active" : "tab"}
            onClick={() => setTab("stack")}
          >
            Stack a folder
          </button>
          <button
            className={tab === "compare" ? "tab active" : "tab"}
            onClick={() => setTab("compare")}
          >
            Compare two photos
          </button>
        </div>
        <SignIn />
      </div>

      {tab === "compare" && (
        <>
          <div className="panel">
            <label htmlFor="lvlc">
              Matching sensitivity — {level} (higher = stricter "similar")
            </label>
            <input
              id="lvlc"
              type="range"
              min={0}
              max={100}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </div>
          <Compare level={level} />
        </>
      )}

      {tab === "stack" && (
      <>
      <LocalFolderInput
        onScan={handleLocalScan}
        loading={scan.status === "scanning"}
      />

      {isAuthenticated && (
        <FolderInput onScan={handleScan} loading={scan.status === "scanning"} />
      )}

      <>
          {scan.status === "scanning" && (
            <div className="panel">
              <div className="muted">{scan.message}</div>
              {scan.total ? (
                <>
                  <div className="progress">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {scan.done} / {scan.total}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {scan.status === "error" && (
            <div className="error">{scan.message}</div>
          )}

          {scan.status === "done" && photos.length > 0 && (
            <>
          {scan.message && <div className="error" style={{ marginBottom: 14 }}>{scan.message}</div>}
              <div className="panel">
                <label htmlFor="lvl">
                  Matching sensitivity — {level} (higher = stack more)
                </label>
                <input
                  id="lvl"
                  type="range"
                  min={0}
                  max={100}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                />
                <p className="muted" style={{ marginTop: 8 }}>
                  Keep this moderate so the same person in different poses stacks,
                  but different people in the same background stay separate. Found{" "}
                  <strong>{multiStacks.length}</strong> stack
                  {multiStacks.length !== 1 ? "s" : ""} ·{" "}
                  {singletons.length} unique photo
                  {singletons.length !== 1 ? "s" : ""}.
                </p>
              </div>

              {multiStacks.length > 0 && (
                <>
                  <div className="solo">Stacked (similar photos)</div>
                  <div className="grid">
                    {multiStacks.map((s) => (
                      <StackCard
                        key={s.id}
                        stack={s}
                        onOpen={() => setOpenStack(s)}
                      />
                    ))}
                  </div>
                </>
              )}

              {singletons.length > 0 && (
                <>
                  <div className="solo">Unique photos (no matches)</div>
                  <div className="grid">
                    {singletons.map((s) => (
                      <StackCard
                        key={s.id}
                        stack={s}
                        onOpen={() => setOpenStack(s)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
      </>
      </>
      )}

      {openStack && (
        <StackModal stack={openStack} onClose={() => setOpenStack(null)} />
      )}
    </div>
  );
}
