// @ts-check
// Drawing the screen from state: the design's box, the number fields, the step progress and the measuring overlay.
import { S, P, real } from './state.js';
import { $, $in, $btn, $$, art, artImg, photo } from './dom.js';
import { artBox, stretched, RAD } from './lib/geometry.js';
import { fmt, fmtIn, norm180 } from './lib/units.js';
import { k } from './view.js';
import { clearPic, picState } from './picture.js';
import { save } from './storage.js';
import { renderList, mLabel } from './measure.js';
import { calUi, knownLen } from './calibrate.js';

export function render() {
  const r = P(); if (!r || !photo.clientWidth) return;
  const b = artBox(r, k());
  art.style.width = b.width + 'px'; art.style.height = b.height + 'px';
  art.classList.toggle('no-wtabs', b.noWTabs); art.classList.toggle('no-htabs', b.noHTabs);
  art.style.transform = `translate(${b.tx}px, ${b.ty}px) rotate(${r.a}deg)`;
  artImg.style.transform = r.flip ? 'scaleX(-1)' : '';
  artImg.style.opacity = $in('opacity').value;
  fill(); drawM();
  if (S.picKey !== null && S.picKey !== picState()) clearPic();   // a picture is only shown while it matches the screen
  progUi(); save();
}
export const refresh = () => { render(); renderList(); calUi(); };

export function fill() {
  const r = P(), act = document.activeElement;
  /** @param {HTMLInputElement} el @param {string} v */
  const set = (el, v) => { if (act !== el) el.value = v; };
  const fields = ['wIn', 'hIn', 'xIn', 'yIn'].map($in);
  fields.forEach(el => { el.disabled = !real(); el.placeholder = real() ? '' : 'set size first'; });
  if (real()) {
    const ppi = /** @type {number} */ (r.ppi);
    set($in('wIn'), fmt(r.w / ppi)); set($in('hIn'), fmt(r.h / ppi)); set($in('xIn'), fmt(r.cx / ppi, 1)); set($in('yIn'), fmt(r.cy / ppi, 1));
  } else fields.forEach(el => { el.value = ''; });
  set($in('rDeg'), fmt(norm180(r.a), 0));
  $btn('trueSize').disabled = !(real() && S.artTrueIn);
  $('sizeReadout').innerHTML = real()
    ? `Size on the arm: <span class="readout">${fmtIn(r.w / /** @type {number} */ (r.ppi))} wide × ${fmtIn(r.h / /** @type {number} */ (r.ppi))} tall</span>`
    : 'No real size yet. Go back to step 2 to measure, or size it by eye.';
  $('sizeReadout').className = real() ? 'note ok' : 'note warn';
  $('stretchNote').hidden = !stretched(r, S.artAspect);
  $('flipNote').hidden = !r.flip;
}

