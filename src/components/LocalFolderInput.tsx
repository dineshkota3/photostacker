import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (files: File[], skippedCount?: number) => void;
  loading: boolean;
  disabled?: boolean;
}

const IMAGE_TYPE = /^image\//;
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i;

function isImageFile(f: File): boolean {
  return IMAGE_TYPE.test(f.type) || IMAGE_NAME.test(f.name);
}

export default function LocalFolderInput({ onScan, loading, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderName, setFolderName] = useState("");

  // webkitdirectory isn't in React's typings; set it via ref so the picker
  // selects a whole folder instead of individual files.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.setAttribute("directory", "");
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files || []);
    const files = all.filter(isImageFile);
    if (files.length === 0) return;
    setFolderName(all[0]?.webkitRelativePath?.split("/")[0] || "folder");
    // The browser's picker counts every file (videos, etc.) — report how
    // many non-photos were skipped so the numbers make sense to the user.
    onScan(files, all.length - files.length);
  };

  return (
    <div className="panel">
      <label>Local folder (no sign-in needed)</label>
      <div className="row">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading || disabled}
        >
          {loading ? "Scanning…" : "Choose a folder & scan"}
        </button>
        {folderName && (
          <span className="muted" style={{ padding: "10px 4px" }}>
            {folderName}
          </span>
        )}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        100% local and read-only. Pick the photos you like from each stack —
        keep one or a few instead of all the similar ones, then download the
        originals at full quality.
      </p>
      {/* webkitdirectory isn't in React's typings; set it via ref */}
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </div>
  );
}
