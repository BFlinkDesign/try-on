// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { picNotes } from '../../src/lib/captions.js';

const ASPECT = 6.0 / 1.7455;

describe('picNotes (caption strip on a saved picture)', () => {
  it('says the measured size rounded to 1/8 inch', () => {
    expect(picNotes({ ppiSet: true, ppi: 100, w: 600, h: 600 / ASPECT, flip: false }, ASPECT))
      .toEqual(['About 6" wide × 1 3/4" tall on the arm (measured from the photo)']);
    expect(picNotes({ ppiSet: true, ppi: 89.02, w: 89.02 * 6.3, h: 89.02 * 6.3 / ASPECT, flip: false }, ASPECT)[0])
      .toBe('About 6 1/4" wide × 1 7/8" tall on the arm (measured from the photo)');
  });
  it('says when the size was not measured', () => {
    expect(picNotes({ ppiSet: false, ppi: null, w: 450, h: 450 / ASPECT, flip: false }, ASPECT)).toEqual(['Size not measured: not true size']);
  });
  it('adds stretched and mirrored notes', () => {
    expect(picNotes({ ppiSet: false, ppi: null, w: 450 * 1.3, h: 450 / ASPECT, flip: true }, ASPECT)).toEqual([
      'Size not measured: not true size', 'Stretched out of shape: not the real proportions', 'Mirrored: the writing reads backwards',
    ]);
  });
  it('always one size line first; stretched note exactly when out of shape; mirrored note exactly when flipped', () => {
    fc.assert(fc.property(fc.boolean(), fc.double({ min: 5, max: 500, noNaN: true }), fc.double({ min: 10, max: 4000, noNaN: true }), fc.double({ min: 0.5, max: 2, noNaN: true }), fc.boolean(), (measured, ppi, w, squash, flip) => {
      const h = w / ASPECT * squash, n = picNotes({ ppiSet: measured, ppi: measured ? ppi : null, w, h, flip }, ASPECT);
      expect(n[0]).toMatch(measured ? /^About .*" wide × .*" tall on the arm \(measured from the photo\)$/ : /^Size not measured/);
      expect(n.includes('Stretched out of shape: not the real proportions')).toBe(Math.abs((w / h) / ASPECT - 1) > 0.01);
      expect(n.at(-1) === 'Mirrored: the writing reads backwards').toBe(flip);
      expect(n.length).toBe(1 + Number(Math.abs((w / h) / ASPECT - 1) > 0.01) + Number(flip));
    }));
  });
});
