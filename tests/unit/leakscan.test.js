// @ts-check
// Proves the leak scan finds each way private content could slip into a published folder, and passes a clean one.
// Ported from /home/claude/seal/test-leakscan.mjs; the private files here are the synthetic payload's (made up, so this
// test can run anywhere). The real files are scanned by `npm run build:real`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { scan, DEFAULT_PHRASES } from '../../scripts/leakscan.mjs';
import { syntheticSet } from '../../scripts/lib/synthetic.mjs';

/** @type {string} */ let privDir;
/** @type {[string, Buffer][]} */ let privates;
const key = randomBytes(32).toString('base64url');

beforeAll(() => {
  privDir = mkdtempSync(join(tmpdir(), 'leak-priv-'));
  const s = syntheticSet();
  privates = [['sample.jpg', s.sample], ['art.svg', s.art], ...Object.entries(s.files).map(([k, b]) => /** @type {[string, Buffer]} */ ([`${k}.bin`, b]))];
  for (const [n, b] of privates) writeFileSync(join(privDir, n), b);
});
afterAll(() => rmSync(privDir, { recursive: true, force: true }));

const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), 'leak-')); mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'index.html'), '<!doctype html><title>Try-on</title><p>Open the full link you were sent.</p>');
  writeFileSync(join(d, 'assets', 'app.js'), 'console.log("hello")'); writeFileSync(join(d, 'payload.bin'), randomBytes(100000));
  return d;
};
/** @param {string} d */
const PHRASES = ['zephyrine', 'quasar', 'gloaming-look'];   // made-up words standing in for the private list
const run = /** @param {string} d */ d => scan(d, privates.map(([n]) => join(privDir, n)), { keyText: key, phrases: PHRASES });

describe('leakscan', () => {
  it('passes a clean folder', () => {
    const d = fresh();
    try { expect(run(d)).toEqual([]); } finally { rmSync(d, { recursive: true, force: true }); }
  });

  /** @returns {[string, Buffer][]} */
  const plants = () => {
    /** @type {[string, Buffer][]} */
    const out = [];
    for (const [name, buf] of privates) {
      out.push([`raw ${name}`, buf]);
      out.push([`base64 ${name} inside JSON`, Buffer.from(JSON.stringify({ x: 'ab', data: buf.toString('base64') }))]);
      out.push([`base64 ${name} one byte offset`, Buffer.from(Buffer.concat([Buffer.from([7]), buf]).toString('base64'))]);
      out.push([`base64url ${name}`, Buffer.from(buf.toString('base64url'))]);
      out.push([`hex ${name}`, Buffer.from(buf.subarray(0, 4096).toString('hex'))]);
      out.push([`data URI ${name}`, Buffer.from(`const u = "data:application/octet-stream;base64,${buf.toString('base64')}";`)]);
      out.push([`a middle piece of ${name}`, buf.subarray(Math.floor(buf.length / 3), Math.floor(buf.length / 3) + 200)]);
    }
    out.push(['phrase in markup', Buffer.from('<p>This is the Zephyrine handwriting.</p>')]);
    out.push(['phrase URL-encoded', Buffer.from('a?x=To%20the%20quasar')]);
    out.push(['file name in code', Buffer.from('const n = "x-2-gloaming-look-6in.pdf";')]);
    out.push(['key text', Buffer.from(`location.hash="#k=${key}"`)]);
    out.push(['key raw bytes', Buffer.concat([Buffer.from('xx'), Buffer.from(key, 'base64url'), Buffer.from('yy')])]);
    return out;
  };
  it('finds every planted copy: raw, base64, base64url, hex, data URI, a partial piece, a phrase, the key', () => {
    /** @type {string[]} */
    const missed = [];
    for (const [what, bytes] of plants()) {
      const d = fresh();
      try { writeFileSync(join(d, 'assets', 'planted.js'), bytes); if (!run(d).length) missed.push(what); } finally { rmSync(d, { recursive: true, force: true }); }
    }
    expect(missed).toEqual([]);
  });

  it('ships no phrase list in public code (the real list is private)', () => {
    expect(DEFAULT_PHRASES).toEqual([]);
  });

  it('does not report boilerplate that public files share, but still reports the rest of a private file', () => {
    const d = fresh();
    try {
      const header = '<svg xmlns="http://www.w3.org/2000/svg" ', secret = 'PRIVATE-PATH d="M1 2 C3 4 5 6 7 8 Z" q9w8e7r6t5y4';
      writeFileSync(join(privDir, 'p.svg'), header + secret); writeFileSync(join(privDir, 'pub.svg'), header + 'public');
      writeFileSync(join(d, 'assets', 'gen.js'), `const s = '${header}';`);
      const opts = { phrases: [], notPrivate: [join(privDir, 'pub.svg')] };
      expect(scan(d, [join(privDir, 'p.svg')], { phrases: [] }).length).toBe(1);          // without it: the header matches
      expect(scan(d, [join(privDir, 'p.svg')], opts)).toEqual([]);                        // with it: boilerplate is not private
      writeFileSync(join(d, 'assets', 'leak.js'), header + secret);
      expect(scan(d, [join(privDir, 'p.svg')], opts)).toEqual(['assets/leak.js: part of p.svg (raw bytes)']);
    } finally { rmSync(d, { recursive: true, force: true }); rmSync(join(privDir, 'p.svg')); rmSync(join(privDir, 'pub.svg')); }
  });

  it('skips top-level folders named in ignore, and only those', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, 'private')); writeFileSync(join(d, 'private', 'x.txt'), 'zephyrine');
      mkdirSync(join(d, 'assets', 'private')); writeFileSync(join(d, 'assets', 'private', 'y.txt'), 'zephyrine');
      const f = scan(d, [], { ignore: ['private'], phrases: PHRASES });
      expect(f).toEqual(['assets/private/y.txt: phrase "zephyrine"']);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
