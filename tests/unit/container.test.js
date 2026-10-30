// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pack, unpack, ContainerError, CONTAINER_VERSION } from '../../src/lib/container.js';

const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);

describe('pack / unpack', () => {
  it('round-trips text and bytes exactly, with the documented layout', () => {
    const text = { a: 'é ✓', n: 1.5, o: { x: [1, 2] } };
    const buf = pack(text, [{ key: 'one', type: 'image/png', bytes: Uint8Array.of(1, 2, 3) }, { key: 'two', type: 'application/pdf', bytes: enc('%PDF') }]);
    const n = new DataView(buf.buffer).getUint32(0, true);
    const index = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
    expect(index).toEqual({ version: CONTAINER_VERSION, text, entries: [{ key: 'one', type: 'image/png', offset: 0, length: 3 }, { key: 'two', type: 'application/pdf', offset: 3, length: 4 }] });
    expect([...buf.subarray(4 + n)]).toEqual([1, 2, 3, 0x25, 0x50, 0x44, 0x46]);
    const u = unpack(buf);
    expect(u.index.text).toEqual(text);
    expect([...u.bytes.one]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(u.bytes.two)).toBe('%PDF');
  });

  it('round-trips any set of entries (property)', () => {
    const entry = fc.record({ key: fc.string({ minLength: 1, maxLength: 12 }), type: fc.string({ minLength: 1, maxLength: 20 }), bytes: fc.uint8Array({ maxLength: 300 }) });
    fc.assert(fc.property(fc.uniqueArray(entry, { selector: e => e.key, maxLength: 8 }), fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer())), (items, text) => {
      const u = unpack(pack(text, items));
      expect(u.index.text).toEqual(text);
      expect(Object.keys(u.bytes).sort()).toEqual(items.map(i => i.key).sort());
      for (const it of items) { expect(Buffer.from(u.bytes[it.key]).equals(Buffer.from(it.bytes))).toBe(true); expect(u.index.entries.find(e => e.key === it.key)?.type).toBe(it.type); }
    }));
  });

  it('keeps entries whose keys are names of Object.prototype ("__proto__", "constructor")', () => {
    const u = unpack(pack({}, [{ key: '__proto__', type: 't', bytes: Uint8Array.of(1) }, { key: 'constructor', type: 't', bytes: Uint8Array.of(2) }]));
    expect(Object.keys(u.bytes).sort()).toEqual(['__proto__', 'constructor']);
    expect([...u.bytes['__proto__']]).toEqual([1]); expect([...u.bytes['constructor']]).toEqual([2]);
  });

  it('refuses to pack a repeated key, a missing type, or something that is not bytes', () => {
    expect(() => pack({}, [{ key: 'a', type: 't', bytes: new Uint8Array(1) }, { key: 'a', type: 't', bytes: new Uint8Array(1) }])).toThrow(ContainerError);
    expect(() => pack({}, [{ key: 'a', type: '', bytes: new Uint8Array(1) }])).toThrow(/needs a type/);
    expect(() => pack({}, [{ key: 'a', type: 't', bytes: /** @type {any} */ ('x') }])).toThrow(/not bytes/);
  });

  /** A container built by hand. @param {unknown} index @param {Uint8Array} data */
  const raw = (index, data = new Uint8Array(4)) => {
    const j = enc(JSON.stringify(index)), out = new Uint8Array(4 + j.length + data.length);
    new DataView(out.buffer).setUint32(0, j.length, true); out.set(j, 4); out.set(data, 4 + j.length); return out;
  };
  const ok = { version: CONTAINER_VERSION, text: {}, entries: [{ key: 'a', type: 't', offset: 0, length: 4 }] };

  it.each([
    ['too short', () => new Uint8Array(3), /too short/],
    ['index longer than the file', () => { const b = raw(ok); new DataView(b.buffer).setUint32(0, 1e6, true); return b; }, /index length/],
    ['zero-length index', () => new Uint8Array(8), /index length/],
    ['index not JSON', () => { const b = raw(ok); b[5] = 0x7b; b[6] = 0x7b; return b; }, /not JSON/],
    ['index an array', () => raw([]), /not an object/],
    ['other version', () => raw({ ...ok, version: 2 }), /unsupported version 2/],
    ['text missing', () => raw({ ...ok, text: null }), /text missing/],
    ['entries missing', () => raw({ ...ok, entries: {} }), /entries missing/],
    ['entry past the end (truncated file)', () => raw(ok, new Uint8Array(3)), /outside the data/],
    ['negative offset', () => raw({ ...ok, entries: [{ key: 'a', type: 't', offset: -1, length: 1 }] }), /outside/],
    ['fractional length', () => raw({ ...ok, entries: [{ key: 'a', type: 't', offset: 0, length: 1.5 }] }), /outside/],
    ['entries overlap', () => raw({ ...ok, entries: [{ key: 'a', type: 't', offset: 0, length: 3 }, { key: 'b', type: 't', offset: 2, length: 2 }] }), /overlap/],
    ['repeated key', () => raw({ ...ok, entries: [{ key: 'a', type: 't', offset: 0, length: 2 }, { key: 'a', type: 't', offset: 2, length: 2 }] }), /twice/],
    ['entry without type', () => raw({ ...ok, entries: [{ key: 'a', offset: 0, length: 2 }] }), /without key or type/],
  ])('refuses %s', (_n, make, msg) => { expect(() => unpack(make())).toThrow(msg); });

  it('never throws anything but ContainerError on random bytes (property)', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), b => {
      try { unpack(b); } catch (e) { expect(e).toBeInstanceOf(ContainerError); }
    }));
  });
});
