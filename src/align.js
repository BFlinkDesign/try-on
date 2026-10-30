// @ts-check
// "Tap the arm to line it up": find the forearm under a tap and put the design along it.
import { S, P, real } from './state.js';
import { photo } from './dom.js';
import { findArm } from './lib/arm.js';
import { fmtIn } from './lib/units.js';
import { checkpoint } from './history.js';
import { drawM } from './render.js';
import { setMode } from './steps.js';
import { toast } from './toast.js';

/**
 * Looks for the arm in a 300 px wide copy of the photo, then returns the result in photo pixels.
 * @param {{ x: number, y: number }} seed tap, in photo pixels
 * @returns {import('./lib/arm.js').ArmFound | import('./lib/arm.js').ArmFail}
 */
export function detectArm(seed) {
  const r = P(), W = 300, H = Math.round(r.nh * W / r.nw), sc = r.nw / W;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x2 = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  x2.drawImage(photo, 0, 0, W, H);
  const px = x2.getImageData(0, 0, W, H).data;
  const res = findArm(px, W, H, Math.round(seed.x / sc), Math.round(seed.y / sc));
  if ('fail' in res) return res;
  return { x: res.x * sc, y: res.y * sc, ang: res.ang, width: res.width * sc, a0: res.a0 * sc, a1: res.a1 * sc };
}

/** @param {{ x: number, y: number }} p @param {boolean} ok */
function flashTap(p, ok) { S.tapMark = { p, ok }; drawM(); setTimeout(() => { S.tapMark = null; drawM(); }, 1400); }

/** @param {{ x: number, y: number }} p */
export function doAlign(p) {
  const res = detectArm(p);
  if ('fail' in res) { flashTap(p, false); toast(`${res.fail} Tap the middle of the forearm, or move and turn it by hand.`); return; }
  checkpoint();
  const r = P();
  r.axis = res; r.cx = res.x; r.cy = res.y; r.a = res.ang; r.placed = true;
  setMode('art'); flashTap(p, true);
  const width = real() ? ` The arm is about ${fmtIn(res.width / /** @type {number} */ (r.ppi))} across there.` : '';
  const tall = r.h > 0.8 * res.width ? ' It is nearly as tall as the arm is wide there.' : '';
  toast(`Lined up with the arm and centered.${width}${tall}`);
}
