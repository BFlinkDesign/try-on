// @ts-check
// The files the page offers, and file-name helpers. Shared by the page and scripts/make-payload.mjs.
// The names she saves the files under come from the sealed payload's text (they are private); this module knows only
// the six roles and the type each one must be.

/** Each role's file type. Keys are the page's button keys (data-f). */
export const FILE_TYPES = Object.freeze({ pdf: 'pdf', png: 'png', svg: 'svg', sheet: 'pdf', stencil: 'pdf', orig: 'png' });

/** @typedef {keyof typeof FILE_TYPES} FileKey */

/** @type {FileKey[]} */
export const FILE_KEYS = /** @type {FileKey[]} */ (Object.keys(FILE_TYPES));

/**
 * Lower-case text after the last dot (the whole name when there is no dot).
 * @param {string} name
 * @returns {string}
 */
export const extOf = name => /** @type {string} */ (name.split('.').pop()).toLowerCase();

/** @type {Readonly<Record<string, string>>} */
export const MIME = Object.freeze({ pdf: 'application/pdf', png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg' });

/**
 * @param {string} name
 * @returns {string}
 */
export const mimeOf = name => MIME[extOf(name)] || 'application/octet-stream';

/** A safe file name: letters, digits, dot, dash and underscore, one dot before an extension, nothing hidden. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*\.[a-z0-9]+$/;

/**
 * True when `name` is a file name the page may offer for `key`: safe characters and the role's extension.
 * @param {FileKey} key @param {unknown} name @returns {name is string}
 */
export const nameFits = (key, name) => typeof name === 'string' && name.length <= 120 && SAFE_NAME.test(name) && extOf(name) === FILE_TYPES[key];

/**
 * Base64 text to bytes.
 * @param {string} b64
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function b64Bytes(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/**
 * Bytes to base64 text, in slices so a large file does not overflow the call stack.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, /** @type {number[]} */ (/** @type {unknown} */ (bytes.subarray(i, i + 0x8000))));
  return btoa(s);
}

/**
 * File name for a saved preview picture, in local time: <prefix>-preview-YYYY-MM-DD-HHMM.jpg
 * @param {string} prefix  from the payload's text
 * @param {Date} d
 * @returns {string}
 */
export function previewName(prefix, d) {
  /** @param {number} n */
  const p2 = n => String(n).padStart(2, '0');
  return `${prefix}-preview-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.jpg`;
}
