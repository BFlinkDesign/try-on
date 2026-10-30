// @ts-check
// Number and length formatting. Pure functions: no DOM, no state.

/**
 * Rounds to `d` decimals and always prints `d` digits.
 * @param {number} v
 * @param {number} [d]
 * @returns {string}
 */
export const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);

/**
 * Angle in degrees folded into [-180, 180).
 * @param {number} a
 * @returns {number}
 */
export const norm180 = a => ((a % 360) + 540) % 360 - 180;

/**
 * Inches as a whole number plus a reduced sixteenth: 3.37 -> `3 3/8"`, 0.5 -> `1/2"`, 6 -> `6"`.
 * Only meaningful for lengths of zero or more (every caller passes a length).
 * @param {number} v
 * @returns {string}
 */
export function fmtIn(v) {
  let w = Math.floor(v), n = Math.round((v - w) * 16);
  if (n === 16) { w++; n = 0; }
  let d = 16;
  while (n && n % 2 === 0) { n /= 2; d /= 2; }
  return `${n ? `${w ? w + ' ' : ''}${n}/${d}` : w}"`;
}

/**
 * Inches rounded to the nearest 1/8 first, then written like fmtIn (used on the picture caption).
 * @param {number} v
 * @returns {string}
 */
export const in8 = v => fmtIn(Math.round(v * 8) / 8);

/**
 * Reads a length typed by a person: `6`, `6.14`, `3 3/8"`, `1' 2-1/2"`, `2 ft`, `5 inches`.
 * Returns inches, or null when the text is not a positive length.
 * @param {unknown} t
 * @returns {number | null}
 */
export function parseLen(t) {
  t = String(t).trim().toLowerCase().replace(/inches|inch|in\b/g, '"').replace(/feet|foot|ft\b/g, "'").replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  /** @param {string} x */
  const frac = x => {
    x = x.trim().replace(/"$/, '').trim(); if (!x) return 0;
    // three exact forms, so "11/16" can never be read as 1 plus 1/16: a fraction, a whole number and a fraction with a
    // space or dash between them, or a plain (decimal) number
    let m = x.match(/^(\d+)\/(\d+)$/);
    if (m) return parseFloat(m[1]) / parseFloat(m[2]);
    m = x.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)$/);
    if (m) return parseFloat(m[1]) + parseFloat(m[2]) / parseFloat(m[3]);
    return /^\d+(?:\.\d+)?$/.test(x) ? parseFloat(x) : NaN;
  };
  const s = /** @type {string} */ (t);
  let ft = 0, inch = s;
  if (s.includes("'")) { const [f, rest] = s.split("'"); ft = frac(f); inch = rest; }
  const v = ft * 12 + frac(inch);
  return Number.isFinite(v) && v > 0 ? v : null;
}
