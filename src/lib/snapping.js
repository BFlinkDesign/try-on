// @ts-check
// Snapping while dragging: onto the arm's center line, the photo's center lines, square angles and the arm's angle.
import { RAD } from './geometry.js';
import { norm180 } from './units.js';

/** @typedef {{ x: number, y: number, ang: number }} AxisLine  a point on the arm's center line and its angle in degrees */

/**
 * Pulls a dragged center onto the arm line and the photo's center lines when within `tol` photo px.
 * `guides` names the lines it snapped to ('axis', 'vc', 'hc') so they can be drawn.
 * @param {number} x
 * @param {number} y
 * @param {{ axis: AxisLine | null, nw: number, nh: number, tol: number, on: boolean }} o
 * @returns {{ x: number, y: number, guides: string[] }}
 */
export function snapCenter(x, y, { axis, nw, nh, tol, on }) {
  /** @type {string[]} */
  const guides = [];
  if (!on) return { x, y, guides };
  if (axis) {
    const nx = -Math.sin(axis.ang * RAD), ny = Math.cos(axis.ang * RAD);
    const d = (x - axis.x) * nx + (y - axis.y) * ny;
    if (Math.abs(d) < tol) { x -= nx * d; y -= ny * d; guides.push('axis'); }
  }
  if (Math.abs(x - nw / 2) < tol) { x = nw / 2; guides.push('vc'); }
  if (Math.abs(y - nh / 2) < tol) { y = nh / 2; guides.push('hc'); }
  return { x, y, guides };
}

/**
 * Snaps a turn within 3 degrees of 0, 90, 180, -90, or the arm's angle (either direction).
 * @param {number} a
 * @param {{ axis: { ang: number } | null, on: boolean }} o
 * @returns {{ a: number, guides: string[] }}
 */
export function snapAngle(a, { axis, on }) {
  if (!on) return { a, guides: [] };
  const cands = [0, 90, 180, -90].map(v => ({ v, axis: false }));
  if (axis) [axis.ang, axis.ang + 180].forEach(v => cands.push({ v, axis: true }));
  for (const c of cands) if (Math.abs(norm180(a - c.v)) < 3) return { a: c.v, guides: c.axis ? ['axis'] : [] };
  return { a, guides: [] };
}

/**
 * With Shift held, keeps a measuring line level or plumb from its other end.
 * @param {{ x: number, y: number } | null | undefined} from
 * @param {{ x: number, y: number }} p
 * @param {boolean} shift
 * @returns {{ x: number, y: number }}
 */
export const snapPt = (from, p, shift) => (!shift || !from) ? p : (Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y });
