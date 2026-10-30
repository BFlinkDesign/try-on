// @ts-check
// Step 3 buttons, the exact-size fields under More options, and keyboard shortcuts.
import { S, P, real } from './state.js';
import { $, $in, art } from './dom.js';
import { checkpoint, undo, redo } from './history.js';
import { render, fill } from './render.js';
import { setMode } from './steps.js';
import { k } from './view.js';
import { delMeasure } from './measure.js';

/** @typedef {import('./state.js').PhotoRecord} PhotoRecord */

/** One undo step, then the change, then the design counts as placed. @param {(r: PhotoRecord) => void} fn */
const act = fn => () => { checkpoint(); fn(P()); P().placed = true; render(); };
/** @param {number} f @returns {(r: PhotoRecord) => void} */
const scaleBy = f => r => { r.w *= f; r.h *= f; };

let typing = false;                                    // one undo step per field edit, not per keystroke
/** @param {() => void} fn */
function edit(fn) { return () => { if (!typing) { checkpoint(); typing = true; } fn(); P().placed = true; render(); }; }
/** @param {HTMLInputElement} el */
const num = el => { const v = parseFloat(el.value); return Number.isFinite(v) ? v : null; };

export function initControls() {
  $('smaller').onclick = act(scaleBy(1 / 1.05)); $('bigger').onclick = act(scaleBy(1.05));
  $('turnL').onclick = act(r => { r.a -= 5; }); $('turnR').onclick = act(r => { r.a += 5; });
  $('flip').onclick = act(r => { r.flip = !r.flip; });
  $('unflip').onclick = act(r => { r.flip = false; });
  $('fixShape').onclick = act(r => { r.h = r.w / S.artAspect; });
  $('center').onclick = act(r => { if (r.axis) { r.cx = r.axis.x; r.cy = r.axis.y; } else { r.cx = r.nw / 2; r.cy = r.nh / 2; } });
  $('trueSize').onclick = act(r => { r.w = /** @type {number} */ (S.artTrueIn) * /** @type {number} */ (r.ppi); r.h = r.w / S.artAspect; });
  $('alignBtn').onclick = () => setMode('align');

  $in('wIn').addEventListener('input', edit(() => { const v = num($in('wIn')), r = P(); if (!v || v <= 0 || !real()) return; const w = v * /** @type {number} */ (r.ppi); if ($in('lock').checked) r.h *= w / r.w; r.w = w; }));
  $in('hIn').addEventListener('input', edit(() => { const v = num($in('hIn')), r = P(); if (!v || v <= 0 || !real()) return; const h = v * /** @type {number} */ (r.ppi); if ($in('lock').checked) r.w *= h / r.h; r.h = h; }));
  $in('xIn').addEventListener('input', edit(() => { const v = num($in('xIn')); if (v !== null && real()) P().cx = v * /** @type {number} */ (P().ppi); }));
  $in('yIn').addEventListener('input', edit(() => { const v = num($in('yIn')); if (v !== null && real()) P().cy = v * /** @type {number} */ (P().ppi); }));
  $in('rDeg').addEventListener('input', edit(() => { const v = num($in('rDeg')); if (v !== null) P().a = v; }));
  ['wIn', 'hIn', 'xIn', 'yIn', 'rDeg'].forEach(id => $(id).addEventListener('blur', () => { typing = false; fill(); }));
  $in('opacity').addEventListener('input', render);
  $in('guides').addEventListener('change', () => { art.classList.toggle('hide-guides', !$in('guides').checked); render(); });

  document.addEventListener('keydown', e => {
    if (!P()) return;                                  // still loading: no photo yet (the single-file page had no such wait)
    const ae = /** @type {HTMLInputElement} */ (document.activeElement);
    const inField = /INPUT|TEXTAREA/.test(ae.tagName) && !['checkbox', 'range', 'file'].includes(ae.type);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !inField) { e.preventDefault(); redo(); return; }
    if (inField) return;
    if (e.key === 'Escape') { setMode('art'); return; }
    if (S.mode === 'mea' && S.sel !== null && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); delMeasure(S.sel); return; }
    if (S.mode !== 'art') return;
    const r = P(), stepPx = real() ? (e.shiftKey ? 0.25 : 1 / 16) * /** @type {number} */ (r.ppi) : (e.shiftKey ? 10 : 1) / k();
    /** @type {Record<string, [number, number]>} */
    const moves = { ArrowLeft: [-stepPx, 0], ArrowRight: [stepPx, 0], ArrowUp: [0, -stepPx], ArrowDown: [0, stepPx] };
    if (moves[e.key]) { e.preventDefault(); checkpoint(); r.cx += moves[e.key][0]; r.cy += moves[e.key][1]; r.placed = true; render(); }
    if (e.key === '[' || e.key === ']') { e.preventDefault(); checkpoint(); r.a += e.key === ']' ? 1 : -1; r.placed = true; render(); }
  });
}
