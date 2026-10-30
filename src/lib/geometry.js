// @ts-check
// Placement geometry: where the design's box sits on screen, and the math behind the drag handles.
// All positions and sizes are in the photo's own pixels unless a screen scale `s` is passed.

export const RAD = Math.PI / 180;

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ cx: number, cy: number, w: number, h: number, a: number }} Box  center, size, turn in degrees */
/**
 * A resize in progress. (ax, ay) is the anchor: the point of the box that must stay put (the opposite corner or side).
 * @typedef {{ sx: number, sy: number, corner: boolean, ax: number, ay: number, w0: number, h0: number }} Resize
 */

/**
 * A point given in the box's own frame (origin at its center, before turning) in photo pixels.
 * @param {Box} r
 * @param {number} lx
 * @param {number} ly
 * @returns {[number, number]}
 */
export function toPhoto(r, lx, ly) {
  const c = Math.cos(r.a * RAD), s = Math.sin(r.a * RAD);
  return [r.cx + c * lx - s * ly, r.cy + s * lx + c * ly];
}

/**
 * CSS box for the design at screen scale `s` (screen px per photo px). The element turns about its top-left corner,
 * so the translate puts that corner where the turned box's corner falls. Side tabs hide when the box is too small to grab.
 * @param {Box} r
 * @param {number} s
 */
export function artBox(r, s) {
  const c = Math.cos(r.a * RAD), sn = Math.sin(r.a * RAD), hw = r.w * s / 2, hh = r.h * s / 2;
  return {
    width: r.w * s, height: r.h * s,
    tx: r.cx * s - (c * hw - sn * hh), ty: r.cy * s - (sn * hw + c * hh),
    noWTabs: r.h * s < 62, noHTabs: r.w * s < 80,
  };
}

/**
 * Starts a resize from a handle: a corner (nw, ne, sw, se) scales both ways keeping the shape; a side tab (w, e)
 * changes only the width, (n, s) only the height. The opposite corner or side is the anchor.
 * @param {Box} r
 * @param {string} handle
 * @returns {Resize}
 */
export function startResize(r, handle) {
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0, sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const c = Math.cos(r.a * RAD), s = Math.sin(r.a * RAD), lx = -sx * r.w / 2, ly = -sy * r.h / 2;
  return { sx, sy, corner: sx !== 0 && sy !== 0, ax: r.cx + c * lx - s * ly, ay: r.cy + s * lx + c * ly, w0: r.w, h0: r.h };
}

/**
 * The box after dragging the handle to `p` (photo px). `a` is the box's turn; `w`, `h` its current size, kept on the
 * axis a side tab does not change. Minimums: 12 px wide, 5 px tall.
 * @param {Resize} d
 * @param {number} a
 * @param {Pt} p
 * @param {number} w
 * @param {number} h
 * @returns {{ w: number, h: number, cx: number, cy: number }}
 */
export function resizeTo(d, a, p, w, h) {
  const c = Math.cos(a * RAD), s = Math.sin(a * RAD), vx = p.x - d.ax, vy = p.y - d.ay;
  const along = c * vx + s * vy, across = -s * vx + c * vy;
  if (d.corner) {                                       // diagonal: both directions, shape kept
    const sc = Math.max((along * d.sx) / d.w0, (across * d.sy) / d.h0, 12 / d.w0);
    w = d.w0 * sc; h = d.h0 * sc;
  } else if (d.sx) w = Math.max(12, along * d.sx);      // side tab: width only
  else h = Math.max(5, across * d.sy);                  // top/bottom tab: height only
  const lx = d.sx * w / 2, ly = d.sy * h / 2;
  return { w, h, cx: d.ax + c * lx - s * ly, cy: d.ay + s * lx + c * ly };
}

/**
 * Turn (degrees) that points the box's top toward `p` while dragging the round handle above it.
 * @param {Pt} center
 * @param {Pt} p
 * @returns {number}
 */
export const turnToward = (center, p) => Math.atan2(p.y - center.y, p.x - center.x) / RAD + 90;

/**
 * True when the box's width-to-height ratio is more than 1% off the design's own.
 * @param {{ w: number, h: number }} r
 * @param {number} aspect
 */
export const stretched = (r, aspect) => Math.abs((r.w / r.h) / aspect - 1) > 0.01;
