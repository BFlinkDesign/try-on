// @ts-check
// Round trip and failure tests for scripts/seal.mjs + src/lib/unseal.js, ported from /home/claude/seal/test-seal.mjs
// (Node's Web Crypto is the same API browsers use). The CLI is run as a separate process, as the build would.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { unseal, keyFromHash, keyFromText } from '../../src/lib/unseal.js';

const SEAL = new URL('../../scripts/seal.mjs', import.meta.url).pathname;
/** @param {...string} a */
const seal = (...a) => { try { return { code: 0, out: execFileSync(process.execPath, [SEAL, ...a], { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { const x = /** @type {any} */ (e); return { code: x.status, out: String(x.stderr) }; } };
/** @param {Buffer} buf */
const ab = buf => /** @type {ArrayBuffer} */ (buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
/** @param {Promise<unknown>} p */
const err = async p => { try { await p; return 'opened'; } catch (e) { return /** @type {Error} */ (e).message; } };

describe('seal / unseal', () => {
  /** @type {string} */ let dir;
  /** @type {Buffer} */ let plain;
  /** @type {string} */ let p;
  /** @type {string} */ let out;
  /** @type {string} */ let keyf;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'seal-'));
    plain = Buffer.concat([Buffer.from('{"files":"'), randomBytes(200000), Buffer.from('"}')]);
    p = join(dir, 'plain'); out = join(dir, 'payload.bin'); keyf = join(dir, 'KEY');
    writeFileSync(p, plain);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('stops when the key file is missing (and writes nothing)', () => {
    const r = seal(p, out, keyf);
    expect(r.code).toBe(1); expect(r.out).toMatch(/STOP: no key file/); expect(existsSync(keyf)).toBe(false); expect(existsSync(out)).toBe(false);
  });

  it('round-trips, hides the plain bytes and the key, reuses the key, new IV each build, and names every failure', async () => {
    expect(seal(p, out, keyf, '--new-key').code).toBe(0);
    const key = readFileSync(keyf, 'utf8').trim(), sealed = readFileSync(out);
    expect(Buffer.compare(Buffer.from(await unseal(ab(sealed), key)), plain)).toBe(0);
    let leak = false;   // no 32-byte window of the plain payload appears in the sealed file
    for (let i = 0; i + 32 <= plain.length && !leak; i += 997) if (sealed.includes(plain.subarray(i, i + 32))) leak = true;
    expect(leak).toBe(false);
    expect(sealed.includes(Buffer.from(key, 'base64url')) || sealed.includes(Buffer.from(key))).toBe(false);

    expect(seal(p, out, keyf).code).toBe(0);   // reseal: same key reused, new IV
    const sealed2 = readFileSync(out);
    expect(readFileSync(keyf, 'utf8').trim()).toBe(key);
    expect(Buffer.compare(sealed.subarray(12, 24), sealed2.subarray(12, 24))).not.toBe(0);

    expect(await err(unseal(ab(sealed2), randomBytes(32).toString('base64url')))).toBe('wrongkey');
    const bad = Buffer.from(sealed2); bad[100] ^= 1;
    expect(await err(unseal(ab(bad), key))).toBe('damaged');
    const badHdr = Buffer.from(sealed2); badHdr[13] ^= 1;   // the IV is in the authenticated header
    expect(await err(unseal(ab(badHdr), key))).toBe('damaged');
    expect(await err(unseal(ab(sealed2.subarray(0, sealed2.length - 5)), key))).toBe('damaged');   // cut short
    expect(await err(unseal(new Uint8Array(64).buffer, key))).toBe('format');
    expect(await err(unseal(ab(Buffer.concat([Buffer.from('TRY1'), sealed2.subarray(4)])), key))).toBe('format');
    expect(await err(unseal(ab(sealed2), 'short'))).toBe('key');

    expect(seal(p, out, keyf, '--new-key').code).toBe(0);
    expect(readFileSync(keyf, 'utf8').trim()).not.toBe(key);
  });

  it('refuses a key file that does not hold 256 bits', () => {
    writeFileSync(join(dir, 'SHORT'), 'abc\n');
    const r = seal(p, out, join(dir, 'SHORT'));
    expect(r.code).toBe(1); expect(r.out).toMatch(/does not hold a 256-bit key/);
  });
});

describe('keyFromHash / keyFromText', () => {
  const key = randomBytes(32).toString('base64url');
  it('reads the key from the fragment, alone or among other flags', () => {
    expect(keyFromHash('#k=' + key)).toBe(key); expect(keyFromHash('#x=1&k=' + key)).toBe(key); expect(keyFromHash(`#k=${key}&check`)).toBe(key);
    expect(keyFromHash('#k=' + key + 'x')).toBeNull(); expect(keyFromHash('')).toBeNull(); expect(keyFromHash('#k=short')).toBeNull();
  });
  it('reads a pasted whole link or a bare key, and nothing else', () => {
    expect(keyFromText(` https://bflinkdesign.github.io/try-on/#k=${key} `)).toBe(key);
    expect(keyFromText(`https://bflinkdesign.github.io/try-on/#k=${key}&check`)).toBe(key);
    expect(keyFromText(key)).toBe(key); expect(keyFromText('hello')).toBeNull(); expect(keyFromText('https://bflinkdesign.github.io/try-on/')).toBeNull();
  });
});
