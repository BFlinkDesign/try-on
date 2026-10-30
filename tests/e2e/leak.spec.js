// @ts-check
// The leak gate, on the build under test (E2E_DIST): scanned against the synthetic private files, the plain payload, the
// test key and the phrase list, it must be clean; and a copy with the synthetic photo planted in it as base64 must
// fail the scan (so a clean result means something). E2E_SRC points at the scanner of a broken copy (scripts/mutants.mjs).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, assertCheck, ROOT, SYNTHETIC_DIR, MANIFEST_JSON, TEST_KEY } from './helpers.js';

const DIST = resolve(ROOT, process.env.E2E_DIST || 'dist');
const SRC = process.env.E2E_SRC ? resolve(process.env.E2E_SRC) : ROOT;
/** @returns {Promise<typeof import('../../scripts/leakscan.mjs')>} */
const scanner = () => import(pathToFileURL(join(SRC, 'scripts', 'leakscan.mjs')).href);
const PRIVATE = [join(SYNTHETIC_DIR, 'sample.jpg'), join(SYNTHETIC_DIR, 'art.svg'), ...Object.values(MANIFEST_JSON.files).map(f => join(SYNTHETIC_DIR, f.name)), join(ROOT, '.payload', 'synthetic.plain.bin')];

test('dist_leak_scan_clean', async () => {
  const { scan, DEFAULT_PHRASES } = await scanner();
  const findings = scan(DIST, PRIVATE, { keyText: TEST_KEY, phrases: [...DEFAULT_PHRASES, ...MANIFEST_JSON.phrases] });
  assertCheck('dist_leak_scan_clean', { ok: findings.length === 0, detail: findings });
});

test('leak_scan_finds_planted_photo', async () => {
  const { scan, DEFAULT_PHRASES } = await scanner();
  const d = mkdtempSync(join(tmpdir(), 'leak-plant-'));
  try {
    cpSync(DIST, d, { recursive: true });
    const b64 = readFileSync(join(SYNTHETIC_DIR, 'sample.jpg')).toString('base64');
    writeFileSync(join(d, 'assets', 'planted.js'), `export const img = "data:image/jpeg;base64,${b64}";`);
    const findings = scan(d, PRIVATE, { keyText: TEST_KEY, phrases: DEFAULT_PHRASES });
    assertCheck('leak_scan_finds_planted_photo', { ok: findings.some(f => f.startsWith('assets/planted.js: part of sample.jpg')), detail: findings });
  } finally { rmSync(d, { recursive: true, force: true }); }
});
