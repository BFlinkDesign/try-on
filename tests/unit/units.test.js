// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { fmt, norm180, fmtIn, in8, parseLen } from '../../src/lib/units.js';


describe('fmt', () => {
  it('rounds and pads to the requested decimals', () => {
    expect(fmt(6)).toBe('6.00');
    expect(fmt(1.746)).toBe('1.75');
    expect(fmt(3.14159, 1)).toBe('3.1');
    expect(fmt(-15.4, 0)).toBe('-15');
    expect(fmt(0.005)).toBe('0.01');
  });
  it('always prints exactly d decimals', () => {
    fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.integer({ min: 0, max: 4 }), (v, d) => {
      const s = fmt(v, d);
      expect(d === 0 ? !s.includes('.') : s.split('.')[1].length === d).toBe(true);
      expect(Math.abs(parseFloat(s) - v)).toBeLessThanOrEqual(0.5 * 10 ** -d + 1e-9 * Math.max(1, Math.abs(v)));
    }));
  });
});

describe('norm180', () => {
  it('folds into [-180, 180) and keeps the direction', () => {
    expect(norm180(0)).toBe(0); expect(norm180(190)).toBe(-170); expect(norm180(-190)).toBe(170);
    expect(norm180(180)).toBe(-180); expect(norm180(540)).toBe(-180); expect(norm180(359)).toBe(-1);
    fc.assert(fc.property(fc.double({ min: -1e5, max: 1e5, noNaN: true }), a => {
      const n = norm180(a);
      expect(n).toBeGreaterThanOrEqual(-180); expect(n).toBeLessThan(180);
      const turns = (a - n) / 360;
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
    }));
  });
});

describe('fmtIn (sixteenths)', () => {
  it('writes whole inches and reduced fractions the way a tape reads', () => {
    expect(fmtIn(6)).toBe('6"');
    expect(fmtIn(3.37)).toBe('3 3/8"');        // credit card long side: 3.370 in
    expect(fmtIn(6.14)).toBe('6 1/8"');        // dollar bill: 6.14 in
    expect(fmtIn(0.955)).toBe('15/16"');       // quarter: 0.955 in
    expect(fmtIn(0.5)).toBe('1/2"');
    expect(fmtIn(1.0625)).toBe('1 1/16"');
    expect(fmtIn(1.99)).toBe('2"');            // 31.84/16 rounds up to the next inch
    expect(fmtIn(0)).toBe('0"');
  });
  it('is within half a sixteenth of the value and uses a reduced fraction (read back independently of parseLen)', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), v => {
      const s = fmtIn(v), m = s.match(/^(?:(\d+)"|(?:(\d+) )?(\d+)\/(\d+)")$/);
      expect(m).not.toBeNull();
      const [, whole, w, n, d] = /** @type {RegExpMatchArray} */ (m);
      const back = whole !== undefined ? +whole : (w ? +w : 0) + +n / +d;
      expect(Math.abs(back - v)).toBeLessThanOrEqual(1 / 32 + 1e-9);
      if (n) { expect(+n % 2).toBe(1); expect([2, 4, 8, 16]).toContain(+d); expect(+n).toBeLessThan(+d); }
    }));
  });
  it('round-trips every sixteenth through parseLen', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 16 * 500 }), n => {
      expect(parseLen(fmtIn(n / 16))).toBe(n / 16);
    }));
  });
  // Fixed (was a known defect carried from the single-file page): a bare fraction with a two-digit numerator was read
  // as a whole number plus a fraction ("11/16" -> 1 1/16). Every n/16, n/8 and n/4, bare and with a whole number.
  it('reads every bare fraction n/16, n/8, n/4 as itself, and with a whole number in front', () => {
    for (const d of [4, 8, 16]) for (let n = 1; n < d; n++) {
      expect(parseLen(`${n}/${d}`)).toBe(n / d); expect(parseLen(`${n}/${d}"`)).toBe(n / d);
      expect(parseLen(`2 ${n}/${d}`)).toBe(2 + n / d); expect(parseLen(`2-${n}/${d}"`)).toBe(2 + n / d);
    }
    expect(parseLen('11/16')).toBe(0.6875); expect(parseLen('13/16')).toBe(0.8125); expect(parseLen('15/16')).toBe(0.9375);
  });
  it('refuses a fraction over zero and run-together numbers', () => {
    expect(parseLen('1/0')).toBeNull(); expect(parseLen('3 3 3/8')).toBeNull(); expect(parseLen('3/8/2')).toBeNull();
  });
});

describe('in8 (eighths, used on the picture caption)', () => {
  it('rounds to the nearest eighth first', () => {
    expect(in8(6.0001)).toBe('6"');
    expect(in8(1.7455)).toBe('1 3/4"');       // her design's height at 6 in wide
    expect(in8(1.69)).toBe('1 3/4"');
    expect(in8(1.68)).toBe('1 5/8"');
    expect(in8(0.06)).toBe('0"');
  });
  it('round-trips: parseLen(in8(v)) is v rounded to 1/8', () => {
    fc.assert(fc.property(fc.double({ min: 1 / 16 + 1e-6, max: 1000, noNaN: true }), v => {
      expect(parseLen(in8(v))).toBe(Math.round(v * 8) / 8);
    }));
  });
  it('never shows sixteenths', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), v => { expect(in8(v)).not.toMatch(/\/16"/); }));
  });
});

describe('parseLen', () => {
  it('reads the ways people type lengths', () => {
    expect(parseLen('6')).toBe(6);
    expect(parseLen(' 6.14 ')).toBe(6.14);
    expect(parseLen('3 3/8"')).toBe(3.375);
    expect(parseLen('3-3/8')).toBe(3.375);
    expect(parseLen('3/4')).toBe(0.75);
    expect(parseLen("1' 2-1/2\"")).toBe(14.5);
    expect(parseLen('1 ft 2 in')).toBe(14);
    expect(parseLen('2 feet')).toBe(24);
    expect(parseLen('5 inches')).toBe(5);
    expect(parseLen('1’ 6”')).toBe(18);
    expect(parseLen('1′ 6″')).toBe(18);
    expect(parseLen(6)).toBe(6);
  });
  it('reads two-digit fractions, bare or with a whole number in front (the fixed defect)', () => {
    expect(parseLen('11/16')).toBe(0.6875); expect(parseLen('15/16"')).toBe(0.9375);
    expect(parseLen('1 11/16')).toBe(1.6875);
  });
  it('refuses anything that is not a positive length', () => {
    for (const t of ['', '0', '-3', 'abc', '3/0', '1/2/3', '3 x 4', '"', "'", '0/4']) expect(parseLen(t)).toBeNull();
  });
  it('reads feet and inches as 12 x feet + inches', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 11 }), fc.integer({ min: 0, max: 7 }), (f, i, e) => {
      fc.pre(f + i + e > 0);
      const text = `${f}' ${i}${e ? ` ${e}/8` : ''}"`;
      expect(parseLen(text)).toBe(f * 12 + i + e / 8);
    }));
  });
});
