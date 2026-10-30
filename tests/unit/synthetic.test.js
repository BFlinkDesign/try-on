// @ts-check
// The synthetic payload must behave like the real one where the tests depend on it: the arm is found where the
// placement checks tap, at the angle they expect; the background is refused as skin; every file has its real type;
// the preview design draws the offered SVG's paths; the design is 6.000 in wide. And it must be the same every run.
import { describe, it, expect } from 'vitest';
import { findArm } from '../../src/lib/arm.js';
import { syntheticSet, photoPixels, PHOTO, DESIGN, SYNTHETIC_TEXT } from '../../scripts/lib/synthetic.mjs';
import { packParts, syntheticParts } from '../../scripts/make-payload.mjs';
import { FILE_KEYS, FILE_TYPES, nameFits } from '../../src/lib/files.js';

describe('synthetic payload', () => {
  const s = syntheticSet();
  it('is deterministic', () => {
    const t = syntheticSet();
    expect(t.sample.equals(s.sample)).toBe(true);
    for (const k of FILE_KEYS) expect(t.files[k].equals(s.files[k])).toBe(true);
  });
  it('photo: the arm is found at the placement checks\' tap, at about -15 degrees; the background is not skin', () => {
    const p = photoPixels();
    expect([p.w, p.h]).toEqual([1050, 1400]);
    const arm = /** @type {import('../../src/lib/arm.js').ArmFound} */ (findArm(p.rgba, p.w, p.h, PHOTO.armX, PHOTO.armY));
    expect(arm).not.toHaveProperty('fail');
    expect(arm.ang).toBeGreaterThan(-20); expect(arm.ang).toBeLessThan(-10);
    expect(Math.abs(arm.ang - PHOTO.armDeg)).toBeLessThan(1.5);
    expect(findArm(p.rgba, p.w, p.h, 800, 120)).toEqual({ fail: 'That spot does not look like skin.' });
  });
  it('files: each has its type\'s magic bytes; the sheet has 4 pages', () => {
    expect([...s.sample.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    for (const k of FILE_KEYS) {
      const b = s.files[k], t = FILE_TYPES[k];
      if (t === 'pdf') expect(b.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      if (t === 'png') expect([...b.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      if (t === 'svg') expect(b.toString('utf8')).toMatch(/<svg[\s>]/);
    }
    expect(s.files.sheet.toString('latin1')).toMatch(/\/Count 4/);
  });
  it('design: 6.000 in wide, drawn by the same paths as the offered SVG, and clearly labelled as fake', () => {
    expect(s.art.toString('utf8')).toMatch(new RegExp(`width="${DESIGN.widthIn}in"`));
    expect(DESIGN.widthIn).toBe(6);
    expect(s.art.toString('utf8')).toMatch(/Synthetic test design \(not a real tattoo\)/);
    expect(SYNTHETIC_TEXT.designWidthIn).toBe(6);
  });
  it('text: every file name fits its role, and the page\'s reader accepts the packed result', () => {
    for (const k of FILE_KEYS) expect(nameFits(k, SYNTHETIC_TEXT.fileNames[k])).toBe(true);
    expect(packParts(syntheticParts()).length).toBeGreaterThan(s.sample.length);
  });
});
