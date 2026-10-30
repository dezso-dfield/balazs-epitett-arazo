import { del, get, put } from '@vercel/blob';

/**
 * Tartós tárolás Vercelen (privát Vercel Blob): az adatfájl és a feltöltött képek.
 * Helyi fejlesztésben nincs használatban, ott a data/db.json és a public/uploads marad.
 */
export const blobEnabled = (): boolean =>
  Boolean(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);

const DB_PATHNAME = 'data/db.json';

async function readText(pathname: string): Promise<string | null> {
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return await new Response(res.stream).text();
}

export async function readDbFromBlob(): Promise<unknown | null> {
  const text = await readText(DB_PATHNAME);
  return text ? JSON.parse(text) : null;
}

export async function writeDbToBlob(serialized: string): Promise<void> {
  await put(DB_PATHNAME, serialized, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

/** Feltöltött kép mentése; a visszaadott útvonalon az /api/media route szolgálja ki */
export async function writeUploadToBlob(filename: string, data: Buffer, contentType: string): Promise<string> {
  await put(`uploads/${filename}`, data, { access: 'private', addRandomSuffix: false, contentType });
  return `/api/media/${encodeURIComponent(filename)}`;
}

export async function readUploadFromBlob(
  filename: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await get(`uploads/${filename}`, { access: 'private' });
  if (!res || res.statusCode !== 200) return null;
  const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
  return { bytes, contentType: res.headers.get('content-type') || 'image/jpeg' };
}

export async function deleteUploadFromBlob(filename: string): Promise<void> {
  await del(`uploads/${filename}`);
}
