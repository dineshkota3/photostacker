import { useEffect, useState } from "react";
import { PhotoRecord, Stack } from "../image/cluster";

interface Props {
  stack: Stack;
  onClose: () => void;
  /** When true, member photos show checkboxes for download selection. */
  selectMode?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleMember?: (id: string) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
}

/** Full-screen enlarged photo with prev/next navigation. */
function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  selectMode,
  isSelected,
  onToggleMember,
}: {
  photos: PhotoRecord[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  selectMode?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleMember?: (id: string) => void;
}) {
  const photo = photos[index];
  const sel = selectMode && isSelected?.(photo.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
      else if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 60, background: "rgba(0, 0, 0, 0.92)" }}
      onClick={(e) => {
        e.stopPropagation(); // don't bubble into the stack modal's backdrop
        onClose();
      }}
    >
      <button
        className="lightbox-nav"
        style={{ left: 16 }}
        onClick={(e) => {
          e.stopPropagation();
          onIndex((index - 1 + photos.length) % photos.length);
        }}
        title="Previous (←)"
      >
        ‹
      </button>
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <img src={photo.thumbUrl} alt={photo.name} />
        <div className="lightbox-bar">
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {photo.name}{" "}
            <span className="muted">
              ({index + 1}/{photos.length})
            </span>
          </span>
          {selectMode && (
            <button
              className={sel ? "" : "secondary"}
              style={{ flex: 0 }}
              onClick={() => onToggleMember?.(photo.id)}
            >
              {sel ? "✓ Selected" : "Select for download"}
            </button>
          )}
          <button className="secondary" style={{ flex: 0 }} onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
      </div>
      <button
        className="lightbox-nav"
        style={{ right: 16 }}
        onClick={(e) => {
          e.stopPropagation();
          onIndex((index + 1) % photos.length);
        }}
        title="Next (→)"
      >
        ›
      </button>
    </div>
  );
}

export default function StackModal({
  stack,
  onClose,
  selectMode,
  isSelected,
  onToggleMember,
  onSelectAll,
  onClearAll,
}: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const selectedCount = selectMode
    ? stack.members.filter((m) => isSelected?.(m.id)).length
    : 0;
  const allSelected = selectedCount === stack.members.length;

  // Close lightbox if it would go out of range (stacks don't change, but be safe)
  useEffect(() => {
    if (lightbox !== null && lightbox >= stack.members.length) setLightbox(null);
  }, [lightbox, stack.members.length]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: "center" }}>
          <h3 style={{ flex: 1 }}>
            {stack.members.length} photo{stack.members.length > 1 ? "s" : ""} ·{" "}
            <span className="muted">cohesion {(stack.cohesion * 100).toFixed(0)}%</span>
            {selectMode && (
              <>
                {" · "}
                <span className="muted">{selectedCount} selected</span>
              </>
            )}
          </h3>
          {selectMode && (
            <button
              className="secondary"
              style={{ flex: 0 }}
              onClick={allSelected ? onClearAll : onSelectAll}
            >
              {allSelected ? "Clear stack" : "Select whole stack"}
            </button>
          )}
          <button className="secondary" style={{ flex: 0 }} onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          Click a photo to enlarge it — browse with ← →, Esc to go back
          {selectMode ? ", and select it for download from there (or use the checkbox)." : "."}
        </p>
        <div className="members">
          {stack.members.map((m, i) => {
            const sel = selectMode && isSelected?.(m.id);
            return (
              <div
                className={"card" + (sel ? " selected" : "")}
                key={m.id}
                onClick={() => setLightbox(i)}
                style={{ cursor: "pointer" }}
                title={m.name}
              >
                <img src={m.thumbUrl} alt={m.name} loading="lazy" />
                {selectMode && (
                  <span
                    className={"check" + (sel ? " on" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMember?.(m.id);
                    }}
                  >
                    {sel ? "✓" : ""}
                  </span>
                )}
                <span className="zoom-hint" title="Enlarge">
                  ⤢
                </span>
                <div className="meta">
                  <strong>{m.name}</strong>
                  {m.modified ? new Date(m.modified).toLocaleDateString() : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={stack.members}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          selectMode={selectMode}
          isSelected={isSelected}
          onToggleMember={onToggleMember}
        />
      )}
    </div>
  );
}