export function progUi() {
  const r = P();
  /** @type {Record<number, boolean>} */
  const done = { 1: S.photos.length > 0, 2: r.ppiSet, 3: r.placed, 4: !$('snapOut').hidden };
  $$('.prog button').forEach(b => {
    const n = +(b.dataset.go ?? 0);
    b.classList.toggle('done', !!done[n] && n !== S.step);
    if (n === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  $('photoCount').textContent = S.photos.length > 1 ? `${S.photos.length} photos. Tap one under the picture to switch.` : 'You can add more than one photo and switch between them.';
}

// ================= overlay: arm line, snap guides, tap mark, size and measure lines =================
/** @typedef {import('./lib/calibration.js').Line} Line */
export function drawM() {
  const g = $('mlayer'), r = P(); g.innerHTML = ''; if (!r || !photo.clientWidth) return;
  const s = k(), ns = 'http://www.w3.org/2000/svg';
  /**
   * @param {string} n
   * @param {Record<string, string | number>} a
   * @param {Element} [parent]
   */
  const el = (n, a, parent = g) => { const e = document.createElementNS(ns, n); for (const kk in a) e.setAttribute(kk, String(a[kk])); parent.appendChild(e); return e; };
  const showGuides = $in('guides').checked;
  if (r.axis && S.mode === 'art' && showGuides) {
    const ux = Math.cos(r.axis.ang * RAD), uy = Math.sin(r.axis.ang * RAD);
    el('line', { class: 'axis' + (S.guides.includes('axis') ? ' hot' : ''), x1: (r.axis.x + ux * r.axis.a0) * s, y1: (r.axis.y + uy * r.axis.a0) * s, x2: (r.axis.x + ux * r.axis.a1) * s, y2: (r.axis.y + uy * r.axis.a1) * s });
  }
  if (S.guides.includes('vc')) el('line', { class: 'guide', x1: r.nw / 2 * s, y1: 0, x2: r.nw / 2 * s, y2: r.nh * s });
  if (S.guides.includes('hc')) el('line', { class: 'guide', x1: 0, y1: r.nh / 2 * s, x2: r.nw * s, y2: r.nh / 2 * s });
  if (S.tapMark) el('circle', { class: 'tapmark' + (S.tapMark.ok ? '' : ' bad'), cx: S.tapMark.p.x * s, cy: S.tapMark.p.y * s, r: 16 });
  /** @param {Line} L @param {'cal' | 'mea'} cls @param {number} idx @param {string} label */
  const drawLine = (L, cls, idx, label) => {
    const isSel = cls === 'mea' && idx === S.sel;
    const grp = el('g', { class: cls + (isSel ? ' sel' : '') });
    const ax = L.a.x * s, ay = L.a.y * s, bx = L.b.x * s, by = L.b.y * s;
    el('line', { x1: ax, y1: ay, x2: bx, y2: by }, grp);
    const d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d * 8, ny = (bx - ax) / d * 8;
    el('line', { class: 'tick', x1: ax - nx, y1: ay - ny, x2: ax + nx, y2: ay + ny }, grp);
    el('line', { class: 'tick', x1: bx - nx, y1: by - ny, x2: bx + nx, y2: by + ny }, grp);
    const live = (cls === 'mea' && S.mode === 'mea') || (cls === 'cal' && S.mode === 'cal');
    if (cls === 'mea' && L !== S.pending) el('line', { class: 'hit', x1: ax, y1: ay, x2: bx, y2: by, 'data-sel': idx, style: `pointer-events:${live ? 'stroke' : 'none'}` }, grp);
    if (label && d > 24) { const t = el('text', { x: (ax + bx) / 2 + nx * 2.2, y: (ay + by) / 2 + ny * 2.2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, grp); t.textContent = label; }
    if (live && (L !== S.pending || cls === 'cal')) {
      el('circle', { class: 'end', cx: ax, cy: ay, r: 10, 'data-end': `${cls}:${idx}:a`, style: 'pointer-events:auto' }, grp);
      el('circle', { class: 'end', cx: bx, cy: by, r: 10, 'data-end': `${cls}:${idx}:b`, style: 'pointer-events:auto' }, grp);
      // invisible 44 px tap areas over the end dots (drawn last, so they take the taps)
      el('circle', { class: 'hit', cx: ax, cy: ay, r: 22, 'data-end': `${cls}:${idx}:a`, style: 'pointer-events:auto' }, grp);
      el('circle', { class: 'hit', cx: bx, cy: by, r: 22, 'data-end': `${cls}:${idx}:b`, style: 'pointer-events:auto' }, grp);
    }
    if (isSel && live) {
      const dg = el('g', { class: 'del' }, grp), mx = (ax + bx) / 2 - nx * 2.8, my = (ay + by) / 2 - ny * 2.8;
      el('circle', { cx: mx, cy: my, r: 15, 'data-del': idx, style: 'pointer-events:auto' }, dg);
      const t = el('text', { x: mx, y: my + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, dg); t.textContent = '×';
    }
  };
  if (S.mode === 'cal' && r.cal) { const kl = knownLen(); drawLine(r.cal, 'cal', 0, !S.pending && kl ? fmtIn(kl) : ''); }
  if (S.mode !== 'cal' && (S.mode === 'mea' || showGuides)) r.measures.forEach((L, i) => drawLine(L, 'mea', i, L === S.pending ? '' : mLabel(L, r)));
}
