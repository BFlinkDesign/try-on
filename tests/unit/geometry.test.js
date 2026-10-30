// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RAD, toPhoto, artBox, startResize, resizeTo, turnToward, stretched } from '../../src/lib/geometry.js';

/** @param {number} a @param {number} b @param {number} [rel] */
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

const box = fc.record({
  cx: fc.double({ min: -2000, max: 4000, noNaN: true }),
  cy: fc.double({ min: -2000, max: 4000, noNaN: true }),
  w: fc.double({ min: 20, max: 3000, noNaN: true }),
  h: fc.double({ min: 8, max: 2000, noNaN: true }),
  a: fc.double({ min: -720, max: 720, noNaN: true }),
});
const pt = fc.record({ x: fc.double({ min: -5000, max: 8000, noNaN: true }), y: fc.double({ min: -5000, max: 8000, noNaN: true }) });
const CORNERS = ['nw', 'ne', 'sw', 'se'];

describe('toPhoto', () => {
  it('turns about the center', () => {
    const [x, y] = toPhoto({ cx: 10, cy: 20, w: 0, h: 0, a: 90 }, 5, 0);
    expect(x).toBeCloseTo(10, 12); expect(y).toBeCloseTo(25, 12);
    expect(toPhoto({ cx: 1, cy: 2, w: 0, h: 0, a: 0 }, 3, 4)).toEqual([4, 6]);
  });
  it('keeps distances (a rotation)', () => {
    fc.assert(fc.property(box, fc.double({ min: -500, max: 500, noNaN: true }), fc.double({ min: -500, max: 500, noNaN: true }), (r, lx, ly) => {
      const [x, y] = toPhoto(r, lx, ly);
      expect(near(Math.hypot(x - r.cx, y - r.cy), Math.hypot(lx, ly), 1e-9)).toBe(true);
    }));
  });
});

describe('artBox (where the design element is drawn)', () => {
  it('puts the element\'s center on the design center for any turn and screen scale', () => {
    fc.assert(fc.property(box, fc.double({ min: 0.05, max: 6, noNaN: true }), (r, s) => {
      const b = artBox(r, s), c = Math.cos(r.a * RAD), sn = Math.sin(r.a * RAD);
      // CSS: translate(tx, ty) rotate(a) with transform-origin at the top-left corner
      const u = b.width / 2, v = b.height / 2;
      expect(near(b.tx + c * u - sn * v, r.cx * s, 1e-9)).toBe(true);
      expect(near(b.ty + sn * u + c * v, r.cy * s, 1e-9)).toBe(true);
      expect(near(b.width, r.w * s)).toBe(true); expect(near(b.height, r.h * s)).toBe(true);
    }));
  });
  it('hides side tabs when the box is too small to grab (height under 62 px, width under 80 px)', () => {
    expect(artBox({ cx: 0, cy: 0, w: 100, h: 61.9, a: 0 }, 1).noWTabs).toBe(true);
    expect(artBox({ cx: 0, cy: 0, w: 100, h: 62, a: 0 }, 1).noWTabs).toBe(false);
    expect(artBox({ cx: 0, cy: 0, w: 79.9, h: 100, a: 0 }, 1).noHTabs).toBe(true);
    expect(artBox({ cx: 0, cy: 0, w: 80, h: 100, a: 0 }, 1).noHTabs).toBe(false);
    expect(artBox({ cx: 0, cy: 0, w: 40, h: 31, a: 0 }, 2).noWTabs).toBe(false);
  });
});

describe('startResize', () => {
  it('reads the handle: corners scale both ways, side tabs one way', () => {
    const r = { cx: 0, cy: 0, w: 100, h: 50, a: 0 };
    expect(startResize(r, 'se')).toMatchObject({ sx: 1, sy: 1, corner: true, ax: -50, ay: -25 });
    expect(startResize(r, 'nw')).toMatchObject({ sx: -1, sy: -1, corner: true, ax: 50, ay: 25 });
    expect(startResize(r, 'e')).toMatchObject({ sx: 1, sy: 0, corner: false, ax: -50, ay: 0 });
    expect(startResize(r, 'n')).toMatchObject({ sx: 0, sy: -1, corner: false, ax: 0, ay: 25 });
    expect(startResize(r, 'w')).toMatchObject({ w0: 100, h0: 50 });
  });
});

