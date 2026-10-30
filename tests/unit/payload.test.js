// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readPayload, fetchSealed, openSealed, PayloadError, PAYLOAD_VERSION } from '../../src/payload.js';
import { pack, unpack } from '../../src/lib/container.js';
import { FILE_KEYS, FILE_TYPES, MIME } from '../../src/lib/files.js';
import { SYNTHETIC_TEXT } from '../../scripts/lib/synthetic.mjs';
import { sealBytes } from '../../scripts/seal.mjs';

/** @param {Record<string, any>} [textOver] @param {(items: any[]) => any[]} [itemsOver] */
const container = (textOver = {}, itemsOver = x => x) => pack({ version: PAYLOAD_VERSION, ...structuredClone(SYNTHETIC_TEXT), ...textOver }, itemsOver([
  { key: 'sample', type: 'image/jpeg', bytes: Uint8Array.of(0xff, 0xd8, 0xff, 0) },
  { key: 'art', type: 'image/svg+xml', bytes: new TextEncoder().encode('<svg/>') },
  ...FILE_KEYS.map(k => ({ key: `file/${k}`, type: MIME[FILE_TYPES[k]], bytes: new TextEncoder().encode(k) })),
]));
/** @param {Uint8Array} b */
const ab = b => /** @type {ArrayBuffer} */ (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

describe('readPayload', () => {
  it('turns the container into data URLs, base64 per button and the private text', () => {
    const p = readPayload(unpack(container()));
    expect(p.sample).toBe('data:image/jpeg;base64,/9j/AA==');
    expect(p.art).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`);
    expect(Object.keys(p.files)).toEqual(FILE_KEYS);
    expect(Buffer.from(p.files.sheet, 'base64').toString()).toBe('sheet');
    expect(p.text.fileNames).toEqual(SYNTHETIC_TEXT.fileNames);
    expect(p.text.designWidthIn).toBe(6);
    expect(p.text.guideSheet).toBe(SYNTHETIC_TEXT.guideSheet);
  });
  /** @type {[string, () => Uint8Array, RegExp][]} */
  const cases = [
    ['text of another version', () => container({ version: 2 }), /unsupported text version 2/],
    ['sample missing', () => container({}, it => it.filter(i => i.key !== 'sample')), /sample missing/],
    ['sample not a JPEG', () => container({}, it => it.map(i => i.key === 'sample' ? { ...i, type: 'image/png' } : i)), /sample missing or not image\/jpeg/],
    ['art empty', () => container({}, it => it.map(i => i.key === 'art' ? { ...i, bytes: new Uint8Array(0) } : i)), /art missing/],
    ['one file missing', () => container({}, it => it.filter(i => i.key !== 'file/stencil')), /file\/stencil missing/],
    ['a file of the wrong type', () => container({}, it => it.map(i => i.key === 'file/sheet' ? { ...i, type: 'image/png' } : i)), /file\/sheet missing or not application\/pdf/],
    ['an unsafe preview prefix', () => container({ previewPrefix: '../x' }), /previewPrefix/],
    ['a file name of the wrong type', () => container({ fileNames: { ...SYNTHETIC_TEXT.fileNames, png: 'a.pdf' } }), /fileNames\.png not a \.png/],
    ['a file name with a path', () => container({ fileNames: { ...SYNTHETIC_TEXT.fileNames, pdf: 'a/b.pdf' } }), /fileNames\.pdf/],
    ['two files with one name', () => container({ fileNames: { ...SYNTHETIC_TEXT.fileNames, sheet: SYNTHETIC_TEXT.fileNames.pdf } }), /repeat/],
    ['no design size', () => container({ designWidthIn: 0 }), /designWidthIn/],
    ['a note missing', () => container({ fileNotes: { stencil: 'x' } }), /fileNotes\.orig/],
    ['no guide sentence', () => container({ guideSheet: ' ' }), /guideSheet/],
  ];
  it.each(cases)('refuses %s', (_name, make, msg) => {
    let err;
    try { readPayload(unpack(make())); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PayloadError);
    expect(/** @type {PayloadError} */ (err).code).toBe('shape');
    expect(/** @type {PayloadError} */ (err).message).toMatch(msg);
  });
});

describe('openSealed', () => {
  const key = randomBytes(32), other = randomBytes(32), plain = container();
  const sealed = ab(sealBytes(plain, key)), k = key.toString('base64url'), o = other.toString('base64url');
  /** @param {ArrayBuffer} s @param {{ key: string, source: any }[]} keys */
  const code = async (s, keys) => { try { await openSealed(s, keys); return 'opened'; } catch (e) { return /** @type {PayloadError} */ (e).code; } };

  it('opens with the right key and says which key it was', async () => {
    const r = await openSealed(sealed, [{ key: k, source: 'link' }]);
    expect(r.source).toBe('link'); expect(r.key).toBe(k); expect(r.payload.text.previewPrefix).toBe('synthetic-tryon');
  });
  it('tries the kept key when the link\'s key is an old one', async () => {
    const r = await openSealed(sealed, [{ key: o, source: 'link' }, { key: k, source: 'stored' }]);
    expect(r.source).toBe('stored');
  });
  it('reports the first key\'s problem when no key opens it', async () => {
    expect(await code(sealed, [{ key: o, source: 'link' }, { key: 'short', source: 'stored' }])).toBe('wrongkey');
    expect(await code(sealed, [{ key: 'short', source: 'link' }, { key: o, source: 'stored' }])).toBe('key');
  });
  it('names a damaged file, a non-payload, and no key at all', async () => {
    const bad = new Uint8Array(sealed.slice(0)); bad[60] ^= 1;
    expect(await code(bad.buffer, [{ key: k, source: 'link' }])).toBe('damaged');
    expect(await code(new Uint8Array(64).buffer, [{ key: k, source: 'link' }])).toBe('format');
    expect(await code(sealed, [])).toBe('nokey');
  });
  it('calls an unsealed file that is not a container a shape problem', async () => {
    expect(await code(ab(sealBytes(Uint8Array.of(1, 2, 3, 4, 5), key)), [{ key: k, source: 'link' }])).toBe('shape');
  });
});

describe('fetchSealed', () => {
  /** @param {number} status @param {ArrayBuffer | Error} [body] */
  const response = (status, body = new ArrayBuffer(4)) => /** @type {Response} */ (/** @type {unknown} */ ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => { if (body instanceof Error) throw body; return body; } }));
  const opts = (/** @type {any} */ fetchImpl, /** @type {(ms: number) => Promise<unknown>} */ sleep = async () => {}) => ({ url: 'http://x/payload.bin', fetchImpl, sleep, random: () => 0.5 });

  it('fetches once, revalidating the cache, and returns the bytes', async () => {
    const body = Uint8Array.of(9, 8, 7).buffer, f = vi.fn(async () => response(200, body));
    expect(await fetchSealed(opts(f))).toBe(body);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = /** @type {any} */ (f.mock.calls[0]);
    expect(url).toBe('http://x/payload.bin'); expect(init.cache).toBe('no-cache'); expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('retries network errors and 5xx with exponential backoff plus jitter, then succeeds', async () => {
    const answers = [() => { throw new TypeError('Failed to fetch'); }, () => response(503), () => response(200)];
    const f = vi.fn(async () => /** @type {() => Response} */ (answers.shift())());
    const sleep = vi.fn(async () => {});
    await fetchSealed({ ...opts(f, sleep), baseDelayMs: 400 });
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(c => /** @type {any} */ (c)[0])).toEqual([400 + 0.5 * 400 * 0.5, 800 + 0.5 * 800 * 0.5]);
  });
  it('gives up after the last attempt with the last error', async () => {
    const f = vi.fn(async () => response(502));
    await expect(fetchSealed({ ...opts(f), attempts: 3 })).rejects.toMatchObject({ name: 'PayloadError', code: 'http', message: 'payload: HTTP 502' });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it.each([[404], [403], [400]])('does not retry HTTP %i', async status => {
    const f = vi.fn(async () => response(status));
    await expect(fetchSealed(opts(f))).rejects.toMatchObject({ code: 'http', retryable: false });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([[408], [429], [500]])('retries HTTP %i', async status => {
    const f = vi.fn(async () => response(status));
    await expect(fetchSealed({ ...opts(f), attempts: 2 })).rejects.toMatchObject({ code: 'http', retryable: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('treats a body cut off on the way as a network error, and retries it', async () => {
    const f = vi.fn(async () => response(200, new TypeError('network error')));
    await expect(fetchSealed({ ...opts(f), attempts: 2 })).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('reports a timeout as a timeout, and retries it', async () => {
    const f = vi.fn(async () => { throw new DOMException('signal timed out', 'TimeoutError'); });
    await expect(fetchSealed({ ...opts(f), attempts: 2 })).rejects.toMatchObject({ code: 'timeout', retryable: true, message: 'payload: timed out' });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('keeps the underlying error as the cause', async () => {
    const boom = new TypeError('Failed to fetch');
    const f = vi.fn(async () => { throw boom; });
    await expect(fetchSealed({ ...opts(f), attempts: 1 })).rejects.toMatchObject({ code: 'network', cause: boom });
  });
  it('really times out a fetch that never answers', async () => {
    /** @type {any} */
    const hang = (/** @type {string} */ _u, /** @type {RequestInit} */ init) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(init.signal?.reason)));
    await expect(fetchSealed({ ...opts(hang), attempts: 1, timeoutMs: 30 })).rejects.toMatchObject({ code: 'timeout' });
  });
});
