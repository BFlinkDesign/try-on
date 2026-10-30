// @ts-check
// Start-up: wire the page, then open the sealed payload with the key from the link (or the one kept on this device) and
// load the saved work. The page's shell is on screen (with a short loading line) before the payload arrives; the
// controls stay inert until the photo and design are in. When the page cannot open, one calm screen says why
// (src/lib/gate.js). The link's fragment (#k=...) is left in place: it is what Add to Home Screen keeps.
import { S, newId, sampleRecord } from './state.js';
import { $, $in, artImg } from './dom.js';
import { fetchSealed, openSealed, PayloadError } from './payload.js';
import { keyFromHash, keyFromText } from './lib/unseal.js';
import { hashFor, screenFor, wantsCheck } from './lib/gate.js';
import { initHistory, undoUi } from './history.js';
import { render } from './render.js';
import { initSteps, goStep } from './steps.js';
import { initView } from './view.js';
import { initDrag } from './drag.js';
import { initControls } from './controls.js';
import { initPhotos, initPhotoInputs, select } from './photos.js';
import { initTaps } from './taps.js';
import { initCalibrate } from './calibrate.js';
import { initMeasure } from './measure.js';
import { initPicture } from './picture.js';
import { initSaving, dlUi } from './saving.js';
import { idb, loadSaved } from './storage.js';
import { initCheck, openCheck } from './selfcheck.js';

const app = $('app');
const KEY_STORE = 'tryon-key';

// Same order as the listeners were attached in the single-file page.
initHistory(); initSteps(); initPhotos(); initView(); initDrag(); initControls(); initPhotoInputs();
initTaps(); initCalibrate(); initMeasure(); initPicture(); initSaving(); initCheck();

// Test and support handle: the page's own state and a few entry points (the single-file page exposed these as globals).
Object.defineProperty(window, '__tryon', { value: Object.freeze({ S, goStep, select, sampleRecord, render, idb }) });

/** @returns {string | null} */
const storedKey = () => { try { return localStorage.getItem(KEY_STORE); } catch { return null; } };
/** @param {string} k */
const storeKey = k => { try { localStorage.setItem(KEY_STORE, k); } catch { /* private mode: the link still works */ } };

/** @param {import('./lib/gate.js').Screen | 'loading' | 'open'} which */
function showGate(which) {
  $('loadNote').hidden = which !== 'loading';
  $('gateNoKey').hidden = which !== 'nokey';
  $('gateOld').hidden = which !== 'oldlink';
  $('keyForm').hidden = which !== 'nokey' && which !== 'oldlink';
  $('gateReload').hidden = which !== 'reload';
  $('gateOffline').hidden = which !== 'offline';
  app.hidden = which !== 'loading' && which !== 'open';
}

/** @param {import('./payload.js').Payload} payload @param {any} s the saved work, or null */
function boot(payload, s) {
  S.text = payload.text; S.designIn = { w: payload.text.designWidthIn, h: payload.text.designHeightIn };
  S.artAspect = S.designIn.w / S.designIn.h; S.artTrueIn = S.designIn.w;
  $('noteStencil').textContent = payload.text.fileNotes.stencil; $('noteOrig').textContent = payload.text.fileNotes.orig;
  $('guideSheet').textContent = payload.text.guideSheet; artImg.alt = payload.text.designTitle;
  S.assets = { sample: payload.sample, art: payload.art }; S.files = payload.files; S.artSrc = payload.art;
  if (s && (s.v === 3 || s.v === 2) && s.photos && s.photos.length) {
    S.photos = s.photos; S.photos.forEach(r => { if (!r.id) r.id = newId(); }); S.cur = Math.min(s.cur || 0, S.photos.length - 1); S.step = s.step || 1;
    if (s.artSrc && s.artTrueIn === null) { S.artSrc = s.artSrc; S.artAspect = s.artAspect || S.artAspect; S.artTrueIn = null; }   // her uploaded design
    if (s.opacity) $in('opacity').value = s.opacity;
  } else S.photos = [sampleRecord()];
  artImg.src = S.artSrc; S.loaded = true; undoUi(); select(S.cur); dlUi(); S.booted = true;
  showGate('open'); app.inert = false; app.removeAttribute('aria-busy');
}

let starting = false;

/** @param {{ key: string, source: 'pasted' } | null} [pasted] */
async function start(pasted = null) {
  if (starting || S.booted) return;
  starting = true; showGate('loading');
  /** @type {{ key: string, source: import('./payload.js').KeySource }[]} */
  const keys = [];
  const add = (/** @type {string | null} */ key, /** @type {import('./payload.js').KeySource} */ source) => { if (key && !keys.some(k => k.key === key)) keys.push({ key, source }); };
  add(pasted?.key ?? null, 'pasted'); add(keyFromHash(location.hash), 'link'); add(storedKey(), 'stored');
  try {
    if (!keys.length) throw new PayloadError('nokey', 'payload: no key');
    const [sealed, saved] = await Promise.all([fetchSealed(), loadSaved()]);
    const opened = await openSealed(sealed, keys);
    storeKey(opened.key);
    try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not offered: work is still kept, just less firmly */ }
    S.unlock = { ok: true, code: null, source: opened.source };
    boot(opened.payload, saved);
  } catch (e) {
    const code = e instanceof PayloadError ? e.code : 'unexpected';
    if (code === 'unexpected') console.error('tattoo-tryon: start-up failed', e);
    else if (code !== 'nokey' && code !== 'wrongkey') console.warn(`tattoo-tryon: the page could not open (${code})`);
    S.unlock = { ok: false, code, source: null };
    showGate(screenFor(code));
  } finally { starting = false; }
  if (wantsCheck(location.hash)) openCheck();
}

/** @param {string} text a pasted link (or just the key) */
function tryOpen(text) {
  const key = keyFromText(text), msg = $('keyMsg');
  if (!key) { msg.hidden = false; msg.textContent = "That isn't the whole link. Copy the full link you were sent and try again."; return; }
  msg.hidden = true;
  history.replaceState(null, '', hashFor(key, wantsCheck(location.hash)));   // the key now lives in the address, as if the link was opened
  start({ key, source: 'pasted' });
}

$('keyForm').addEventListener('submit', e => { e.preventDefault(); tryOpen($in('keyText').value); });
$('keyPaste').onclick = async () => {
  try {
    const t = await navigator.clipboard.readText(); $in('keyText').value = t; tryOpen(t);
  } catch {
    const msg = $('keyMsg'); msg.hidden = false; msg.textContent = 'Press and hold in the box above and choose Paste, then tap Open.'; $in('keyText').focus();
  }
};
$('gateReloadBtn').onclick = () => location.reload();
$('gateRetry').onclick = () => { start(); };
// A link opened while this page is already showing a screen (the address changed only after '#').
addEventListener('hashchange', () => { if (!S.booted) start(); else if (wantsCheck(location.hash)) openCheck(); });
start();
