// @ts-check
// Taps on the photo: line up with the arm, pan and pinch, size taps (step 2), measuring, and the magnifier.
import { S, P } from './state.js';
import { $, stage, viewport, photo } from './dom.js';
import { snapPt } from './lib/snapping.js';
import { checkpoint, dropCheckpoint } from './history.js';
import { drawM, refresh } from './render.js';
import { k, pt, setZoom } from './view.js';
import { doAlign } from './align.js';
import { calUi } from './calibrate.js';
import { delMeasure, renderList } from './measure.js';

/** @typedef {import('./lib/calibration.js').Line} Line */

/** @type {Map<number, { x: number, y: number }>} */
const touches = new Map();
/** @type {{ d: number, z: number } | null} */
let pinch = null;
/** @type {{ x: number, y: number, sl: number, st: number } | null} */
let pan = null;
/** @type {{ line: Line, end: 'a' | 'b', grab?: boolean, fresh?: boolean, moved?: boolean } | null} */
let mdrag = null;

const loupe = /** @type {HTMLCanvasElement} */ ($('loupe'));
const lctx = /** @type {CanvasRenderingContext2D} */ (loupe.getContext('2d'));

/** A second end closer than this to the first (screen px) is taken as a mis-tap, not a line. */
export const MIN_LINE_SCREEN_PX = 5;

/** Drops a line whose second end was never placed. */
export function discardPending() {
  const r = P(); if (!r || !S.pending) return;
  if (r.cal === S.pending) r.cal = null;
  r.measures = r.measures.filter(L => L !== S.pending); S.pending = null;
}

/** 4x magnifier beside the finger, with a cross-hair on the exact spot. @param {{ x: number, y: number }} p */
function showLoupe(p) {
  const s = k(), W = 264, Z = 4, nat = W / 2 / (s * Z);
  lctx.imageSmoothingEnabled = false; lctx.fillStyle = '#000'; lctx.fillRect(0, 0, W, W);
  lctx.drawImage(photo, p.x - nat, p.y - nat, nat * 2, nat * 2, 0, 0, W, W);
  lctx.strokeStyle = 'rgba(255,255,255,.95)'; lctx.lineWidth = 2; lctx.beginPath();
  lctx.moveTo(W / 2, 0); lctx.lineTo(W / 2, W / 2 - 10); lctx.moveTo(W / 2, W / 2 + 10); lctx.lineTo(W / 2, W);
  lctx.moveTo(0, W / 2); lctx.lineTo(W / 2 - 10, W / 2); lctx.moveTo(W / 2 + 10, W / 2); lctx.lineTo(W, W / 2); lctx.stroke();
  let lx = p.x * s - 150, ly = p.y * s - 150;
  if (lx < viewport.scrollLeft + 4) lx = p.x * s + 18;
  if (ly < viewport.scrollTop + 4) ly = p.y * s + 18;
  loupe.style.left = lx + 'px'; loupe.style.top = ly + 'px'; loupe.hidden = false;
}
const hideLoupe = () => { loupe.hidden = true; };

export function initTaps() {
  stage.addEventListener('pointerdown', e => {
    const target = /** @type {HTMLElement | SVGElement} */ (e.target);
    if (target.closest('.art') && S.mode === 'art') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.zoom }; pan = null;
      if (mdrag && mdrag.fresh) { discardPending(); dropCheckpoint(); }
      mdrag = null; hideLoupe(); drawM(); return;
    }
    e.preventDefault(); stage.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (S.mode === 'align') { doAlign(p); return; }
    if (S.mode === 'art') { if (S.zoom > 1) { pan = { x: e.clientX, y: e.clientY, sl: viewport.scrollLeft, st: viewport.scrollTop }; stage.classList.add('panning'); } return; }
    const r = P(), ds = target.dataset || {};
    if (S.mode === 'mea' && ds.del !== undefined && !S.pending) { delMeasure(+ds.del); return; }
    if (S.mode === 'mea' && ds.sel !== undefined && !S.pending) { S.sel = +ds.sel; drawM(); renderList(); return; }
    S.sel = null;
    if (ds.end && !S.pending) {
      checkpoint(); const [kind, idx, end] = ds.end.split(':');
      mdrag = { line: /** @type {Line} */ (kind === 'cal' ? r.cal : r.measures[+idx]), end: /** @type {'a' | 'b'} */ (end), grab: true };
    } else if (!S.pending) {
      checkpoint(); S.shortTap = false;
      const line = { a: p, b: { ...p } };
      S.pending = line;
      if (S.mode === 'cal') r.cal = line; else r.measures.push(line);
      mdrag = { line, end: 'b', fresh: true };
    } else {
      const b = snapPt(S.pending.a, p, e.shiftKey);
      if (Math.hypot(b.x - S.pending.a.x, b.y - S.pending.a.y) * k() < MIN_LINE_SCREEN_PX) {
        // the second tap is on top of the first: no line (a zero-length line would make every inch wrong); start fresh
        discardPending(); dropCheckpoint(); S.shortTap = true; hideLoupe(); calUi(); drawM(); return;
      }
      S.pending.b = b; mdrag = { line: S.pending, end: 'b' }; S.pending = null;
    }
    showLoupe(p); calUi(); drawM();
  });
  stage.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
    if (pan) { viewport.scrollLeft = pan.sl - (e.clientX - pan.x); viewport.scrollTop = pan.st - (e.clientY - pan.y); return; }
    if (S.mode !== 'cal' && S.mode !== 'mea') return;
    const p = pt(e);
    if (mdrag) {
      const other = mdrag.end === 'a' ? mdrag.line.b : mdrag.line.a;
      mdrag.line[mdrag.end] = snapPt(other, p, e.shiftKey); mdrag.moved = true;
      showLoupe(mdrag.line[mdrag.end]); calUi(); drawM(); renderList();
    } else if (S.pending) { S.pending.b = snapPt(S.pending.a, p, e.shiftKey); drawM(); }
  });
  /** @param {PointerEvent} e */
  const endStage = e => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; return; }
    if (pan) { pan = null; stage.classList.remove('panning'); return; }
    if (mdrag && mdrag.grab && !mdrag.moved) dropCheckpoint();
    // a first tap that wobbled a little is still a tap (wait for the other end); a real drag draws the whole line
    if (mdrag && mdrag.fresh && mdrag.moved && Math.hypot(mdrag.line.b.x - mdrag.line.a.x, mdrag.line.b.y - mdrag.line.a.y) * k() >= MIN_LINE_SCREEN_PX) S.pending = null;
    mdrag = null; hideLoupe(); refresh();
  };
  stage.addEventListener('pointerup', endStage); stage.addEventListener('pointercancel', endStage);
}