describe('corner drag', () => {
  it('keeps the shape and the opposite corner fixed, for random turns and drags', () => {
    fc.assert(fc.property(box, fc.constantFrom(...CORNERS), pt, (r, handle, p) => {
      const d = startResize(r, handle), q = resizeTo(d, r.a, p, r.w, r.h);
      expect(near(q.w / q.h, r.w / r.h, 1e-9)).toBe(true);
      // the anchor is the original box's opposite corner ...
      const [ox, oy] = toPhoto(r, -d.sx * r.w / 2, -d.sy * r.h / 2);
      expect(near(ox, d.ax, 1e-9) && near(oy, d.ay, 1e-9)).toBe(true);
      // ... and the new box still has its opposite corner there
      const [nx, ny] = toPhoto({ ...r, ...q }, -d.sx * q.w / 2, -d.sy * q.h / 2);
      expect(Math.hypot(nx - d.ax, ny - d.ay)).toBeLessThan(1e-6 * Math.max(1, Math.abs(d.ax), Math.abs(d.ay), q.w));
      expect(q.w).toBeGreaterThanOrEqual(12 - 1e-9);
    }));
  });
  it('follows the pointer: the dragged corner lands on the pointer when dragged along the diagonal', () => {
    fc.assert(fc.property(box, fc.constantFrom(...CORNERS), fc.double({ min: 0.2, max: 5, noNaN: true }), (r, handle, f) => {
      const d = startResize(r, handle);
      fc.pre(r.w * f >= 12);
      const [px, py] = toPhoto({ ...r, cx: d.ax, cy: d.ay }, d.sx * r.w * f, d.sy * r.h * f);
      const q = resizeTo(d, r.a, { x: px, y: py }, r.w, r.h);
      expect(near(q.w, r.w * f, 1e-7)).toBe(true);
    }));
  });
  it('never goes below 12 px wide', () => {
    const r = { cx: 500, cy: 500, w: 300, h: 100, a: 30 }, d = startResize(r, 'se');
    const q = resizeTo(d, r.a, { x: d.ax - 1000, y: d.ay - 1000 }, r.w, r.h);
    expect(q.w).toBeCloseTo(12, 9); expect(q.h).toBeCloseTo(4, 9);
  });
});

describe('side tab drag', () => {
  it('changes only the width, keeps the opposite side where it was', () => {
    fc.assert(fc.property(box, fc.constantFrom('e', 'w'), pt, (r, handle, p) => {
      const d = startResize(r, handle), q = resizeTo(d, r.a, p, r.w, r.h);
      expect(q.h).toBe(r.h);
      expect(q.w).toBeGreaterThanOrEqual(12);
      const [nx, ny] = toPhoto({ ...r, ...q }, -d.sx * q.w / 2, 0);
      expect(Math.hypot(nx - d.ax, ny - d.ay)).toBeLessThan(1e-6 * Math.max(1, Math.abs(d.ax), Math.abs(d.ay), q.w));
    }));
  });
  it('changes only the height for the top and bottom tabs (at least 5 px)', () => {
    fc.assert(fc.property(box, fc.constantFrom('n', 's'), pt, (r, handle, p) => {
      const d = startResize(r, handle), q = resizeTo(d, r.a, p, r.w, r.h);
      expect(q.w).toBe(r.w);
      expect(q.h).toBeGreaterThanOrEqual(5);
      const [nx, ny] = toPhoto({ ...r, ...q }, 0, -d.sy * q.h / 2);
      expect(Math.hypot(nx - d.ax, ny - d.ay)).toBeLessThan(1e-6 * Math.max(1, Math.abs(d.ax), Math.abs(d.ay), q.h));
    }));
  });
  it('uses the current size on the axis it does not change', () => {
    const r = { cx: 0, cy: 0, w: 100, h: 50, a: 0 }, d = startResize(r, 'e');
    expect(resizeTo(d, 0, { x: 150, y: 999 }, 100, 77)).toEqual({ w: 200, h: 77, cx: 50, cy: 0 });
    const dn = startResize(r, 's');
    expect(resizeTo(dn, 0, { x: 999, y: 75 }, 88, 50)).toEqual({ w: 88, h: 100, cx: 0, cy: 25 });
  });
});

describe('turnToward', () => {
  it('points the top of the design at the pointer', () => {
    expect(turnToward({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0, 12);    // straight up: no turn
    expect(turnToward({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 12);    // right
    expect(turnToward({ x: 5, y: 5 }, { x: 5, y: 15 })).toBeCloseTo(180, 12);   // down
  });
});

describe('stretched', () => {
  it('is true only more than 1% off the design\'s own shape', () => {
    expect(stretched({ w: 100, h: 50 }, 2)).toBe(false);
    expect(stretched({ w: 100.9, h: 50 }, 2)).toBe(false);
    expect(stretched({ w: 102.1, h: 50 }, 2)).toBe(true);
    expect(stretched({ w: 97.9, h: 50 }, 2)).toBe(true);
    fc.assert(fc.property(fc.double({ min: 1, max: 5000, noNaN: true }), fc.double({ min: 0.1, max: 10, noNaN: true }), (w, aspect) => {
      expect(stretched({ w, h: w / aspect }, aspect)).toBe(false);
    }));
  });
});
