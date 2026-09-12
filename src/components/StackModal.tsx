import { Stack } from "../image/cluster";

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

export default function StackModal({
  stack,
  onClose,
  selectMode,
  isSelected,
  onToggleMember,
  onSelectAll,
  onClearAll,
}: Props) {
  const selectedCount = selectMode
    ? stack.members.filter((m) => isSelected?.(m.id)).length
    : 0;
  const allSelected = selectedCount === stack.members.length;
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
          {selectMode
            ? "Click photos to pick the ones you want — originals download byte-for-byte."
            : "These photos are grouped as similar. Read-only — nothing is changed on your OneDrive."}
        </p>
        <div className="members">
          {stack.members.map((m) => {
            const sel = selectMode && isSelected?.(m.id);
            return (
              <div
                className={"card" + (sel ? " selected" : "")}
                key={m.id}
                onClick={() => selectMode && onToggleMember?.(m.id)}
                style={selectMode ? { cursor: "pointer" } : undefined}
                title={m.name}
              >
                <img src={m.thumbUrl} alt={m.name} loading="lazy" />
                {selectMode && (
                  <span className={"check" + (sel ? " on" : "")}>{sel ? "✓" : ""}</span>
                )}
                <div className="meta">
                  <strong>{m.name}</strong>
                  {m.modified ? new Date(m.modified).toLocaleDateString() : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
