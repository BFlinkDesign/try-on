// @ts-check
// Zoom and pan of the photo, and converting pointer positions to photo pixels.
import { S, P } from './state.js';
import { $, stage, viewport, photo } from './dom.js';
import { render } from './render.js';

/** Screen pixels per photo pixel. */
export const k = () => photo.clientWidth / P().nw;

/**
 * Pointer position in photo pixels.
 * @param {{ clientX: number, clientY: number }} e
 */
export function pt(e) { const b = stage.getBoundingClientRect(), s = k(); return { x: (e.clientX - b.left) / s, y: (e.clientY - b.top) / s }; }

/** Width of the whole photo at 100%: fits the column and at most 78% of the window's height (900 px cap). */
export function baseWidth() {
  const r = P(), mh = Math.min(window.innerHeight * 0.78, 900);
  return Math.max(120, Math.min(viewport.clientWidth, r ? mh * r.nw / r.nh : viewport.clientWidth));
}
export function layout() { if (P()) stage.style.width = (baseWidth() * S.zoom) + 'px'; }

/**
 * Zoom between 100% and 600%, keeping the point at (fx, fy) of the visible area still.
 * @param {number} z
 * @param {number} [fx]
 * @param {number} [fy]
 */
export function setZoom(z, fx = 0.5, fy = 0.5) {
  z = Math.min(6, Math.max(1, z));
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const px = (viewport.scrollLeft + vw * fx) / stage.clientWidth, py = (viewport.scrollTop + vh * fy) / stage.clientHeight;
  S.zoom = z; stage.style.width = (baseWidth() * z) + 'px';
  viewport.scrollLeft = px * stage.clientWidth - vw * fx; viewport.scrollTop = py * stage.clientHeight - vh * fy;
  $('zLbl').textContent = Math.round(z * 100) + '%';
  render();
}

export function initView() {
  new ResizeObserver(() => layout()).observe(viewport);
  window.addEventListener('resize', layout);
  $('zIn').onclick = () => setZoom(S.zoom * 1.5); $('zOut').onclick = () => setZoom(S.zoom / 1.5); $('zFit').onclick = () => setZoom(1);
  viewport.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); const b = viewport.getBoundingClientRect();
    setZoom(S.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
  }, { passive: false });
}
