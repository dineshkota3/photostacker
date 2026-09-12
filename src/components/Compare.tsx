import { useEffect, useState } from "react";
import { computeFeatures, ImageFeatures } from "../image/phash";
import { compare, stackSimilar } from "../image/similarity";
import { detectPersons } from "../image/detect";
import { computeClipFeatures } from "../image/clip";
import { prepareImageFile } from "../image/decode";

interface Slot {
  name: string;
  url: string;
  features?: ImageFeatures;
  clip?: Float32Array;
  persons?: number;
  error?: string;
}

interface Props {
  level: number;
}

async function loadSlot(file: File): Promise<Slot> {
  const base: Slot = { name: file.name, url: "" };
  try {
    const { blob, bitmap } = await prepareImageFile(file);
    const features = await computeFeatures(bitmap).catch(() => undefined);
    const clipF = await computeClipFeatures(bitmap).catch(() => undefined);
    let persons: number | undefined;
    try {
      persons = (await detectPersons(bitmap)).count;
    } catch {
      persons = undefined;
    }
    bitmap.close?.();
    return {
      ...base,
      url: URL.createObjectURL(blob),
      features,
      clip: clipF?.embedding,
      persons,
    };
  } catch (e: any) {
    return {
      ...base,
      url: URL.createObjectURL(file),
      error: e?.message || "Could not decode image",
    };
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function Pane({
  slot,
  onPick,
}: {
  slot: Slot | null;
  onPick: (f: File) => void;
}) {
  const inputId = `cmp-${Math.random().toString(36).slice(2)}`;
  return (
    <div className="panel" style={{ flex: 1, minWidth: 240 }}>
      <label htmlFor={inputId}>
        {slot ? slot.name : "Choose an image (JPG / PNG / HEIC)"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*,.heic,.heif"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <div
        className="cmp-drop"
        onClick={() => document.getElementById(inputId)?.click()}
      >
        {slot?.url ? (
          <img src={slot.url} alt={slot.name} />
        ) : (
          <span className="muted">Click to choose a photo</span>
        )}
      </div>
      {slot?.persons !== undefined && (
        <p className="muted" style={{ marginTop: 8 }}>
          People detected: <strong>{slot.persons}</strong>
        </p>
      )}
      {slot?.error && <div className="error">{slot.error}</div>}
    </div>
  );
}

export default function Compare({ level }: Props) {
  const [a, setA] = useState<Slot | null>(null);
  const [b, setB] = useState<Slot | null>(null);
  const [revA, setRevA] = useState(0);
  const [revB, setRevB] = useState(0);
  const rerender = () => {
    setRevA((x) => x + 1);
    setRevB((x) => x + 1);
  };
  void revA; void revB;

  const pick = (which: "a" | "b") => async (f: File) => {
    rerender();
    if (which === "a") setA({ name: f.name, url: URL.createObjectURL(f) });
    else setB({ name: f.name, url: URL.createObjectURL(f) });
    const slot = await loadSlot(f);
    if (which === "a") setA(slot);
    else setB(slot);
  };

  // Revoke object URLs on unmount
  useEffect(
    () => () => {
      if (a?.url) URL.revokeObjectURL(a.url);
      if (b?.url) URL.revokeObjectURL(b.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const result =
    (a?.features || a?.clip) && (b?.features || b?.clip)
      ? stackSimilar(a ?? {}, b ?? {}, { level })
      : null;
  const legacy =
    a?.features && b?.features ? compare(a.features, b.features, { level }) : null;

  return (
    <>
      <div className="row" style={{ alignItems: "stretch" }}>
        <Pane slot={a} onPick={pick("a")} />
        <Pane slot={b} onPick={pick("b")} />
      </div>

      {result ? (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>
            Overall similarity:{" "}
            <strong style={{ fontSize: 24 }}>{pct(result.score)}</strong>{" "}
            {result.similar ? (
              <span className="badge ro">would stack together</span>
            ) : (
              <span className="badge">would stay separate</span>
            )}
          </h3>
          <table className="cmp-table">
            <tbody>
              <tr>
                <td>Near-duplicate (global hash)</td>
                <td>{pct(result.detail.globalSimilarity)}</td>
              </tr>
              <tr>
                <td>Subject / scene (CLIP semantic)</td>
                <td>
                  {a?.clip && b?.clip
                    ? pct(Math.max(result.detail.globalSimilarity, result.score))
                    : "unavailable"}
                </td>
              </tr>
              <tr>
                <td>Color palette closeness</td>
                <td>{pct(result.detail.colorSimilarity)}</td>
              </tr>
              {legacy && (
                <tr>
                  <td>Patch overlap (legacy metric)</td>
                  <td>{pct(legacy.detail.patchMatchRatio)}</td>
                </tr>
              )}
              {a?.persons !== undefined && b?.persons !== undefined && (
                <tr>
                  <td>People</td>
                  <td>
                    {a.persons} vs {b.persons}{" "}
                    {a.persons > 0 !== b.persons > 0 ? "(hard split)" : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted" style={{ marginBottom: 0 }}>
            Verdict uses the current matching sensitivity ({level}). Raise it to
            see how looser thresholds would change the answer.
          </p>
        </div>
      ) : (
        a &&
        b && <div className="error">One of the images could not be decoded.</div>
      )}
    </>
  );
}
