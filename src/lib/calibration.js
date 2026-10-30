// @ts-check
// Real scale from two taps on an object of known length.

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ a: Pt, b: Pt }} Line */

/**
 * Length of a line in photo pixels.
 * @param {Line} L
 */
export const lenPx = L => Math.hypot(L.b.x - L.a.x, L.b.y - L.a.y);

/**
 * Scale after measuring `line` as `inches` long. If the photo already had a scale, the design keeps its size in inches;
 * otherwise a design of known real width (`artTrueIn`) is shown at that width. Height always follows `aspect`.
 * @param {{ ppi: number | null, ppiSet: boolean, w: number, h: number }} r
 * @param {Line} line
 * @param {number} inches
 * @param {number | null} artTrueIn
 * @param {number} aspect
 * @returns {{ ppi: number, ppiSet: true, w: number, h: number }}
 */
export function applyScale(r, line, inches, artTrueIn, aspect) {
  const wIn = r.ppiSet && r.ppi ? r.w / r.ppi : null;
  const ppi = lenPx(line) / inches;
  let w = r.w, h = r.h;
  if (wIn !== null) { w = wIn * ppi; h = w / aspect; }
  else if (artTrueIn) { w = artTrueIn * ppi; h = w / aspect; }   // show the design at its real size
  return { ppi, ppiSet: true, w, h };
}
