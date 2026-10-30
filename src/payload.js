// @ts-check
// The page's heavy and private data (sample photo, design, six package files, and every personal word the page shows)
// arrives as one sealed file, payload.bin, fetched once at start. openPayload() is the only reader: it fetches the file
// (retrying transient failures), unseals it with the key from the link or the one kept on this device (AES-256-GCM,
// src/lib/unseal.js), unpacks the binary container (src/lib/container.js) and checks every part before the page sees it.
import { FILE_KEYS, FILE_TYPES, MIME, bytesB64, nameFits } from './lib/files.js';
import { unpack } from './lib/container.js';
import { unseal } from './lib/unseal.js';

/** @typedef {import('./lib/files.js').FileKey} FileKey */
/**
 * @typedef {object} PayloadText  private wording, kept out of the page's public files
 * @property {string} previewPrefix  start of a saved picture's file name
 * @property {string} designTitle    the design's name (alt text of the design on the photo)
 * @property {number} designWidthIn  the design's real size, inches
 * @property {number} designHeightIn
 * @property {Record<FileKey, string>} fileNames  what each package file is saved as
 * @property {{ stencil: string, orig: string }} fileNotes  the notes under the two "only if the artist asks" files
 * @property {string} guideSheet     the sentence about the artist sheet in the shop guide
 */
/**
 * @typedef {object} Payload
 * @property {string} sample  data URL of the sample arm photo (JPEG)
 * @property {string} art     data URL of the preview design (SVG)
 * @property {Record<FileKey, string>} files  base64 of each package file, byte for byte
 * @property {PayloadText} text
 */
/**
 * @typedef {'http' | 'network' | 'timeout' | 'format' | 'key' | 'wrongkey' | 'damaged' | 'shape' | 'nokey'} PayloadCode
 * @typedef {'link' | 'stored' | 'pasted'} KeySource
 */

export class PayloadError extends Error {
  /**
   * @param {PayloadCode} code
   * @param {string} message
   * @param {{ cause?: unknown, retryable?: boolean }} [o]
   */
  constructor(code, message, o = {}) {
    super(message, o.cause === undefined ? undefined : { cause: o.cause });
    this.name = 'PayloadError';
    this.code = code;
    this.retryable = !!o.retryable;
  }
}

export const PAYLOAD_VERSION = 1;
const SAFE_PREFIX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/;

/**
 * Checks an unpacked container and turns it into what the page uses. Throws PayloadError('shape') on anything
 * unexpected, naming the first bad field, so a wrong file never reaches the page half-read.
 * @param {import('./lib/container.js').Unpacked} u
 * @returns {Payload}
 */
export function readPayload(u) {
  /** @param {string} what */
  const bad = what => new PayloadError('shape', `payload: ${what}`);
  const { index, bytes } = u, types = Object.fromEntries(index.entries.map(e => [e.key, e.type]));
  /** @param {string} key @param {string} type */
  const part = (key, type) => {
    const b = bytes[key];
    if (!b || !b.length || types[key] !== type) throw bad(`${key} missing or not ${type}`);
    return b;
  };
  const sample = `data:image/jpeg;base64,${bytesB64(part('sample', 'image/jpeg'))}`;
  const art = `data:image/svg+xml;base64,${bytesB64(part('art', 'image/svg+xml'))}`;
  /** @type {Partial<Record<FileKey, string>>} */
  const files = {};
  for (const key of FILE_KEYS) files[key] = bytesB64(part(`file/${key}`, MIME[FILE_TYPES[key]]));

  const t = /** @type {Record<string, any>} */ (index.text);
  /** @param {unknown} v @param {string} name */
  const str = (v, name) => { if (typeof v !== 'string' || !v.trim() || v.length > 400) throw bad(`text ${name} missing`); return v; };
  /** @param {unknown} v @param {string} name */
  const inches = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 48) throw bad(`text ${name} not a size in inches`); return v; };
  if (t.version !== PAYLOAD_VERSION) throw bad(`unsupported text version ${JSON.stringify(t.version)}`);
  if (typeof t.previewPrefix !== 'string' || !SAFE_PREFIX.test(t.previewPrefix)) throw bad('text previewPrefix not a safe file name start');
  if (!t.fileNames || typeof t.fileNames !== 'object') throw bad('text fileNames missing');
  /** @type {Partial<Record<FileKey, string>>} */
  const fileNames = {};
  for (const key of FILE_KEYS) {
    const n = t.fileNames[key];
    if (!nameFits(key, n)) throw bad(`text fileNames.${key} not a .${FILE_TYPES[key]} file name`);
    fileNames[key] = n;
  }
  if (new Set(Object.values(fileNames)).size !== FILE_KEYS.length) throw bad('text fileNames repeat a name');
  const notes = t.fileNotes && typeof t.fileNotes === 'object' ? t.fileNotes : {};
  const text = {
    previewPrefix: t.previewPrefix,
    designTitle: str(t.designTitle, 'designTitle'),
    designWidthIn: inches(t.designWidthIn, 'designWidthIn'),
    designHeightIn: inches(t.designHeightIn, 'designHeightIn'),
    fileNames: /** @type {Record<FileKey, string>} */ (fileNames),
    fileNotes: { stencil: str(notes.stencil, 'fileNotes.stencil'), orig: str(notes.orig, 'fileNotes.orig') },
    guideSheet: str(t.guideSheet, 'guideSheet'),
  };
  return { sample, art, files: /** @type {Record<FileKey, string>} */ (files), text };
}

