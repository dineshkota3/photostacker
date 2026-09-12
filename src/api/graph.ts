import { GRAPH_ENDPOINT, loginRequest } from "../authConfig";
import { DriveItem, isImage } from "./types";

async function getToken(instance: any, account: any): Promise<string> {
  const res = await instance.acquireTokenSilent({
    ...loginRequest,
    account,
  });
  return res.accessToken;
}

async function graphFetch(
  url: string,
  token: string,
  init?: RequestInit
): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph ${res.status}: ${text.slice(0, 300)}`);
  }
  // Some endpoints (e.g. thumbnail content) redirect and are fetched separately.
  return res;
}

/** List the children of a drive item, paginated. */
export async function listChildren(
  instance: any,
  account: any,
  driveId: string,
  itemId: string,
  signal?: AbortSignal
): Promise<DriveItem[]> {
  const token = await getToken(instance, account);
  const items: DriveItem[] = [];
  let url: string | null =
    `${GRAPH_ENDPOINT}/drives/${driveId}/items/${itemId}/children` +
    `?$select=id,name,size,lastModifiedDateTime,image,file,folder,parentReference&$top=200`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) throw new Error(`Graph ${res.status} listing children`);
    const json: any = await res.json();
    items.push(...(json.value || []));
    url = json["@odata.nextLink"] || null;
  }
  return items;
}

/** Resolve a OneDrive sharing link into a driveItem (folder or file). */
export async function resolveShareUrl(
  instance: any,
  account: any,
  shareUrl: string,
  signal?: AbortSignal
): Promise<{ driveId: string; itemId: string; item: DriveItem }> {
  const token = await getToken(instance, account);
  // Encode the sharing link per the shares endpoint: "u!" + base64url(link)
  const encoded = "u!" + base64UrlEncode(shareUrl.trim());
  const url = `${GRAPH_ENDPOINT}/shares/${encoded}/driveItem?$select=id,name,folder,parentReference`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(
      `Could not resolve that OneDrive link (${res.status}). Make sure it's shared and you have access.`
    );
  }
  const item: DriveItem = await res.json();
  const driveId = item.parentReference?.driveId;
  if (!driveId || !item.id) throw new Error("Resolved item missing drive/id.");
  return { driveId, itemId: item.id, item };
}

/** Get the user's own OneDrive root (for the optional folder browser). */
export async function getDriveRoot(
  instance: any,
  account: any,
  signal?: AbortSignal
): Promise<{ driveId: string; itemId: string }> {
  const token = await getToken(instance, account);
  const res = await fetch(`${GRAPH_ENDPOINT}/me/drive?$select=id`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error("Could not load your OneDrive.");
  const json = await res.json();
  return { driveId: json.id, itemId: "root" };
}

/** Fetch the raw thumbnail bytes (small) for an image item as an object URL. */
export async function getThumbnailUrl(
  instance: any,
  account: any,
  driveId: string,
  itemId: string
): Promise<string | null> {
  const token = await getToken(instance, account);
  const url = `${GRAPH_ENDPOINT}/drives/${driveId}/items/${itemId}/thumbnails/0/c400x400/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function filterImages(items: DriveItem[]): DriveItem[] {
  return items.filter(isImage);
}

export function filterFolders(items: DriveItem[]): DriveItem[] {
  return items.filter((i) => i.folder);
}

function base64UrlEncode(str: string): string {
  // UTF-8 safe base64url
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export { graphFetch };
