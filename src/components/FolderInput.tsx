import { useState } from "react";

interface Props {
  onScan: (shareUrl: string) => void;
  loading: boolean;
}

export default function FolderInput({ onScan, loading }: Props) {
  const [url, setUrl] = useState("");

  return (
    <div className="panel">
      <label htmlFor="url">OneDrive folder link</label>
      <div className="row">
        <input
          id="url"
          type="text"
          placeholder="Paste a OneDrive shared folder link (https://1drv.ms/...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button
          onClick={() => onScan(url)}
          disabled={loading || !url.trim()}
        >
          {loading ? "Scanning…" : "Scan & stack"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Tip: in OneDrive on the web, open the folder → “Get link” → copy. The link
        must be shared (“Anyone with the link can view”, or shared with your
        account). Only images in this folder are scanned.
      </p>
    </div>
  );
}