/**
 * One attempt to fetch the sealed bytes. Network failures, timeouts and 5xx/408/429 answers are retryable.
 * @param {string} url @param {typeof fetch} fetchImpl @param {number} timeoutMs @returns {Promise<ArrayBuffer>}
 */
async function fetchOnce(url, fetchImpl, timeoutMs) {
  /** @param {unknown} e */
  const lost = e => {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return new PayloadError(timedOut ? 'timeout' : 'network', timedOut ? 'payload: timed out' : 'payload: network error', { cause: e, retryable: true });
  };
  let res;
  try { res = await fetchImpl(url, { cache: 'no-cache', signal: AbortSignal.timeout(timeoutMs) }); } catch (e) { throw lost(e); }
  if (!res.ok) throw new PayloadError('http', `payload: HTTP ${res.status}`, { retryable: res.status >= 500 || res.status === 408 || res.status === 429 });
  try { return await res.arrayBuffer(); } catch (e) { throw lost(e); }   // the body was cut off on the way
}

/** @param {number} ms */
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Fetches the sealed file, retrying transient failures with exponential backoff and jitter.
 * @param {object} [o]
 * @param {string} [o.url]           defaults to payload.bin next to the page
 * @param {typeof fetch} [o.fetchImpl]
 * @param {number} [o.attempts]      total tries (default 3)
 * @param {number} [o.baseDelayMs]   first backoff (default 400 ms), doubled each retry, plus up to 50% jitter
 * @param {number} [o.timeoutMs]     per try (default 60 s: a slow phone connection needs time for about 1.3 MB)
 * @param {(ms: number) => Promise<unknown>} [o.sleep]
 * @param {() => number} [o.random]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchSealed(o = {}) {
  const url = o.url ?? new URL('payload.bin', document.baseURI).href;
  const fetchImpl = o.fetchImpl ?? fetch, attempts = o.attempts ?? 3, base = o.baseDelayMs ?? 400;
  const timeoutMs = o.timeoutMs ?? 60000, sleep = o.sleep ?? wait, random = o.random ?? Math.random;
  for (let i = 1; ; i++) {
    try {
      return await fetchOnce(url, fetchImpl, timeoutMs);
    } catch (e) {
      const retryable = e instanceof PayloadError && e.retryable;
      if (!retryable || i >= attempts) throw e;
      const delay = base * 2 ** (i - 1);
      await sleep(delay + random() * delay * 0.5);
    }
  }
}

/**
 * Unseals and checks the payload with the first key that opens it. Keys are tried in the order given (the link's key,
 * then the one kept on this device); a key that is malformed or is not this payload's key moves on to the next. When
 * none opens it, the first key's error is thrown, so an old link is reported as an old link.
 * @param {ArrayBuffer} sealed
 * @param {{ key: string, source: KeySource }[]} keys
 * @returns {Promise<{ payload: Payload, key: string, source: KeySource }>}
 */
export async function openSealed(sealed, keys) {
  if (!keys.length) throw new PayloadError('nokey', 'payload: no key');
  /** @type {PayloadError | null} */
  let first = null;
  for (const k of keys) {
    /** @type {Uint8Array} */
    let plain;
    try { plain = await unseal(sealed, k.key); } catch (e) {
      const code = /** @type {PayloadCode} */ (e instanceof Error && ['format', 'key', 'wrongkey', 'damaged'].includes(e.message) ? e.message : 'damaged');
      const err = new PayloadError(code, `payload: ${code}`, { cause: e });
      if (code === 'format' || code === 'damaged') throw err;   // the file itself is bad; another key cannot help
      first ??= err;
      continue;
    }
    /** @type {import('./lib/container.js').Unpacked} */
    let u;
    try { u = unpack(plain); } catch (e) { throw new PayloadError('shape', `payload: ${/** @type {Error} */ (e).message}`, { cause: e }); }
    return { payload: readPayload(u), key: k.key, source: k.source };
  }
  throw /** @type {PayloadError} */ (first);
}
