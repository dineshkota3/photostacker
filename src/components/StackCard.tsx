import { Stack } from "../image/cluster";

interface Props {
  stack: Stack;
  onOpen: () => void;
}

function fmtSize(bytes?: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function StackCard({ stack, onOpen }: Props) {
  const cover = stack.members[0];
  const count = stack.members.length;
  return (
    <div className="card" onClick={onOpen} style={{ cursor: "pointer" }}>
      <img src={cover.thumbUrl} alt={cover.name} loading="lazy" />
      <span className="count">{count}</span>
      {cover.persons !== undefined && (
        <span
          className="count"
          style={{ left: 8, right: "auto" }}
          title={cover.persons > 0 ? "People detected" : "No people"}
        >
          {cover.persons > 0 ? `👤×${cover.persons}` : "👤–"}
        </span>
      )}
      <div className="meta">
        <strong>{count > 1 ? `${count} similar` : cover.name}</strong>
        {count > 1
          ? `${stack.members.map((m) => m.name).join(", ").slice(0, 60)}…`
          : fmtSize(cover.size)}
      </div>
    </div>
  );
}
