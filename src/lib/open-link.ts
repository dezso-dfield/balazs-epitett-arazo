import crypto from 'crypto';

/**
 * Rövid ideig érvényes, aláírt letöltési link egy ajánlat Word (.docx) változatához, hogy a Word asztali alkalmazás
 * (ms-word: protokoll) bejelentkezés nélkül megnyithassa. Csak az adott ajánlathoz és csak a lejáratig jó.
 */
// titok: saját változó, vagy a csak szerveren elérhető tároló token (a forráskódban lévő érték csak helyi fejlesztésnél)
const SECRET = () => process.env.OPEN_LINK_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'local-dev-open-link-secret';

export function signOpenLink(id: string, exp: number): string {
  return crypto.createHmac('sha256', SECRET()).update(`${id}.${exp}`).digest('hex').slice(0, 32);
}

export function verifyOpenLink(id: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const want = signOpenLink(id, e);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
