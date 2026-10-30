// @ts-check
// The plain payload's binary layout (before sealing): a 4-byte little-endian length N, then N bytes of UTF-8 JSON (the
// index), then the raw bytes of every entry back to back. The index is
//   { version: 1, text: { ... }, entries: [{ key, type, offset, length }] }
// where offset and length are in bytes, counted from the first byte after the JSON. Raw bytes, not base64: a third
// smaller, and nothing has to decode text to get at a file.
// Used by scripts/make-payload.mjs (pack) and the page (unpack); it touches only Uint8Array, DataView and TextEncoder,
// which Node and browsers share.

export const CONTAINER_VERSION = 1;

/**
 * @typedef {{ key: string, type: string, offset: number, length: number }} Entry
 * @typedef {{ version: number, text: Record<string, unknown>, entries: Entry[] }} Index
 * @typedef {{ index: Index, bytes: Record<string, Uint8Array> }} Unpacked
 */

export class ContainerError extends Error {
  /** @param {string} message */
  constructor(message) { super(`container: ${message}`); this.name = 'ContainerError'; }
}

/**
 * @param {Record<string, unknown>} text  plain values only (strings, numbers, nested objects)
 * @param {{ key: string, type: string, bytes: Uint8Array }[]} items  in the order they are written
 * @returns {Uint8Array}
 */
export function pack(text, items) {
  const seen = new Set();
  /** @type {Entry[]} */
  const entries = [];
  let offset = 0;
  for (const it of items) {
    if (typeof it.key !== 'string' || !it.key) throw new ContainerError('every entry needs a key');
    if (seen.has(it.key)) throw new ContainerError(`key ${it.key} appears twice`);
    if (typeof it.type !== 'string' || !it.type) throw new ContainerError(`entry ${it.key} needs a type`);
    if (!(it.bytes instanceof Uint8Array)) throw new ContainerError(`entry ${it.key} is not bytes`);
    seen.add(it.key);
    entries.push({ key: it.key, type: it.type, offset, length: it.bytes.length });
    offset += it.bytes.length;
  }
  const json = new TextEncoder().encode(JSON.stringify({ version: CONTAINER_VERSION, text, entries }));
  const out = new Uint8Array(4 + json.length + offset);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  let at = 4 + json.length;
  for (const it of items) { out.set(it.bytes, at); at += it.bytes.length; }
  return out;
}

/** @param {unknown} n */
const isCount = n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/**
 * Reads a packed payload. Every entry must lie inside the data, with no two entries overlapping, so a truncated or
 * altered file is refused here instead of producing a wrong file later. The returned bytes are views into `buf`.
 * @param {Uint8Array} buf
 * @returns {Unpacked}
 */
export function unpack(buf) {
  if (!(buf instanceof Uint8Array) || buf.length < 4) throw new ContainerError('too short');
  const n = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true);
  if (n === 0 || 4 + n > buf.length) throw new ContainerError('index length out of range');
  /** @type {any} */
  let j;
  try { j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(4, 4 + n))); } catch { throw new ContainerError('index is not JSON'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new ContainerError('index is not an object');
  if (j.version !== CONTAINER_VERSION) throw new ContainerError(`unsupported version ${JSON.stringify(j.version)}`);
  if (!j.text || typeof j.text !== 'object' || Array.isArray(j.text)) throw new ContainerError('text missing');
  if (!Array.isArray(j.entries)) throw new ContainerError('entries missing');
  const data = buf.subarray(4 + n);
  /** @type {Record<string, Uint8Array>} a record with no prototype, so a key such as "__proto__" is an ordinary key */
  const bytes = Object.create(null);
  /** @type {[number, number][]} */
  const spans = [];
  for (const e of j.entries) {
    if (!e || typeof e.key !== 'string' || !e.key || typeof e.type !== 'string' || !e.type) throw new ContainerError('entry without key or type');
    if (Object.hasOwn(bytes, e.key)) throw new ContainerError(`key ${e.key} appears twice`);
    if (!isCount(e.offset) || !isCount(e.length) || e.offset + e.length > data.length) throw new ContainerError(`entry ${e.key} lies outside the data`);
    spans.push([e.offset, e.offset + e.length]);
    bytes[e.key] = data.subarray(e.offset, e.offset + e.length);
  }
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) throw new ContainerError('entries overlap');
  return { index: /** @type {Index} */ (j), bytes };
}
