// @ts-check
// Dragging the design: move it, a corner dot scales it diagonally, a side tab stretches one way, the round dot turns it.
import { S, P } from './state.js';
import { $in, art } from './dom.js';
import { startResize, resizeTo, turnToward } from './lib/geometry.js';
import { snapCenter, snapAngle } from './lib/snapping.js';
import { checkpoint, dropCheckpoint } from './history.js';
import { render } from './render.js';
import { k, pt } from './view.js';

/**
 * @typedef {{ mode: 'rot', moved?: boolean }
 *   | ({ mode: 'size', moved?: boolean } & import('./lib/geometry.js').Resize)
 *   | { mode: 'move', dx: number, dy: number, moved?: boolean }} Drag
 */
/** @type {Drag | null} */
let drag = null;

/** Snapping is on unless switched off under More options or Alt is held. @param {{ altKey: boolean }} e */
const snapOn = e => $in('snapOn').checked && !e.altKey;

export function initDrag() {
  art.addEventListener('pointerdown', e => {
    if (S.mode !== 'art') return;
    e.preventDefault(); e.stopPropagation();
    const r = P(), p = pt(e), t = /** @type {HTMLElement} */ (e.target);
    art.setPointerCapture(e.pointerId); checkpoint();
    if (t.closest('[data-rot]')) drag = { mode: 'rot' };
    else if (t.dataset.c) drag = { mode: 'size', ...startResize(r, t.dataset.c) };
    else drag = { mode: 'move', dx: p.x - r.cx, dy: p.y - r.cy };
  });
  art.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = P(), p = pt(e); drag.moved = true;
    if (drag.mode === 'move') {
      const q = snapCenter(p.x - drag.dx, p.y - drag.dy, { axis: r.axis, nw: r.nw, nh: r.nh, tol: 9 / k(), on: snapOn(e) });
      S.guides = q.guides; r.cx = q.x; r.cy = q.y;
    } else if (drag.mode === 'rot') {
      const q = snapAngle(turnToward({ x: r.cx, y: r.cy }, p), { axis: r.axis, on: snapOn(e) });
      S.guides = q.guides; r.a = q.a;
    } else {
      const q = resizeTo(drag, r.a, p, r.w, r.h);
      r.w = q.w; r.h = q.h; r.cx = q.cx; r.cy = q.cy;
    }
    r.placed = true; render();
  });
  const endDrag = () => { if (drag && !drag.moved) dropCheckpoint(); drag = null; S.guides = []; render(); };
  art.addEventListener('pointerup', endDrag); art.addEventListener('pointercancel', endDrag);
}
