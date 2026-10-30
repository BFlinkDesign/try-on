// @ts-check
// Opens the locked payload in the browser with the key from the link (Web Crypto, AES-256-GCM).
// The key is read from the part of the URL after '#', which browsers never send to a server.
// Errors are distinct so the page can say the right thing:
//   'format'   not a sealed payload (an old or broken download)
//   'key'      the text in the link is not a key at all
//   'wrongkey' a real key, but not the one this page was locked with (an old link)
//   'damaged'  the right key, but the file was altered or cut short
// Adopted unchanged in behavior from the tested /home/claude/seal/unseal.js (types tightened for the checker).

const KEY_RE = /(?:^#|&)k=([A-Za-z0-9_-]{43})(?=&|$)/;

/** @param {string} hash location.hash, for example "#k=abc..." @returns {string|null} the key, base64url, or null */
export function keyFromHash(hash) {
  const m = KEY_RE.exec(hash || '');
  return m ? m[1] : null;
}

/** @param {string} text pasted text: a whole link or just the key @returns {string|null} */
export function keyFromText(text) {
  const t = (text || '').trim();
  const i = t.indexOf('#');
  if (i >= 0) return keyFromHash(t.slice(i));
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}

/** @param {string} s base64url text @returns {Uint8Array<ArrayBuffer>} */
export function fromBase64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {ArrayBuffer} sealed @param {string} keyText base64url, 43 characters @returns {Promise<Uint8Array<ArrayBuffer>>} */
export async function unseal(sealed, keyText) {
  const b = new Uint8Array(sealed);
  if (b.length < 40 || b[0] !== 0x54 || b[1] !== 0x52 || b[2] !== 0x59 || b[3] !== 0x32) throw new Error('format');   // "TRY2"
  let raw;
  try { raw = fromBase64url(keyText); } catch { throw new Error('key'); }
  if (raw.length !== 32) throw new Error('key');
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256', raw)).slice(0, 8);
  if (id.some((v, i) => v !== b[4 + i])) throw new Error('wrongkey');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(12, 24), additionalData: b.slice(0, 24) }, key, b.slice(24)));
  } catch { throw new Error('damaged'); }
}
