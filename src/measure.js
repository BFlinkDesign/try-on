// @ts-check
// "Measure something" under More options: lines on the photo, read in inches once the size is set.
import { S, P } from './state.js';
import { $ } from './dom.js';
import { fmtIn } from './lib/units.js';
import { lenPx } from './lib/calibration.js';
import { checkpoint } from './history.js';
import { drawM, refresh } from './render.js';
import { setMode } from './steps.js';

/** @typedef {import('./lib/calibration.js').Line} Line */

/** @param {Line} L @param {{ ppiSet: boolean, ppi: number | null }} r */
export const mLabel = (L, r) => r.ppiSet ? fmtIn(lenPx(L) / /** @type {number} */ (r.ppi)) : 'size not set';

/** @param {number} i */
export function delMeasure(i) { checkpoint(); P().measures.splice(i, 1); S.sel = null; S.pending = null; refresh(); }

export function renderList() {
  const r = P(), ul = $('mlist'); if (!r) return; ul.innerHTML = '';
  r.measures.forEach((L, i) => {
    if (L === S.pending) return;
    const li = document.createElement('li'); if (i === S.sel) li.className = 'sel';
    li.innerHTML = `<span>${i + 1}.&nbsp; ${mLabel(L, r)}</span><button type="button" aria-label="Remove measurement ${i + 1}">×</button>`;
    li.onclick = ev => { if (/** @type {HTMLElement} */ (ev.target).tagName === 'BUTTON') return; if (S.mode !== 'mea') setMode('mea'); S.sel = i; drawM(); renderList(); };
    /** @type {HTMLButtonElement} */ (li.querySelector('button')).onclick = () => delMeasure(i);
    ul.appendChild(li);
  });
  $('meaClear').hidden = !r.measures.length;
}

export function initMeasure() {
  $('meaBtn').onclick = () => setMode(S.mode === 'mea' ? 'art' : 'mea');
  $('meaClear').onclick = () => { if (!P().measures.length) return; checkpoint(); P().measures = []; S.sel = null; S.pending = null; refresh(); };
}
