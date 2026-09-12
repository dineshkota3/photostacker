import { useCallback, useMemo, useState } from "react";
import LocalFolderInput from "./components/LocalFolderInput";
import StackCard from "./components/StackCard";
import StackModal from "./components/StackModal";
import Compare from "./components/Compare";
import { analyzePhoto, PhotoAnalysis } from "./image/analyze";
import { prepareImageFile } from "./image/decode";
import { buildStacks, PhotoRecord, Stack } from "./image/cluster";
import JSZip from "jszip";

interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  message?: string;
  done?: number;
  total?: number;
}

export default function App() {
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [level, setLevel] = useState(45);
  const [tab, setTab] = useState<"stack" | "compare">("stack");
  const [openStack, setOpenStack] = useState<Stack | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Download selected photos at original quality: the browser saved the
   * original File objects, so these are the exact bytes from disk —
   * HEIC downloads as HEIC, no conversion, no re-encoding.
   */
  const downloadSelected = async () => {
    const picked = photos.filter((p) => selected.has(p.id) && p.file);
    for (const rec of picked) {
      const url = URL.createObjectURL(rec.file!);
      const a = document.createElement("a");
      a.href = url;
      a.download = rec.name; // original filename, original bytes
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Stagger so the browser doesn't block multi-file downloads
      await new Promise((r) => setTimeout(r, 350));
      URL.revokeObjectURL(url);
    }
    setSelected(new Set());
    setSelectMode(false);
  };

  /** Same originals, bundled into a single ZIP (stored, not re-encoded). */
  const downloadSelectedAsZip = async () => {
    const picked = photos.filter((p) => selected.has(p.id) && p.file);
    if (picked.length === 0) return;
    const zip = new JSZip();
    // STORE: JPEG/HEIC are already compressed; re-compressing wastes time
    // and changes nothing about quality (file contents are copied verbatim).
    for (const rec of picked) zip.file(rec.name, rec.file!);
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photo-stacker-selection.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSelected(new Set());
    setSelectMode(false);
  };

  /** Local-folder mode: no auth, files come straight from disk. */
  const handleLocalScan = useCallback(async (files: File[]) => {
    setScan({ status: "scanning", done: 0, total: files.length, message: "Reading local photos…" });
    setPhotos([]);
    setSelected(new Set());
    setSelectMode(false);
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
        file,
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
          <div className="row panel" style={{ padding: 12, marginBottom: 14, gap: 12 }}>
            <button
              className="secondary"
              onClick={() => {
                setSelectMode((s) => !s);
                setSelected(new Set());
              }}
            >
              {selectMode ? "Done selecting" : "Select photos to download"}
            </button>
            {selectMode && (
              <>
                <span className="muted" style={{ flex: 0, padding: "8px 0" }}>
                  {selected.size} selected — open a stack to pick photos
                </span>
                <button
                  disabled={selected.size === 0}
                  onClick={downloadSelected}
                >
                  Download {selected.size} individually
                </button>
                <button
                  disabled={selected.size === 0}
                  onClick={downloadSelectedAsZip}
                >
                  Download {selected.size} as ZIP
                </button>
                <button
                  className="secondary"
                  disabled={photos.every((p) => selected.has(p.id))}
                  onClick={() =>
                    setSelected(new Set(photos.filter((p) => p.file).map((p) => p.id)))
                  }
                >
                  Select all
                </button>
              </>
            )}
          </div>
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
                        selectedCount={
                          selectMode
                            ? s.members.filter((m) => selected.has(m.id)).length
                            : 0
                        }
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
                        selectedCount={
                          selectMode
                            ? s.members.filter((m) => selected.has(m.id)).length
                            : 0
                        }
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
        <StackModal
          stack={openStack}
          onClose={() => setOpenStack(null)}
          selectMode={selectMode}
          isSelected={(id) => selected.has(id)}
          onToggleMember={toggleSelect}
          onSelectAll={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              openStack.members.forEach((m) => next.add(m.id));
              return next;
            })
          }
          onClearAll={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              openStack.members.forEach((m) => next.delete(m.id));
              return next;
            })
          }
        />
      )}
    </div>
  );
}
