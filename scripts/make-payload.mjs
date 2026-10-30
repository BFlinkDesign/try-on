// Builds the plain payload container (src/lib/container.js): the sample photo, the preview design, the six package
// files byte for byte, and the private wording the page shows. The output is NOT for publishing: scripts/build.mjs seals
// it into public/payload.bin and the plain file never enters public/ or dist/.
//
// usage: node scripts/make-payload.mjs --synthetic [--out <file>]
//          made-up photo, design and files (tests and CI). Also writes them, with manifest.json (SHA-256 of each), to
//          .payload/synthetic/ so the tests can compare downloads and scan the build for them.
//        node scripts/make-payload.mjs --real <package-folder> --out <file> [--config <file>]
//          the private package. --config (default private/real.json, never committed) names the sample photo, the
//          preview design, which package file is which, and the wording; see README "Private build".
// Stops (exit 1) if a file is missing, a file's contents do not match its type, the preview design does not draw the
// same paths as the offered SVG, or the result would not pass the page's own checks.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILE_KEYS, FILE_TYPES, MIME } from '../src/lib/files.js';
import { pack, unpack } from '../src/lib/container.js';
import { readPayload, PAYLOAD_VERSION } from '../src/payload.js';
import { SYNTHETIC_TEXT, SYNTHETIC_PHRASES, syntheticSet } from './lib/synthetic.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SYNTHETIC_DIR = join(ROOT, '.payload', 'synthetic');

/** @typedef {import('../src/lib/files.js').FileKey} FileKey */
/** @typedef {{ sample: Buffer, art: Buffer, files: Record<FileKey, Buffer>, text: Record<string, unknown> }} Parts */

export class Stop extends Error {}
/** @param {string} msg @returns {never} */
const stop = msg => { throw new Stop(`STOP: ${msg}`); };
/** @param {string} path */
const read = path => { if (!existsSync(path)) stop(`missing ${path}`); return readFileSync(path); };
/** @param {Uint8Array} b */
export const sha256 = b => createHash('sha256').update(b).digest('hex');

