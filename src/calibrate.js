// @ts-check
// Step 2: real size from an object of known length lying on the arm (card 3.370", bill 6.14", quarter 0.955", ruler).
import { S, P } from './state.js';
import { $, $in, $btn, $$ } from './dom.js';
import { parseLen, fmt, fmtIn } from './lib/units.js';
import { lenPx, applyScale } from './lib/calibration.js';
import { checkpoint } from './history.js';
import { drawM } from './render.js';
import { setMode } from './steps.js';
import { thumbs } from './photos.js';
import { toast } from './toast.js';

/** Inches between the two taps: the chosen object's length, or the typed length for a ruler. */
export const knownLen = () => S.refLen || parseLen($in('calLen').value);

export function calUi() {
  const r = P(); if (!r) return;
  $('sizeChoose').hidden = r.ppiSet; $('sizeDone').hidden = !r.ppiSet;
  if (r.ppiSet) {
    $('sizeDoneMsg').innerHTML = `Size is set for this photo.${S.artTrueIn ? ` The tattoo is shown at its real <b>${fmt(S.artTrueIn)}"</b> width.` : ''}`;
    return;
  }
  const done = r.cal && !S.pending && lenPx(r.cal) > 5, L = knownLen();
  $('calApply').hidden = !done; $btn('calApply').disabled = !L;
  // the length is stated only together with the button that uses it
  $('calNote').textContent = !r.cal ? (S.shortTap ? 'Tap the other end, a bit away from the first. Start again: tap one end.' : `On the photo, tap one end of ${S.refWhat}. A magnifier shows exactly where your finger is.`)
    : S.pending ? 'Now tap the other end.'
    : !done ? 'Tap the other end, a bit away from the first.'
    : !L ? 'Type the length between the two marks above.'
    : `That line is ${fmtIn(L)}. Drag either dot to fine-tune it, then tap Use this size.`;
}

export function initCalibrate() {
  const choices = $$('#refChoices .choice');
  choices.forEach(b => {
    b.onclick = () => {
      choices.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      S.refLen = b.dataset.len ? parseFloat(b.dataset.len) : null; S.refWhat = b.dataset.what ?? '';
      $('customWrap').hidden = !!S.refLen;
      setMode('cal'); calUi();
    };
  });
  $in('calLen').addEventListener('input', () => { calUi(); drawM(); });
  $('calApply').onclick = () => {
    const r = P(), L = knownLen(); if (!r.cal || !L) return;
    checkpoint();
    Object.assign(r, applyScale(r, r.cal, L, S.artTrueIn, S.artAspect));
    thumbs(); setMode('art'); calUi(); toast('Size set. Next, put it on the arm.');
  };
  $('calReset').onclick = () => { checkpoint(); const r = P(); r.ppi = null; r.ppiSet = false; r.cal = null; S.pending = null; thumbs(); setMode('cal'); };
}
