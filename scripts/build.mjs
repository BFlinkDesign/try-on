// The one build. Every step must succeed or the build stops with exit code 1 (and a dist/ that failed the leak scan is
// deleted, so it cannot be published by mistake).
//
// usage: node scripts/build.mjs           synthetic payload sealed with the committed TEST key (tests, CI)
//        node scripts/build.mjs --real    the private package sealed with the link key (the site that is published)
//
// Steps: plain payload (scripts/make-payload.mjs) -> seal into public/payload.bin (scripts/seal.mjs) -> vite build ->
// leak scan of dist/ against the private files, the plain payload, the key and the phrase list (scripts/leakscan.mjs).
// --real also scans the source tree (what would be committed to the public repo), creates the key file once if it is
// missing, and prints the full link. The real plain payload lives only in a private temporary folder and is deleted.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FILE_KEYS } from '../src/lib/files.js';
import { ROOT, SYNTHETIC_DIR, Stop, packParts, realParts, syntheticParts, writeAtomic, writeSyntheticFiles } from './make-payload.mjs';
import { SealStop, keyIdOf, loadKey, sealBytes } from './seal.mjs';
import { DEFAULT_PHRASES, scan } from './leakscan.mjs';
import { SYNTHETIC_PHRASES } from './lib/synthetic.mjs';

export const TEST_KEY_FILE = join(ROOT, 'tests', 'fixtures', 'test-key.txt');
export const LINK_BASE = 'https://bflinkdesign.github.io/try-on/';
const DIST = join(ROOT, 'dist'), SEALED = join(ROOT, 'public', 'payload.bin');
/** Folders of the source tree that are never committed (see .gitignore), skipped by the source-tree scan. */
const NOT_COMMITTED = ['dist', 'private', '.payload', 'reports', 'test-results', '.mutants', '.stryker-tmp', 'node_modules'];

/** @param {string} msg @returns {never} */
const fail = msg => { throw new Stop(`STOP: ${msg}`); };

function viteBuild() {
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail('vite build failed');
}

/** @param {string[]} findings @param {string} what */
function leakGate(findings, what) {
  if (!findings.length) { console.log(`leak scan: ${what} is clean`); return; }
  if (what.startsWith('dist')) rmSync(DIST, { recursive: true, force: true });
  fail(`private content found in ${what}${what.startsWith('dist') ? ' (dist/ deleted)' : ''}:\n  ${findings.join('\n  ')}`);
}

/** @param {boolean} real */
function build(real) {
  if (existsSync(join(ROOT, 'public', 'payload.json'))) rmSync(join(ROOT, 'public', 'payload.json'));   // the old plain payload never ships
  const tmp = real ? mkdtempSync(join(tmpdir(), 'tryon-real-')) : null;
  try {
    /** @type {string[]} */
    let privateFiles;
    let key, keyCreated = false, phrases = DEFAULT_PHRASES;
    if (real) {
      const cfgPath = join(ROOT, 'private', 'real.json');
      if (!existsSync(cfgPath)) fail(`${cfgPath} is missing (see README "Private build")`);
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      const pkgDir = resolve(cfg.packageDir), keyFile = resolve(cfg.keyFile);
      const parts = realParts(pkgDir, cfgPath);
      const plain = join(/** @type {string} */ (tmp), 'payload.plain');
      writeAtomic(plain, packParts(parts));
      privateFiles = [resolve(cfg.sample), resolve(cfg.art), ...FILE_KEYS.map(k => join(pkgDir, cfg.files[k].source)), plain];
      // every private wording string is a phrase too (the file names, notes, guide sentence and design title)
      const t = cfg.text;
      phrases = [...DEFAULT_PHRASES, ...(Array.isArray(cfg.phrases) ? cfg.phrases : []), ...[t.designTitle, t.guideSheet, t.fileNotes.stencil, t.fileNotes.orig, ...Object.values(t.fileNames)].filter(x => typeof x === 'string' && x.length >= 8)];
      ({ key, created: keyCreated } = loadKey(keyFile, !existsSync(keyFile)));
      if (keyCreated) console.log(`NEW KEY written to ${keyFile} (it did not exist). Keep a copy in the password manager.`);
      writeAtomic(SEALED, sealBytes(readFileSync(plain), key));
    } else {
      const parts = syntheticParts();
      writeSyntheticFiles(parts, SYNTHETIC_DIR);
      const plain = join(ROOT, '.payload', 'synthetic.plain.bin');
      writeAtomic(plain, packParts(parts));
      privateFiles = [join(SYNTHETIC_DIR, 'sample.jpg'), join(SYNTHETIC_DIR, 'art.svg'),
        ...FILE_KEYS.map(k => join(SYNTHETIC_DIR, /** @type {Record<string, string>} */ (parts.text.fileNames)[k])), plain];
      key = loadKey(TEST_KEY_FILE, false).key;
      phrases = [...DEFAULT_PHRASES, ...SYNTHETIC_PHRASES];
      writeAtomic(SEALED, sealBytes(readFileSync(plain), key));
    }
    console.log(`sealed public/payload.bin (${readFileSync(SEALED).length.toLocaleString('en-US')} bytes, key id ${keyIdOf(key).toString('hex')}, ${real ? 'REAL' : 'synthetic, test key'})`);

    viteBuild();
    if (existsSync(join(DIST, 'payload.json'))) leakGate(['payload.json: the old plain payload is in dist'], 'dist/');
    const keyText = key.toString('base64url');
    leakGate(scan(DIST, privateFiles, { keyText, phrases }), `dist/ (${privateFiles.length} private files, key, ${phrases.length} phrases)`);
    if (real) {
      // The phrase list has to be written down somewhere: the scanner, its test, and the mutant that plants a phrase name
      // the words. Only phrase findings in those three files are allowed; any piece of a private file or the key is not.
      const naming = new Set(['scripts/leakscan.mjs', 'tests/unit/leakscan.test.js', 'scripts/mutants.mjs']);
      // the source tree is scanned for the private files and wording, not for the plain container: its JSON index is
      // mostly generic field names and shell-like sentences that the synthetic payload's source shares by design
      // pieces the synthetic payload shares with the real files are file-format boilerplate (an SVG header), not private
      const pub = join(/** @type {string} */ (tmp), 'public-synthetic'), sp = syntheticParts();
      writeSyntheticFiles(sp, pub);
      const notPrivate = ['sample.jpg', 'art.svg', ...FILE_KEYS.map(k => /** @type {Record<string, string>} */ (sp.text.fileNames)[k])].map(n => join(pub, n));
      const tree = scan(ROOT, privateFiles.filter(f => !f.endsWith('payload.plain')), { keyText, phrases, ignore: NOT_COMMITTED, notPrivate })
        .filter(f => !(naming.has(f.slice(0, f.indexOf(':'))) && / phrase "/.test(f)));
      leakGate(tree, 'the source tree (what gets committed)');
      console.log(`\nThe link (send only this, privately):\n${LINK_BASE}#k=${keyText}\n`);
    }
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  build(process.argv.includes('--real'));
} catch (e) {
  if (e instanceof Stop || e instanceof SealStop) { console.error(e.message); process.exit(1); }
  throw e;
}
