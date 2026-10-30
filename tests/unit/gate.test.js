// @ts-check
import { describe, it, expect } from 'vitest';
import { screenFor, wantsCheck, hashFor } from '../../src/lib/gate.js';
import { keyFromHash } from '../../src/lib/unseal.js';

describe('screenFor', () => {
  it.each([
    ['nokey', 'nokey'], ['key', 'nokey'], ['wrongkey', 'oldlink'], ['network', 'offline'], ['timeout', 'offline'],
    ['damaged', 'reload'], ['format', 'reload'], ['shape', 'reload'], ['http', 'reload'], ['unexpected', 'reload'],
  ])('%s shows the %s screen', (code, screen) => { expect(screenFor(code)).toBe(screen); });
});

describe('wantsCheck / hashFor', () => {
  const k = 'A'.repeat(43);
  it('finds the check flag alone or beside the key, not inside other words', () => {
    expect(wantsCheck('#check')).toBe(true); expect(wantsCheck(`#k=${k}&check`)).toBe(true); expect(wantsCheck(`#check&k=${k}`)).toBe(true);
    expect(wantsCheck(`#k=${k}`)).toBe(false); expect(wantsCheck('#checks')).toBe(false); expect(wantsCheck('#xcheck')).toBe(false); expect(wantsCheck('')).toBe(false);
  });
  it('keeps the key readable and the check flag when it was there', () => {
    expect(hashFor(k, false)).toBe(`#k=${k}`); expect(hashFor(k, true)).toBe(`#k=${k}&check`);
    expect(keyFromHash(hashFor(k, true))).toBe(k); expect(wantsCheck(hashFor(k, true))).toBe(true);
  });
});
