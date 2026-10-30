// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FILE_TYPES, FILE_KEYS, extOf, mimeOf, MIME, b64Bytes, bytesB64, nameFits, previewName } from '../../src/lib/files.js';

describe('FILE_TYPES', () => {
  it('names the six roles and the type each must be', () => {
    expect(FILE_KEYS).toEqual(['pdf', 'png', 'svg', 'sheet', 'stencil', 'orig']);
    expect(FILE_TYPES).toEqual({ pdf: 'pdf', png: 'png', svg: 'svg', sheet: 'pdf', stencil: 'pdf', orig: 'png' });
    expect(Object.isFrozen(FILE_TYPES)).toBe(true);
    for (const k of FILE_KEYS) expect(MIME[FILE_TYPES[k]]).toBeTruthy();
  });
});

describe('nameFits', () => {
  it('takes a safe name with the role\'s extension', () => {
    expect(nameFits('sheet', 'x-4-sheet.pdf')).toBe(true);
    expect(nameFits('orig', 'a_b.c-600dpi.png')).toBe(true);
  });
  it.each([
    ['wrong extension', 'pdf', 'x.png'], ['upper-case extension', 'pdf', 'x.PDF'], ['a path', 'pdf', '../x.pdf'], ['a folder', 'pdf', 'a/x.pdf'],
    ['hidden file', 'pdf', '.x.pdf'], ['space', 'pdf', 'a b.pdf'], ['empty', 'pdf', ''], ['not text', 'pdf', 3], ['too long', 'pdf', `${'a'.repeat(120)}.pdf`],
  ])('refuses %s', (_n, key, name) => { expect(nameFits(/** @type {any} */ (key), name)).toBe(false); });
  it('never takes a name with a slash, backslash or leading dot', () => {
    fc.assert(fc.property(fc.string(), s => {
      const n = `${s}.pdf`;
      if (/[/\\]/.test(n) || n.startsWith('.')) expect(nameFits('pdf', n)).toBe(false);
    }));
  });
});

describe('extOf / mimeOf', () => {
  it('is the lower-case text after the last dot', () => {
    expect(extOf('a.b.PDF')).toBe('pdf'); expect(extOf('noext')).toBe('noext'); expect(extOf('x.')).toBe('');
    fc.assert(fc.property(fc.string(), fc.stringMatching(/^[A-Za-z0-9]{1,6}$/), (base, ext) => {
      expect(extOf(`${base}.${ext}`)).toBe(ext.toLowerCase());
    }));
  });
  it('gives each offered format its media type, and a generic one otherwise', () => {
    expect(mimeOf('x.pdf')).toBe('application/pdf'); expect(mimeOf('x.PNG')).toBe('image/png');
    expect(mimeOf('x.svg')).toBe('image/svg+xml'); expect(mimeOf('x.jpg')).toBe('image/jpeg');
    expect(mimeOf('x.zip')).toBe('application/octet-stream');
    expect(Object.keys(MIME).sort()).toEqual(['jpg', 'pdf', 'png', 'svg']);
  });
});

describe('b64Bytes / bytesB64', () => {
  it('decodes base64 to the exact bytes', () => {
    expect([...b64Bytes('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    fc.assert(fc.property(fc.uint8Array({ maxLength: 2048 }), bytes => {
      const out = b64Bytes(Buffer.from(bytes).toString('base64'));
      expect(out).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(out).equals(Buffer.from(bytes))).toBe(true);
    }));
  });
  it('encodes bytes as Node does, including files larger than one slice', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 4096 }), bytes => { expect(bytesB64(bytes)).toBe(Buffer.from(bytes).toString('base64')); }));
    const big = new Uint8Array(0x8000 * 3 + 17).map((_, i) => (i * 31) & 255);
    expect(bytesB64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});

describe('previewName', () => {
  it('is <prefix>-preview-YYYY-MM-DD-HHMM.jpg in local time', () => {
    expect(previewName('demo', new Date(2026, 0, 5, 7, 3))).toBe('demo-preview-2026-01-05-0703.jpg');
    expect(previewName('demo', new Date(2026, 11, 31, 23, 59))).toBe('demo-preview-2026-12-31-2359.jpg');
    fc.assert(fc.property(fc.date({ min: new Date(2000, 0, 1), max: new Date(2099, 11, 31), noInvalidDate: true }), d => {
      const m = previewName('p', d).match(/^p-preview-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.jpg$/);
      expect(m).not.toBeNull();
      const [, y, mo, da, h, mi] = /** @type {RegExpMatchArray} */ (m).map(Number);
      expect([y, mo, da, h, mi]).toEqual([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]);
    }));
  });
});
