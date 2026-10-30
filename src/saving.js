// @ts-check
// Saving files. Inside Claude (window.claude exists) the page never downloads by itself: the platform's "downloads"
// capability shows a confirmation and she decides; if the platform cannot save in that view, the buttons stay hidden
// and the page says how else to get the files. On an ordinary web host (no window.claude) the browser's own download
// is used.
import { S, customArt } from './state.js';
import { $, $btn, $$ } from './dom.js';
import { FILE_TYPES, b64Bytes, mimeOf, previewName } from './lib/files.js';
import { saveOutcome } from './lib/save-outcome.js';
import { toast } from './toast.js';

/** @typedef {import('./lib/files.js').FileKey} FileKey */
/** @param {FileKey} key the name she saves that file as (private: from the payload) */
const nameOf = key => /** @type {NonNullable<typeof S.text>} */ (S.text).fileNames[key];

export function dlUi() {
  const on = S.dlState === 'on' || S.dlState === 'direct';
  $('dlHow').textContent = S.dlState === 'direct' ? 'Tap a file to download it.' : 'A confirmation appears before each file is saved.';
  $('dlWait').hidden = S.dlState !== 'wait';
  $('dlNone').hidden = S.dlState !== 'none';
  $('dlNone').textContent = S.dlLost ? 'Saving files stopped working on this page. Ask the person who shared this page to send you the files.'
    : 'Saving files works when this page is opened in claude.ai or the Claude app. If no buttons appear, ask the person who shared this page to send you the files.';
  const blockedList = [...S.blockedExt].map(e => e.toUpperCase());
  $('dlBlocked').hidden = !on || !blockedList.length;
  $('dlBlocked').textContent = blockedList.length ? `${blockedList.join(' and ')} files can't be saved here. Ask the person who shared this page to send them.` : '';
  $('dlBox').hidden = !on || customArt();
  $('dlCustom').hidden = !on || !customArt();
  $('dlPic').hidden = !on;
  $('holdHint').textContent = on ? 'You can also press and hold the picture (phone) or right-click it (computer) and choose Save.'
    : 'Press and hold the picture (phone) or right-click it (computer) and choose Save.';
  $$('[data-f]').forEach(b => { if (S.blockedExt.has(FILE_TYPES[/** @type {FileKey} */ (b.dataset.f)])) /** @type {HTMLButtonElement} */ (b).disabled = true; });
  if (S.blockedExt.has('jpg')) $btn('dlPic').disabled = true;
}

/** A second tap on the same save button within this time is the same request, not a new one. */
const REPEAT_MS = 1000;
/** @type {WeakMap<HTMLButtonElement, number>} */
const lastTap = new WeakMap();

/** @param {string} filename @param {Uint8Array<ArrayBuffer>} bytes */
function browserDownload(filename, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(filename) }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * One save. The button is off until the platform answers, so a second tap cannot start a second save.
 * @param {HTMLButtonElement} btn @param {string} filename @param {() => Uint8Array<ArrayBuffer>} makeData
 */
async function offer(btn, filename, makeData) {
  const now = Date.now();
  if (now - (lastTap.get(btn) ?? -Infinity) < REPEAT_MS) return;   // a double tap saves once
  lastTap.set(btn, now);
  if (S.dlState === 'direct') { browserDownload(filename, makeData()); toast('Downloading. Look in your Downloads.'); return; }
  if (!S.dl || btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    await S.dl.save({ filename, data: new Blob([makeData()]) });
    toast('Handed to your device: check Downloads, or finish in the share screen.');
  } catch (e) {
    const o = saveOutcome(e && typeof e === 'object' ? /** @type {{ code?: unknown }} */ (e).code : undefined, filename);
    if (o.blockExt) S.blockedExt.add(o.blockExt);
    if (o.lose) { S.dlState = 'none'; S.dlLost = true; }
    lastTap.delete(btn);   // after a failure, tapping again is a real retry
    toast(o.toast);
  } finally { btn.removeAttribute('aria-busy'); btn.disabled = false; dlUi(); }
}

export function initSaving() {
  $$('[data-f]').forEach(el => {
    const b = /** @type {HTMLButtonElement} */ (el), key = /** @type {FileKey} */ (b.dataset.f);
    b.onclick = () => { offer(b, nameOf(key), () => b64Bytes(S.files[key])); };
  });
  $btn('dlPic').onclick = () => {
    const src = $('snapImg').getAttribute('src'); if (!src) return;
    offer($btn('dlPic'), previewName(/** @type {NonNullable<typeof S.text>} */ (S.text).previewPrefix, new Date()), () => b64Bytes(src.slice(src.indexOf(',') + 1)));
  };
  if (!window.claude) S.dlState = 'direct';           // an ordinary web host: the browser downloads files itself
  else try {                                           // inside Claude: ask the platform once; never wait for it before showing the page
    // the runtime is outside this page's control: treat its answer as untyped until it proves to be a promise
    const pr = /** @type {any} */ (typeof window.claude.use === 'function' ? window.claude.use('downloads') : null);
    if (pr && typeof pr.then === 'function') pr.then((/** @type {import('./state.js').Downloads | null} */ ns) => { S.dl = ns || null; S.dlState = S.dl ? 'on' : 'none'; dlUi(); }, () => { S.dlState = 'none'; dlUi(); });
    else S.dlState = 'none';
  } catch { S.dlState = 'none'; }
  dlUi();
}
