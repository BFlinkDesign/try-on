// @ts-check
// Undo and redo of placement, size and measuring, per photo. Up to 150 steps back.
import { S, P, GEOM } from './state.js';
import { $btn, photo } from './dom.js';
import { refresh } from './render.js';
import { thumbs } from './photos.js';

/** @type {string[]} */
const hist = [];
/** @type {string[]} */
const fut = [];

export const snapState = () => JSON.stringify({ i: S.cur, g: Object.fromEntries(GEOM.map(x => [x, P()[x]])) });
export function checkpoint() { hist.push(snapState()); if (hist.length > 150) hist.shift(); fut.length = 0; undoUi(); }
export function dropCheckpoint() { hist.pop(); undoUi(); }
/** @param {string} s */
function restore(s) {
  const o = JSON.parse(s);
  if (!S.photos[o.i]) return;
  if (o.i !== S.cur) { S.cur = o.i; photo.src = P().src; }
  Object.assign(P(), o.g); S.sel = null; S.pending = null; thumbs(); refresh();
}
export function undo() { const s = hist.pop(); if (s === undefined) return; fut.push(snapState()); restore(s); undoUi(); }
export function redo() { const s = fut.pop(); if (s === undefined) return; hist.push(snapState()); restore(s); undoUi(); }
export function undoUi() { $btn('undoBtn').disabled = $btn('undo2').disabled = !hist.length; $btn('redoBtn').disabled = !fut.length; }
export function clearHistory() { hist.length = 0; fut.length = 0; undoUi(); }

export function initHistory() {
  $btn('undoBtn').onclick = undo; $btn('undo2').onclick = undo; $btn('redoBtn').onclick = redo;
}
