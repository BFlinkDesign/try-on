// @ts-check
// The four steps (photo, size, place, save) and the tap modes on the photo.
import { S, P, real } from './state.js';
import { $, $in, $$, stage } from './dom.js';
import { progUi, refresh } from './render.js';
import { discardPending } from './taps.js';

/** @param {number} n */
export function goStep(n) {
  S.step = Math.max(1, Math.min(4, n));
  $$('[data-step]').forEach(el => { el.hidden = +(el.dataset.step ?? 0) !== S.step; });
  if (S.step === 2) setMode(real() ? 'art' : 'cal');
  else if (S.step === 3 && !P().placed) setMode('align');
  else setMode('art');
  progUi();
}

/** @param {import('./state.js').Mode} m */
export function setMode(m) {
  if (S.pending) discardPending();
  S.mode = m; S.sel = null;
  stage.classList.toggle('tapping', m !== 'art');
  /** @type {Record<string, string>} */
  const banners = { cal: `Tap one end of ${S.refWhat}, then the other end.`, align: 'First tap the arm where the tattoo goes. Then drag the dots to adjust.', mea: 'Measuring: tap two points. Tap a line, then its red × to remove it.' };
  const ban = banners[m];
  if (ban) { $('bannerMsg').textContent = ban; $('bannerBtn').textContent = m === 'mea' ? 'Done' : 'Cancel'; $('banner').hidden = false; } else $('banner').hidden = true;
  if (ban && S.booted) {                                 // a tap is needed on the photo: make sure the photo is on screen
    const work = $$('.work')[0], w = work.getBoundingClientRect();
    if (w.top < 0 || w.top > window.innerHeight * 0.5) work.scrollIntoView({ block: 'start' });
  }
  $('meaBtn').textContent = m === 'mea' ? 'Done measuring' : 'Measure on the photo';
  if (P()) refresh();
}

export function initSteps() {
  $$('[data-next]').forEach(b => { b.onclick = () => goStep(S.step + 1); });
  $$('[data-back]').forEach(b => { b.onclick = () => goStep(S.step - 1); });
  $$('.prog button').forEach(b => { b.onclick = () => goStep(+(b.dataset.go ?? 0)); });
  $('skipSize').onclick = () => goStep(3);
  $('another').onclick = () => { goStep(1); $in('photoInput').click(); };
  $('bannerBtn').onclick = () => setMode('art');
}
