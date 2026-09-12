import { Stack } from "../image/cluster";

interface Props {
  stack: Stack;
  onClose: () => void;
}

export default function StackModal({ stack, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: "center" }}>
          <h3 style={{ flex: 1 }}>
            {stack.members.length} photo{stack.members.length > 1 ? "s" : ""} ·{" "}
            <span className="muted">cohesion {(stack.cohesion * 100).toFixed(0)}%</span>
          </h3>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          These photos are grouped as similar. Read-only — nothing is changed on
          your OneDrive.
        </p>
        <div className="members">
          {stack.members.map((m) => (
            <div className="card" key={m.id}>
              <img src={m.thumbUrl} alt={m.name} loading="lazy" />
              <div className="meta">
                <strong>{m.name}</strong>
                {m.modified
                  ? new Date(m.modified).toLocaleDateString()
                  : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
