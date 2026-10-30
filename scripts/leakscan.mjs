// Fails if anything private can be read from a folder that will be published (the built site, or a repo tree).
// usage: node scripts/leakscan.mjs <folder-to-scan> <private-file>... [--key <key-file>] [--phrases <comma,separated>]
//                                  [--ignore <comma,separated top-level names>]
// How: every private file is cut into 24-byte pieces (skipping low-variety pieces such as runs of zeros). Each published
// file is searched for any of those pieces at every position: as raw bytes, inside any long hex run (decoded), and inside
// any long base64 or base64url run (decoded at every alignment). That finds whole files and partial copies in any of
// those forms. It also looks for each phrase (case-insensitive, raw and URL-encoded) and for the key (text and bytes).
// Exit code 1 with a list of findings when anything is found; 0 when the folder is clean.
// Adopted from the tested /home/claude/seal/leakscan.mjs; added: JSDoc types, an `ignore` option for repo-tree scans.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// The real phrase list is private (private/real.json "phrases"): a public list would itself reveal the design's words.
export const DEFAULT_PHRASES = /** @type {string[]} */ ([]);
const PIECE = 24, MIN_VARIETY = 12;

/** @param {string} dir @param {Set<string>} ignore names skipped at the top level @param {string[]} [out] @param {boolean} [top] */
function walk(dir, ignore, out = [], top = true) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || (top && ignore.has(name))) continue;
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory()) walk(p, ignore, out, false); else out.push(p);
  }
  return out;
}

/** @param {string[]} files @returns {Map<string, string>} */
function pieceIndex(files) {
  const idx = new Map();
  for (const f of files) {
    const s = readFileSync(f).toString('latin1'), name = basename(f);
    for (let i = 0; i + PIECE <= s.length; i += PIECE) {
      const piece = s.slice(i, i + PIECE);
      if (new Set(piece).size >= MIN_VARIETY) idx.set(piece, name);
    }
  }
  return idx;
}

/** @param {string} s latin1 text @param {Map<string, string>} idx @returns {string|null} the private file a piece of `s` comes from */
function slide(s, idx) {
  for (let i = 0; i + PIECE <= s.length; i++) { const hit = idx.get(s.slice(i, i + PIECE)); if (hit) return hit; }
  return null;
}

/** @param {string} text @returns {[string, string][]} */
function decodedRuns(text) {
  /** @type {[string, string][]} */
  const out = [];
  for (const m of text.matchAll(/[0-9a-fA-F]{96,}/g)) {
    const h = m[0].length % 2 ? m[0].slice(1) : m[0];
    out.push(['hex', Buffer.from(h, 'hex').toString('latin1')]);
    out.push(['hex', Buffer.from(m[0].slice(1, 1 + ((m[0].length - 1) & ~1)), 'hex').toString('latin1')]);
  }
  for (const m of text.matchAll(/[A-Za-z0-9+/_-]{128,}={0,2}/g)) {
    const run = m[0].replace(/-/g, '+').replace(/_/g, '/');
    for (let k = 0; k < 4; k++) out.push(['base64', Buffer.from(run.slice(k), 'base64').toString('latin1')]);
  }
  return out;
}

/**
 * @param {string} folder
 * @param {string[]} privateFiles
 * @param {{ keyText?: string | null, phrases?: string[], ignore?: string[], notPrivate?: string[] }} [o]
 *   notPrivate: public files (for example the synthetic payload); a piece found in one of them is standard boilerplate
 *   such as an SVG or PDF header, not private content, so it is not looked for
 * @returns {string[]} findings; empty when the folder is clean
 */
export function scan(folder, privateFiles, { keyText = null, phrases = DEFAULT_PHRASES, ignore = [], notPrivate = [] } = {}) {
  const idx = pieceIndex(privateFiles);
  if (notPrivate.length) {
    const pub = notPrivate.map(f => readFileSync(f).toString('latin1'));
    for (const piece of [...idx.keys()]) if (pub.some(t => t.includes(piece))) idx.delete(piece);
  }
  /** @type {[string, Buffer][]} */
  const keyNeedles = keyText ? [['the link key (text)', Buffer.from(keyText)], ['the link key (raw bytes)', Buffer.from(keyText, 'base64url')]] : [];
  const findings = [];
  for (const p of walk(folder, new Set(ignore))) {
    const data = readFileSync(p), text = data.toString('latin1'), lower = text.toLowerCase();
    const rel = relative(folder, p) || basename(p);
    const raw = slide(text, idx);
    if (raw) findings.push(`${rel}: part of ${raw} (raw bytes)`);
    for (const [form, dec] of decodedRuns(text)) { const hit = slide(dec, idx); if (hit) { findings.push(`${rel}: part of ${hit} (${form})`); break; } }
    for (const [label, bytes] of keyNeedles) if (data.includes(bytes)) findings.push(`${rel}: ${label}`);
    for (const ph of phrases) {
      const q = ph.toLowerCase();
      if (lower.includes(q) || lower.includes(encodeURIComponent(q).toLowerCase())) findings.push(`${rel}: phrase "${ph}"`);
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  /** @param {string} name */
  const opt = name => { const i = a.indexOf(name); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
  const keyFile = opt('--key'), phraseArg = opt('--phrases'), ignoreArg = opt('--ignore');
  const [folder, ...files] = a;
  if (!folder || !files.length) { console.error('usage: node scripts/leakscan.mjs <folder> <private-file>... [--key <key-file>] [--phrases a,b] [--ignore a,b]'); process.exit(2); }
  const keyText = keyFile ? readFileSync(keyFile, 'utf8').trim() : null;
  const findings = scan(folder, files, { keyText, phrases: phraseArg ? phraseArg.split(',') : DEFAULT_PHRASES, ignore: ignoreArg ? ignoreArg.split(',') : [] });
  if (findings.length) { console.error('LEAK: private content found in ' + folder + '\n  ' + findings.join('\n  ')); process.exit(1); }
  console.log(`clean: ${folder} (${files.length} private files${keyText ? ', key' : ''}, phrase list checked)`);
}
