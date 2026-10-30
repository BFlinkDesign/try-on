// @ts-check
// Step 4: the picture, made at the photo's full size as a JPEG with a caption strip under the photo.
import { S, P } from './state.js';
import { $, $in, loadImg } from './dom.js';
import { RAD } from './lib/geometry.js';
import { picNotes } from './lib/captions.js';
import { snapState } from './history.js';
import { progUi } from './render.js';

/** Everything the picture depends on: the photo, its placement, the ink darkness and the design. */
export function picState() { return P().id + '|' + snapState() + '|' + $in('opacity').value + '|' + S.artGen; }

export function clearPic() {
  const img = /** @type {HTMLImageElement} */ ($('snapImg'));
  S.picKey = null; $('snapOut').hidden = true; img.removeAttribute('src'); delete img.dataset.notes;
}

export async function makePicture() {
  const r = P(), [bg, fg] = await Promise.all([loadImg(r.src), loadImg(S.artSrc)]);
  const notes = picNotes(r, S.artAspect);
  const m = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
  let fs = Math.max(14, Math.round(Math.min(r.nw, r.nh) * 0.032));
  const font = () => `600 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  m.font = font(); while (fs > 10 && Math.max(...notes.map(t => m.measureText(t).width)) > r.nw - fs * 1.4) { fs--; m.font = font(); }
  const pad = Math.round(fs * 0.7), lh = Math.round(fs * 1.35), bh = pad * 2 + lh * (notes.length - 1) + fs;
  const c = document.createElement('canvas'); c.width = r.nw; c.height = r.nh + bh;   // caption strip under the photo
  const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  x.drawImage(bg, 0, 0, r.nw, r.nh);
  x.save(); x.translate(r.cx, r.cy); x.rotate(r.a * RAD); if (r.flip) x.scale(-1, 1);
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = parseFloat($in('opacity').value);
  x.drawImage(fg, -r.w / 2, -r.h / 2, r.w, r.h); x.restore();
  // caption strip so a saved picture says what it is
  x.fillStyle = '#1b1922'; x.fillRect(0, r.nh, r.nw, bh);
  x.font = font(); x.fillStyle = '#ffffff'; x.textBaseline = 'top'; notes.forEach((t, i) => x.fillText(t, pad, r.nh + pad + i * lh));
  const img = /** @type {HTMLImageElement} */ ($('snapImg'));
  img.src = c.toDataURL('image/jpeg', 0.9); img.dataset.notes = notes.join(' | ');
  S.picKey = picState(); $('snapOut').hidden = false; progUi();
}

export function initPicture() { $('snapBtn').onclick = makePicture; }
