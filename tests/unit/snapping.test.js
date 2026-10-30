// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { snapCenter, snapAngle, snapPt } from '../../src/lib/snapping.js';
import { RAD } from '../../src/lib/geometry.js';

const axis = fc.record({ x: fc.double({ min: 0, max: 2000, noNaN: true }), y: fc.double({ min: 0, max: 2000, noNaN: true }), ang: fc.double({ min: -89, max: 90, noNaN: true }) });
/** distance of (x, y) from the arm line @param {{ x: number, y: number, ang: number }} a @param {number} x @param {number} y */
const offLine = (a, x, y) => (x - a.x) * -Math.sin(a.ang * RAD) + (y - a.y) * Math.cos(a.ang * RAD);

describe('snapCenter', () => {
  it('pulls a center within tolerance onto the arm line, sliding along it, and says so', () => {
    fc.assert(fc.property(axis, fc.double({ min: -500, max: 500, noNaN: true }), fc.double({ min: -0.99, max: 0.99, noNaN: true }), (a, along, frac) => {
      const tol = 9, ux = Math.cos(a.ang * RAD), uy = Math.sin(a.ang * RAD), nx = -uy, ny = ux;
      const x = a.x + ux * along + nx * frac * tol, y = a.y + uy * along + ny * frac * tol;
      // photo far bigger than the drag area, so the photo center lines are out of reach
      const q = snapCenter(x, y, { axis: a, nw: 1e7, nh: 1e7, tol, on: true });
      expect(Math.abs(offLine(a, q.x, q.y))).toBeLessThan(1e-6);
      expect(q.guides).toEqual(['axis']);
      // only the across-the-arm part moved
      expect((q.x - x) * ux + (q.y - y) * uy).toBeCloseTo(0, 6);
    }));
  });
  it('leaves a center past tolerance alone', () => {
    fc.assert(fc.property(axis, fc.double({ min: 1.01, max: 50, noNaN: true }), fc.boolean(), (a, f, side) => {
      const tol = 9, nx = -Math.sin(a.ang * RAD), ny = Math.cos(a.ang * RAD), d = (side ? 1 : -1) * f * tol;
      const x = a.x + nx * d, y = a.y + ny * d;
      expect(snapCenter(x, y, { axis: a, nw: 1e7, nh: 1e7, tol, on: true })).toEqual({ x, y, guides: [] });
    }));
  });
  it('snaps to the photo\'s center lines', () => {
    expect(snapCenter(503, 300, { axis: null, nw: 1000, nh: 1400, tol: 9, on: true })).toEqual({ x: 500, y: 300, guides: ['vc'] });
    expect(snapCenter(100, 695, { axis: null, nw: 1000, nh: 1400, tol: 9, on: true })).toEqual({ x: 100, y: 700, guides: ['hc'] });
    expect(snapCenter(509, 691, { axis: null, nw: 1000, nh: 1400, tol: 9, on: true })).toEqual({ x: 509, y: 691, guides: [] });
    expect(snapCenter(495, 704, { axis: null, nw: 1000, nh: 1400, tol: 9, on: true }).guides).toEqual(['vc', 'hc']);
  });
  it('does nothing when switched off (or Alt held)', () => {
    fc.assert(fc.property(axis, fc.double({ min: -3000, max: 3000, noNaN: true }), fc.double({ min: -3000, max: 3000, noNaN: true }), (a, x, y) => {
      expect(snapCenter(x, y, { axis: a, nw: 1000, nh: 1000, tol: 1e9, on: false })).toEqual({ x, y, guides: [] });
    }));
  });
});

describe('snapAngle', () => {
  it('snaps within 3 degrees of square angles', () => {
    expect(snapAngle(2.9, { axis: null, on: true })).toEqual({ a: 0, guides: [] });
    expect(snapAngle(-2.9, { axis: null, on: true })).toEqual({ a: 0, guides: [] });
    expect(snapAngle(3.1, { axis: null, on: true })).toEqual({ a: 3.1, guides: [] });
    expect(snapAngle(88, { axis: null, on: true }).a).toBe(90);
    expect(snapAngle(-178, { axis: null, on: true }).a).toBe(180);
    expect(snapAngle(272, { axis: null, on: true }).a).toBe(-90);
  });
  it('snaps to the arm in either direction and marks the arm line', () => {
    expect(snapAngle(-14, { axis: { ang: -15.5 }, on: true })).toEqual({ a: -15.5, guides: ['axis'] });
    expect(snapAngle(166, { axis: { ang: -15.5 }, on: true })).toEqual({ a: 164.5, guides: ['axis'] });
  });
  it('lands within 3 degrees of where it was, or does not move', () => {
    fc.assert(fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), fc.option(fc.double({ min: -90, max: 90, noNaN: true })), (a, ang) => {
      const q = snapAngle(a, { axis: ang === null ? null : { ang }, on: true });
      const diff = Math.abs((((q.a - a) % 360) + 540) % 360 - 180);
      expect(q.a === a || diff < 3).toBe(true);
    }));
  });
  it('does nothing when switched off', () => {
    expect(snapAngle(1, { axis: { ang: 0 }, on: false })).toEqual({ a: 1, guides: [] });
  });
});

describe('snapPt (Shift while measuring)', () => {
  it('keeps the line level or plumb, whichever is closer', () => {
    expect(snapPt({ x: 0, y: 0 }, { x: 10, y: 3 }, true)).toEqual({ x: 10, y: 0 });
    expect(snapPt({ x: 0, y: 0 }, { x: 3, y: 10 }, true)).toEqual({ x: 0, y: 10 });
    expect(snapPt({ x: 0, y: 0 }, { x: 3, y: 10 }, false)).toEqual({ x: 3, y: 10 });
    expect(snapPt(null, { x: 3, y: 10 }, true)).toEqual({ x: 3, y: 10 });
    fc.assert(fc.property(fc.record({ x: fc.integer(), y: fc.integer() }), fc.record({ x: fc.integer(), y: fc.integer() }), (from, p) => {
      const q = snapPt(from, p, true);
      expect(q.x === from.x || q.y === from.y).toBe(true);
      expect(q.x === p.x || q.y === p.y).toBe(true);
    }));
  });
});
