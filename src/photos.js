// @ts-check
// Adding and switching photos, replacing the design, removing a photo and starting over.
import { S, P, newRecord, sampleRecord } from './state.js';
import { $, $in, artImg, photo, stage, loadImg } from './dom.js';
import { clearHistory } from './history.js';
import { render, refresh } from './render.js';
import { goStep } from './steps.js';
import { layout, setZoom } from './view.js';
import { clearPic } from './picture.js';
import { dlUi } from './saving.js';
import { toast } from './toast.js';

/** @param {Blob} f @returns {Promise<string>} */
const readFile = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(/** @type {string} */ (fr.result)); fr.onerror = rej; fr.readAsDataURL(f); });

/** Photos under this many pixels on the short side are refused: too coarse to place a tattoo by the 1/16 in. */
export const MIN_PHOTO_SHORT_PX = 600;
class TooSmall extends Error {}

/** Photos are kept at most 2000 px on the long side, as JPEG. @param {string} src @param {number} [max] */
async function shrink(src, max = 2000) {
  const i = await loadImg(src);
  if (Math.min(i.naturalWidth, i.naturalHeight) < MIN_PHOTO_SHORT_PX) throw new TooSmall();
  const sc = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * sc); c.height = Math.round(i.naturalHeight * sc);
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(i, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/jpeg', 0.88), nw: c.width, nh: c.height };
}

/**
 * Swaps the design shown on the photos. `trueIn` is its real width in inches, or null for a design she uploaded.
 * @param {string} src @param {number} aspect @param {number | null} trueIn
 */
function setDesign(src, aspect, trueIn) {
  S.artSrc = src; artImg.src = src; S.artAspect = aspect; S.artTrueIn = trueIn; S.artGen++;
}

export function thumbs() {
  const t = $('thumbs'); t.innerHTML = '';
  if (S.photos.length < 2) return;
  S.photos.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'thumb'; b.type = 'button'; b.setAttribute('aria-label', `Photo ${i + 1}${r.ppiSet ? ', size set' : ''}`);
    b.setAttribute('aria-current', i === S.cur ? 'true' : 'false');
    b.innerHTML = `<img alt="" src="${r.src}">${r.ppiSet ? '<span class="dot"></span>' : ''}`;
    b.onclick = () => select(i);
    t.appendChild(b);
  });
}

/** @param {number} i */
export function select(i) { S.cur = i; layout(); photo.src = P().src; thumbs(); goStep(S.step); if (photo.complete && photo.naturalWidth) refresh(); }

/** @type {Record<string, { txt: string | null, t: ReturnType<typeof setTimeout> }>} */
const armed = {};
/** A destructive button needs a second tap within 3 s. @param {HTMLElement} btn @param {string} label @param {() => void} fn */
function twoTap(btn, label, fn) {
  const a = armed[btn.id];
  if (a) { clearTimeout(a.t); btn.textContent = a.txt; delete armed[btn.id]; fn(); return; }
  armed[btn.id] = { txt: btn.textContent, t: setTimeout(() => { btn.textContent = armed[btn.id].txt; delete armed[btn.id]; }, 3000) };
  btn.textContent = label;
}

export function initPhotos() {
  photo.addEventListener('load', refresh);
  new ResizeObserver(() => render()).observe(stage);
}

export function initPhotoInputs() {
  $in('photoInput').addEventListener('change', async e => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const files = [...(input.files ?? [])]; input.value = ''; let first = null;
    /** @type {string[]} */ const bad = [];
    /** @type {string[]} */ const small = [];
    // her first own photo replaces the starting sample photo (it was only there to show how the page works)
    const onlySample = S.photos.length > 0 && S.photos.every(r => r.src === S.assets.sample);
    for (const f of files) {
      try { const s = await shrink(await readFile(f)); S.photos.push(newRecord(s.src, s.nw, s.nh)); if (first === null) first = S.photos.length - 1; }
      catch (err) { (err instanceof TooSmall ? small : bad).push(f.name); }
    }
    if (first !== null && onlySample) {
      const n = S.photos.filter(r => r.src === S.assets.sample).length;
      S.photos = S.photos.filter(r => r.src !== S.assets.sample); first -= n; clearHistory();
    }
    if (small.length) toast(`${small.join(', ')} is too small. Use a photo at least ${MIN_PHOTO_SHORT_PX} pixels on its short side (any phone camera photo is).`);
    else if (bad.length) toast(`Could not open ${bad.join(', ')}. Use JPG or PNG photos.`);
    if (first !== null) { S.step = 2; select(first); if (!small.length && !bad.length) toast('Photo added. Now set the real size.'); }
  });
  $in('artInput').addEventListener('change', async e => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const f = input.files?.[0]; input.value = ''; if (!f) return;
    try {
      const src = await readFile(f), i = await loadImg(src);
      setDesign(src, i.naturalWidth / i.naturalHeight, null);
      S.photos.forEach(r => { r.h = r.w / S.artAspect; });
      clearHistory(); render(); dlUi();
      toast('Design replaced. Its real size is not known, so type its width under Exact size.');
    } catch { toast(`Could not open ${f.name} as a design. Use a PNG, JPG or SVG.`); }
  });
  $('origArt').onclick = () => {
    setDesign(S.assets.art, S.designIn.w / S.designIn.h, S.designIn.w);
    S.photos.forEach(r => { r.h = r.w / S.artAspect; });
    clearHistory(); render(); dlUi(); toast('Back to the original design. Your photos are kept.');
  };
  $('removePhoto').onclick = e => twoTap(/** @type {HTMLElement} */ (e.currentTarget), 'Tap again to remove', () => {
    S.photos.splice(S.cur, 1); clearHistory();
    if (!S.photos.length) S.photos.push(sampleRecord());
    select(Math.min(S.cur, S.photos.length - 1));
  });
  $('startOver').onclick = e => twoTap(/** @type {HTMLElement} */ (e.currentTarget), 'Tap again to clear everything', () => {
    setDesign(S.assets.art, S.designIn.w / S.designIn.h, S.designIn.w);
    S.photos = [sampleRecord()]; clearHistory(); setZoom(1); clearPic(); /** @type {HTMLDetailsElement} */ ($('more')).open = false;
    S.step = 1; select(0); dlUi(); toast('Cleared. Back to the starting photo.');
  });
}
