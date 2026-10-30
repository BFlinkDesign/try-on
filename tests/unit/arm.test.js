// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { labOf, findArm } from '../../src/lib/arm.js';

describe('labOf', () => {
  // Published sRGB (D65) to CIE L*a*b* values (e.g. Bruce Lindbloom's calculator, EasyRGB), not derived from this code.
  it.each([
    [[255, 255, 255], [100, 0, 0]],
    [[0, 0, 0], [0, 0, 0]],
    [[255, 0, 0], [53.24, 80.09, 67.20]],
    [[0, 255, 0], [87.73, -86.18, 83.18]],
    [[0, 0, 255], [32.30, 79.19, -107.86]],
    [[128, 128, 128], [53.59, 0, 0]],
  ])('%j -> %j', (rgb, lab) => {
    const got = labOf(rgb[0], rgb[1], rgb[2]);
    for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - lab[i])).toBeLessThan(0.05);
  });
  it('greys have no colour; lightness rises with brightness', () => {
    let last = -1;
    for (let v = 0; v <= 255; v += 5) {
      const [L, a, b] = labOf(v, v, v);
      // the D65 white (0.95047, 1.08883) and the matrix rows differ in the 4th decimal, so greys carry |a|, |b| < 0.05
      expect(Math.abs(a)).toBeLessThan(0.05); expect(Math.abs(b)).toBeLessThan(0.05);
      expect(L).toBeGreaterThan(last); last = L;
    }
  });
});

const W = 300, H = 400, SKIN = [205, 150, 125], BG = [40, 50, 70];
/**
 * A synthetic photo: a straight band of skin colour, `width` px wide, through (ox, oy) at `angDeg`, on a dark background.
 * @param {number} angDeg @param {number} width @param {number} ox @param {number} oy
 */
function band(angDeg, width, ox, oy) {
  const px = new Uint8ClampedArray(W * H * 4), nx = -Math.sin(angDeg * Math.PI / 180), ny = Math.cos(angDeg * Math.PI / 180);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = Math.abs((x - ox) * nx + (y - oy) * ny) <= width / 2 ? SKIN : BG, i = (y * W + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
}
/** angle difference for lines (mod 180) @param {number} a @param {number} b */
const lineDiff = (a, b) => Math.abs(((((a - b) % 180) + 270) % 180) - 90);

describe('findArm on a synthetic forearm', () => {
  it('finds the band\'s angle, width and centre line for random angles, widths and taps across the band', () => {
    fc.assert(fc.property(
      fc.double({ min: -85, max: 85, noNaN: true }), fc.integer({ min: 36, max: 70 }), fc.double({ min: -0.3, max: 0.3, noNaN: true }),
      (ang, width, across) => {
        const ox = 150, oy = 200, nx = -Math.sin(ang * Math.PI / 180), ny = Math.cos(ang * Math.PI / 180);
        const sx = Math.round(ox + nx * across * width), sy = Math.round(oy + ny * across * width);
        const res = findArm(band(ang, width, ox, oy), W, H, sx, sy);
        if ('fail' in res) throw new Error(res.fail);
        expect(lineDiff(res.ang, ang)).toBeLessThan(2);
        expect(res.ang).toBeGreaterThan(-90); expect(res.ang).toBeLessThanOrEqual(90);
        // width is read between the 3rd and 97th percentile across the arm (robust to stray pixels), so about 94% of it
        expect(res.width).toBeGreaterThan(0.9 * width - 1); expect(res.width).toBeLessThan(width + 1);
        // centred across the band: the found centre is on the band's middle line
        expect(Math.abs((res.x - ox) * nx + (res.y - oy) * ny)).toBeLessThan(2.5);
        // and reaches along the arm both ways from the tap
        expect(res.a0).toBeLessThan(0); expect(res.a1).toBeGreaterThan(0);
      }), { numRuns: 25 });
  });
  it('refuses a tap outside the picture', () => {
    const px = band(0, 50, 150, 200);
    for (const [x, y] of [[-1, 10], [10, -1], [W, 10], [10, H]]) expect(findArm(px, W, H, x, y)).toEqual({ fail: 'Tap inside the photo.' });
  });
  it('refuses a tap that is not skin coloured', () => {
    expect(findArm(band(0, 50, 150, 200), W, H, 150, 20)).toEqual({ fail: 'That spot does not look like skin.' });
  });
  it('refuses a patch of skin that is not long and narrow', () => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = Math.hypot(x - 150, y - 200) < 60 ? SKIN : BG, i = (y * W + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    expect(findArm(px, W, H, 150, 200)).toEqual({ fail: 'The patch found is not long and narrow like a forearm.' });
  });
  it('refuses a patch too small to be an arm', () => {
    const px = band(0, 4, 150, 200);    // a 5 px line: under 200 px of area within reach
    const r = findArm(px, 60, 60, 30, 30);
    expect('fail' in r).toBe(true);
  });
});
