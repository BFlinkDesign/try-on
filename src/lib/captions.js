// @ts-check
// The caption strip under a saved picture, so a picture says what it is.
import { in8 } from './units.js';
import { stretched } from './geometry.js';

/**
 * @param {{ ppiSet: boolean, ppi: number | null, w: number, h: number, flip: boolean }} r
 * @param {number} aspect the design's own width-to-height ratio
 * @returns {string[]}
 */
export function picNotes(r, aspect) {
  const n = [];
  if (r.ppiSet && r.ppi) n.push(`About ${in8(r.w / r.ppi)} wide × ${in8(r.h / r.ppi)} tall on the arm (measured from the photo)`);
  else n.push('Size not measured: not true size');
  if (stretched(r, aspect)) n.push('Stretched out of shape: not the real proportions');
  if (r.flip) n.push('Mirrored: the writing reads backwards');
  return n;
}
