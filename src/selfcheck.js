// @ts-check
// "Check this phone": runs the checks no test runner can do on her iPhone (key kept after Add to Home Screen, share
// sheet with files, storage kept, canvas limits) and shows PASS / FAIL / UNKNOWN rows with a "Copy results" button.
// Opened from More options, or by adding "&check" to the link (or "#check" on its own).
import { S } from './state.js';
import { $, $btn } from './dom.js';
import { CHECKS, canvasDetail, canvasStatus, formatResults } from './lib/selfcheck.js';
import { toast } from './toast.js';

/** @typedef {import('./lib/selfcheck.js').Row} Row */
/** @typedef {{ status: Row['status'], detail: string }} Result */

/** A 1 x 1 PNG, to ask the share sheet whether it would take an image file. */
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const CANVAS_SIZES = [4096, 6000, 8192];

/** @param {number} ms */
const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s`)), ms));

/** @type {Record<string, () => Promise<Result> | Result>} */
const PROBES = {
  unlocked: () => S.unlock.ok ? { status: 'PASS', detail: 'the page opened' } : { status: 'FAIL', detail: `did not open (${S.unlock.code ?? 'still loading'})` },
  keysource: () => {
    const said = { link: 'from the link', stored: 'kept on this phone from an earlier visit', pasted: 'pasted on this phone' };
    return S.unlock.source ? { status: 'PASS', detail: said[S.unlock.source] } : { status: 'FAIL', detail: 'no key in the link and none kept on this phone' };
  },
  homescreen: () => {
    const standalone = /** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone === true || matchMedia('(display-mode: standalone)').matches;
    return standalone ? { status: 'PASS', detail: 'opened from the Home Screen' } : { status: 'FAIL', detail: 'opened in the browser, not from the Home Screen' };
  },
  persisted: async () => {
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') return { status: 'UNKNOWN', detail: 'this browser does not say' };
    return await navigator.storage.persisted() ? { status: 'PASS', detail: 'the phone will not clear it to save space' } : { status: 'FAIL', detail: 'the phone may clear it when space runs low' };
  },
  indexeddb: () => new Promise(res => {
    const value = Math.random().toString(36).slice(2), name = 'tryon-selfcheck';
    /** @param {Result} r */
    const done = r => { try { indexedDB.deleteDatabase(name); } catch { /* best effort */ } res(r); };
    try {
      const q = indexedDB.open(name, 1);
      q.onupgradeneeded = () => q.result.createObjectStore('s');
      q.onerror = () => done({ status: 'FAIL', detail: `could not open storage (${q.error?.name ?? 'error'})` });
      q.onsuccess = () => {
        const db = q.result, tx = db.transaction('s', 'readwrite');
        tx.objectStore('s').put(value, 'v');
        tx.onerror = () => { db.close(); done({ status: 'FAIL', detail: `could not write (${tx.error?.name ?? 'error'})` }); };
        tx.oncomplete = () => {
          const g = db.transaction('s').objectStore('s').get('v');
          g.onsuccess = () => { db.close(); done(g.result === value ? { status: 'PASS', detail: 'wrote and read back' } : { status: 'FAIL', detail: 'read back something else' }); };
          g.onerror = () => { db.close(); done({ status: 'FAIL', detail: 'could not read back' }); };
        };
      };
    } catch (e) { done({ status: 'FAIL', detail: `storage blocked (${/** @type {Error} */ (e).name})` }); }
  }),
  share: () => {
    if (typeof navigator.canShare !== 'function') return { status: 'FAIL', detail: 'no share sheet for files here (files download instead)' };
    const bin = atob(TINY_PNG), u = Uint8Array.from(bin, c => c.charCodeAt(0));
    const file = new File([u], 'check.png', { type: 'image/png' });
    return navigator.canShare({ files: [file] }) ? { status: 'PASS', detail: 'the share sheet takes a PNG file' } : { status: 'FAIL', detail: 'the share sheet refuses files (files download instead)' };
  },
  canvas: () => {
    /** @type {[number, boolean][]} */
    const tried = [];
    for (const n of CANVAS_SIZES) {
      let ok = false;
      const c = document.createElement('canvas');
      try {
        c.width = n; c.height = n;
        const x = c.getContext('2d', { willReadFrequently: true });
        if (x) { x.fillStyle = '#00ff00'; x.fillRect(n - 2, n - 2, 2, 2); const d = x.getImageData(n - 1, n - 1, 1, 1).data; ok = d[1] === 255 && d[0] === 0 && d[3] === 255; }
      } catch { ok = false; }
      c.width = 0; c.height = 0;   // give the memory back before the next size
      tried.push([n, ok]);
      if (!ok) break;
    }
    return { status: canvasStatus(tried), detail: canvasDetail(tried) };
  },
  picker: () => {
    const i = document.createElement('input'); i.setAttribute('type', 'file');
    return i.type === 'file' && !i.disabled ? { status: 'PASS', detail: 'Choose photo can open the photo picker' } : { status: 'FAIL', detail: 'this browser cannot pick files' };
  },
  crypto: () => globalThis.crypto?.subtle && typeof crypto.subtle.decrypt === 'function' ? { status: 'PASS', detail: 'available' } : { status: 'FAIL', detail: 'not available (the page cannot open)' },
  screen: () => ({ status: 'PASS', detail: `pixel ratio ${devicePixelRatio}, screen ${screen.width} x ${screen.height}, window ${innerWidth} x ${innerHeight}` }),
  version: () => ({ status: 'PASS', detail: __APP_VERSION__ }),
};

/** @returns {Promise<Row[]>} */
export async function runChecks() {
  /** @type {Row[]} */
  const rows = [];
  for (const c of CHECKS) {
    /** @type {Result} */
    let r;
    try { r = await Promise.race([Promise.resolve(PROBES[c.id]()), timeout(8000)]); } catch (e) { r = { status: 'UNKNOWN', detail: `the check itself failed (${/** @type {Error} */ (e).message || 'error'})` }; }
    rows.push({ ...c, ...r });
  }
  return rows;
}

let text = '';
let running = false;

/** Shows the screen and runs every check (again, if it was open). */
export async function openCheck() {
  if (running) return;
  running = true;
  const box = $('check'), list = $('checkRows');
  box.hidden = false; $('checkNote').textContent = 'Running the checks…'; $btn('checkCopy').disabled = true; $('checkTextWrap').hidden = true;
  list.replaceChildren();
  box.scrollIntoView({ block: 'start' });
  try {
    const rows = await runChecks();
    for (const r of rows) {
      const li = document.createElement('li'), b = document.createElement('b'), name = document.createElement('span'), d = document.createElement('span');
      li.dataset.check = r.id; li.dataset.status = r.status; b.textContent = r.status; name.textContent = r.name; d.textContent = r.detail;
      name.className = 'cn'; d.className = 'cd'; li.append(b, name, d); list.append(li);
    }
    text = formatResults(rows, new Date());
    /** @type {HTMLTextAreaElement} */ ($('checkText')).value = text;
    $('checkNote').textContent = 'Done. Copy the results and send them back.';
    $btn('checkCopy').disabled = false;
  } finally { running = false; }
}

async function copyResults() {
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a message.'); return; } catch { /* fall through */ }
  const ta = /** @type {HTMLTextAreaElement} */ ($('checkText'));
  $('checkTextWrap').hidden = false; ta.focus(); ta.select();
  let copied;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  toast(copied ? 'Copied. Paste it into a message.' : 'Select the text below and copy it.');
}

export function initCheck() {
  $btn('checkBtn').onclick = () => { openCheck(); };
  $btn('checkCopy').onclick = () => { copyResults(); };
  $btn('checkClose').onclick = () => { $('check').hidden = true; };
}
