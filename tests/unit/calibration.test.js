// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { lenPx, applyScale } from '../../src/lib/calibration.js';
import { parseLen } from '../../src/lib/units.js';

const ASPECT = 6.0 / 1.7455;   // her design
const p = fc.record({ x: fc.double({ min: 0, max: 4000, noNaN: true }), y: fc.double({ min: 0, max: 4000, noNaN: true }) });
const fresh = { ppi: null, ppiSet: false, w: 450, h: 450 / ASPECT };

describe('lenPx', () => {
  it('is the straight-line distance', () => {
    expect(lenPx({ a: { x: 100, y: 300 }, b: { x: 400, y: 300 } })).toBe(300);
    expect(lenPx({ a: { x: 0, y: 0 }, b: { x: 3, y: 4 } })).toBe(5);
  });
});

describe('applyScale', () => {
  it('ppi = pixel length / known inches, for random lines and lengths', () => {
    fc.assert(fc.property(p, p, fc.double({ min: 0.1, max: 120, noNaN: true }), (a, b, inches) => {
      fc.pre(Math.hypot(b.x - a.x, b.y - a.y) > 5);
      const s = applyScale(fresh, { a, b }, inches, 6, ASPECT);
      expect(s.ppi).toBe(Math.hypot(b.x - a.x, b.y - a.y) / inches);
      expect(s.ppiSet).toBe(true);
    }));
  });
  it('the step 2 example: 300 px across a credit card is 300 / 3.370 px per inch and shows the design 6" wide', () => {
    const s = applyScale(fresh, { a: { x: 100, y: 300 }, b: { x: 400, y: 300 } }, /** @type {number} */ (parseLen('3.370')), 6, ASPECT);
    expect(s.ppi).toBeCloseTo(89.0208, 4);
    expect(s.w / s.ppi).toBeCloseTo(6, 12);
    expect(s.h / s.ppi).toBeCloseTo(1.7455, 12);
  });
  it('a first measurement shows a design of known width at its real width, height by its shape', () => {
    fc.assert(fc.property(p, p, fc.double({ min: 0.5, max: 60, noNaN: true }), fc.double({ min: 0.5, max: 20, noNaN: true }), (a, b, inches, trueIn) => {
      fc.pre(Math.hypot(b.x - a.x, b.y - a.y) > 5);
      const s = applyScale(fresh, { a, b }, inches, trueIn, ASPECT);
      expect(Math.abs(s.w / s.ppi - trueIn)).toBeLessThan(1e-9 * trueIn);
      expect(s.h).toBe(s.w / ASPECT);
    }));
  });
  it('measuring again keeps the design\'s size in inches', () => {
    fc.assert(fc.property(fc.double({ min: 10, max: 400, noNaN: true }), fc.double({ min: 20, max: 3000, noNaN: true }), p, p, fc.double({ min: 0.5, max: 60, noNaN: true }), (ppi0, w0, a, b, inches) => {
      fc.pre(Math.hypot(b.x - a.x, b.y - a.y) > 5);
      const s = applyScale({ ppi: ppi0, ppiSet: true, w: w0, h: 1 }, { a, b }, inches, 6, ASPECT);
      expect(Math.abs(s.w / s.ppi - w0 / ppi0)).toBeLessThan(1e-9 * Math.max(1, w0 / ppi0));
      expect(s.h).toBe(s.w / ASPECT);
    }));
  });
  it('a design she uploaded (unknown real size) keeps its size on the photo', () => {
    const s = applyScale(fresh, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, 2, null, ASPECT);
    expect(s).toEqual({ ppi: 50, ppiSet: true, w: fresh.w, h: fresh.h });
  });
});
