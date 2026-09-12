import { Stack } from "../image/cluster";

interface Props {
  stack: Stack;
  onOpen: () => void;
  /** Number of this stack's members selected for download (select mode). */
  selectedCount?: number;
}

function fmtSize(bytes?: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function StackCard({ stack, onOpen, selectedCount = 0 }: Props) {
  const cover = stack.members[0];
  const count = stack.members.length;
  return (
    <div
      className={"card" + (selectedCount > 0 ? " selected" : "")}
      onClick={onOpen}
      style={{ cursor: "pointer" }}
      title="Open to select individual photos"
    >
      <img src={cover.thumbUrl} alt={cover.name} loading="lazy" />
      <span className="count">{count}</span>
      {selectedCount > 0 && (
        <span
          className="count"
          style={{ left: 8, right: "auto", background: "var(--accent)" }}
          title="Selected for download"
        >
          ✓ {selectedCount}/{count}
        </span>
      )}
      {cover.persons !== undefined && selectedCount === 0 && (
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
