// @ts-check
// Finding the forearm from one tap. Pure: works on RGBA pixel data, so it is testable without a browser.
//
// From the tapped spot, grow a region of matching skin color. As the color tolerance widens, the region fills the arm
// and then stays nearly the same size until it spills past the arm's edge; the tolerance where the size changes least is
// used (the idea behind MSER). The region's long axis gives the arm's direction, and a thin slice across the arm at the
// tap gives its width, so the design is turned along the arm and centered across it.
import { RAD } from './geometry.js';
import { norm180 } from './units.js';

/**
 * sRGB 0..255 to CIE L*a*b* (D65).
 * @param {number} R
 * @param {number} G
 * @param {number} B
 * @returns {[number, number, number]}
 */
export function labOf(R, G, B) {
  /** @param {number} c */
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = f(R), g = f(G), b = f(B);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  /** @param {number} t */
  const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = h(x), fy = h(y), fz = h(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * @typedef {{ x: number, y: number, ang: number, width: number, a0: number, a1: number }} ArmFound
 *   center across the arm at the tap, the arm's angle (degrees, -90..90], its width there, and how far the skin region
 *   reaches along the arm each way from the tap (a0 < 0 < a1). All in the pixels of the image given.
 * @typedef {{ fail: string }} ArmFail
 */

/**
 * @param {ArrayLike<number>} px  RGBA bytes, W*H*4
 * @param {number} W
 * @param {number} H
 * @param {number} sx  tap, in the same pixels (integers)
 * @param {number} sy
 * @returns {ArmFound | ArmFail}
 */
export function findArm(px, W, H, sx, sy) {
  const N = W * H;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return { fail: 'Tap inside the photo.' };
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) { const v = labOf(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); L[i] = v[0]; A[i] = v[1]; B[i] = v[2]; }
  let l0 = 0, a0 = 0, b0 = 0, n0 = 0;
  for (let y = sy - 3; y <= sy + 3; y++) for (let x = sx - 3; x <= sx + 3; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const i = y * W + x; l0 += L[i]; a0 += A[i]; b0 += B[i]; n0++; }
  l0 /= n0; a0 /= n0; b0 /= n0;
  const chroma = Math.hypot(a0, b0), hue = Math.atan2(b0, a0) / RAD;
  if (chroma < 8 || hue < 15 || hue > 85 || l0 < 20) return { fail: 'That spot does not look like skin.' };
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = Math.hypot(0.5 * (L[i] - l0), A[i] - a0, B[i] - b0);
  /** @param {number} tol */
  const grow = tol => {
    const m = new Uint8Array(N), q = new Int32Array(N); let h = 0, t = 0;
    const s0 = sy * W + sx; if (d[s0] >= tol) return { m, area: 0 };
    m[s0] = 1; q[t++] = s0;
    while (h < t) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      if (x > 0 && !m[i - 1] && d[i - 1] < tol) { m[i - 1] = 1; q[t++] = i - 1; }
      if (x < W - 1 && !m[i + 1] && d[i + 1] < tol) { m[i + 1] = 1; q[t++] = i + 1; }
      if (y > 0 && !m[i - W] && d[i - W] < tol) { m[i - W] = 1; q[t++] = i - W; }
      if (y < H - 1 && !m[i + W] && d[i + W] < tol) { m[i + W] = 1; q[t++] = i + W; }
    }
    return { m, area: t };
  };
  const tols = [], areas = [], masks = [];
  for (let tol = 6; tol <= 32; tol += 2) { const g = grow(tol); tols.push(tol); areas.push(g.area); masks.push(g); }
  let best = null, bestScore = Infinity;
  for (let j = 1; j < tols.length - 1; j++) {
    if (areas[j] < 200 || areas[j] > 0.5 * N) continue;
    const score = (areas[j + 1] - areas[j - 1]) / areas[j];
    if (score < bestScore) { bestScore = score; best = masks[j]; }
  }
  if (!best) return { fail: 'No even patch of skin around that spot.' };
  const R = 0.3 * Math.max(W, H), xs = [], ys = [];
  let n = 0, mx = 0, my = 0;
  for (let i = 0; i < N; i++) if (best.m[i]) { const x = i % W, y = (i / W) | 0; if ((x - sx) ** 2 + (y - sy) ** 2 < R * R) { xs.push(x); ys.push(y); mx += x; my += y; n++; } }
  if (n < 60) return { fail: 'The patch of skin found is too small.' };
  mx /= n; my /= n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let j = 0; j < n; j++) { const dx = xs[j] - mx, dy = ys[j] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  cxx /= n; cyy /= n; cxy /= n;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l2 <= 0 || l1 / l2 < 3) return { fail: 'The patch found is not long and narrow like a forearm.' };
  let ang = Math.abs(cxy) < 1e-9 ? (cxx >= cyy ? 0 : 90) : Math.atan2(l1 - cxx, cxy) / RAD;
  ang = norm180(ang); if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  const ux = Math.cos(ang * RAD), uy = Math.sin(ang * RAD), vx = -uy, vy = ux;
  /** @type {number[]} */
  const across = [], along = [];
  const band = 0.04 * Math.max(W, H);
  for (let j = 0; j < n; j++) { const dx = xs[j] - sx, dy = ys[j] - sy, al = dx * ux + dy * uy; along.push(al); if (Math.abs(al) < band) across.push(dx * vx + dy * vy); }
  if (across.length < 10) return { fail: 'Could not measure the arm width there.' };
  across.sort((a, b) => a - b); along.sort((a, b) => a - b);
  /** @param {number[]} arr @param {number} p */
  const pc = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
  const lo = pc(across, 0.03), hi = pc(across, 0.97), mid = (lo + hi) / 2;
  return { x: sx + vx * mid, y: sy + vy * mid, ang, width: hi - lo, a0: pc(along, 0.02), a1: pc(along, 0.98) };
}