/** Magic bytes by extension, so a renamed or truncated file is caught before it is offered. */
const looksLike = {
  pdf: (/** @type {Buffer} */ b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  png: (/** @type {Buffer} */ b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  svg: (/** @type {Buffer} */ b) => /<svg[\s>]/.test(b.subarray(0, 4096).toString('utf8')),
  jpg: (/** @type {Buffer} */ b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};
/** @param {Buffer} buf @param {string} ext @param {string} what */
const checkType = (buf, ext, what) => {
  const f = looksLike[/** @type {keyof typeof looksLike} */ (ext)];
  if (!f || !f(buf)) stop(`${what} is not a valid .${ext} file`);
};
/** @param {string} text */
const pathsOf = text => [...text.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);

/**
 * Checks the parts, packs them, and proves the page's own reader accepts the result.
 * @param {Parts} parts @returns {Uint8Array}
 */
export function packParts(parts) {
  checkType(parts.sample, 'jpg', 'the sample photo'); checkType(parts.art, 'svg', 'the preview design');
  for (const key of FILE_KEYS) checkType(parts.files[key], FILE_TYPES[key], `file ${key}`);
  const artPaths = pathsOf(parts.art.toString('utf8')), offered = pathsOf(parts.files.svg.toString('utf8'));
  if (!artPaths.length || artPaths.length !== offered.length || artPaths.some((d, i) => d !== offered[i])) stop('the preview design does not draw the same paths as the offered SVG');
  const container = pack({ version: PAYLOAD_VERSION, ...parts.text }, [
    { key: 'sample', type: 'image/jpeg', bytes: parts.sample },
    { key: 'art', type: 'image/svg+xml', bytes: parts.art },
    ...FILE_KEYS.map(key => ({ key: `file/${key}`, type: MIME[FILE_TYPES[key]], bytes: parts.files[key] })),
  ]);
  try { readPayload(unpack(container)); } catch (e) { stop(`the page would refuse this payload: ${/** @type {Error} */ (e).message}`); }
  return container;
}

/** @returns {Parts} */
export function syntheticParts() {
  const s = syntheticSet();
  return { sample: s.sample, art: s.art, files: s.files, text: structuredClone(/** @type {any} */ (SYNTHETIC_TEXT)) };
}

/**
 * @param {string} pkgDir the private package folder
 * @param {string} configPath JSON: { sample, art, files: { <key>: { source } }, text: { ... } }
 * @returns {Parts}
 */
export function realParts(pkgDir, configPath) {
  /** @type {any} */
  let cfg;
  try { cfg = JSON.parse(read(configPath).toString('utf8')); } catch (e) { if (e instanceof Stop) throw e; stop(`${configPath} is not JSON`); }
  if (!cfg || typeof cfg.sample !== 'string' || typeof cfg.art !== 'string' || !cfg.files || !cfg.text) stop(`${configPath} needs sample, art, files and text`);
  /** @type {Partial<Record<FileKey, Buffer>>} */
  const files = {};
  for (const key of FILE_KEYS) {
    const src = cfg.files[key]?.source;
    if (typeof src !== 'string' || !src || src.includes('..')) stop(`${configPath}: files.${key}.source missing`);
    files[key] = read(join(pkgDir, src));
  }
  return { sample: read(resolve(dirname(configPath), cfg.sample)), art: read(resolve(dirname(configPath), cfg.art)), files: /** @type {Record<FileKey, Buffer>} */ (files), text: cfg.text };
}

/**
 * Writes the synthetic private files and their manifest for the tests.
 * @param {Parts} parts @param {string} dir
 */
export function writeSyntheticFiles(parts, dir) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const names = /** @type {Record<FileKey, string>} */ (parts.text.fileNames);
  /** @type {Record<string, { name: string, sha256: string, bytes: number }>} */
  const files = {};
  for (const key of FILE_KEYS) {
    writeFileSync(join(dir, names[key]), parts.files[key]);
    files[key] = { name: names[key], sha256: sha256(parts.files[key]), bytes: parts.files[key].length };
  }
  writeFileSync(join(dir, 'sample.jpg'), parts.sample); writeFileSync(join(dir, 'art.svg'), parts.art);
  const manifest = {
    kind: 'synthetic',
    sample: { path: 'sample.jpg', sha256: sha256(parts.sample) },
    art: { path: 'art.svg', sha256: sha256(parts.art) },
    files, phrases: SYNTHETIC_PHRASES, text: parts.text,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/** @param {string} out @param {Uint8Array} data atomic: a half-written file is never read */
export function writeAtomic(out, data) {
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 }); renameSync(tmp, out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  /** @param {string} name */
  const opt = name => { const i = a.indexOf(name); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v ?? null; };
  try {
    const out = opt('--out'), real = opt('--real'), config = opt('--config') ?? join(ROOT, 'private', 'real.json');
    const synthetic = a.includes('--synthetic');
    if (synthetic === !!real) stop('usage: make-payload.mjs --synthetic [--out <file>]  |  --real <package-folder> --out <file> [--config <file>]');
    let parts;
    if (synthetic) { parts = syntheticParts(); writeSyntheticFiles(parts, SYNTHETIC_DIR); } else {
      if (!out) stop('--real needs --out (keep the plain payload outside public/ and dist/)');
      parts = realParts(resolve(/** @type {string} */ (real)), resolve(config));
    }
    const target = resolve(out ?? join(ROOT, '.payload', 'synthetic.plain.bin'));
    if (target.startsWith(join(ROOT, 'public')) || target.startsWith(join(ROOT, 'dist'))) stop('the plain payload must not be written into public/ or dist/');
    const container = packParts(parts);
    writeAtomic(target, container);
    console.log(`built ${synthetic ? 'synthetic' : 'real'} payload (${container.length.toLocaleString('en-US')} bytes, plain, not for publishing)`);
    for (const key of FILE_KEYS) console.log(`  ${key.padEnd(8)} ${sha256(parts.files[key]).slice(0, 12)}  ${parts.files[key].length.toLocaleString('en-US').padStart(9)}`);
  } catch (e) {
    if (e instanceof Stop) { console.error(e.message); process.exit(1); }
    throw e;
  }
}
