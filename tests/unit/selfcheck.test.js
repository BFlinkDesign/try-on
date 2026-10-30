// @ts-check
import { describe, it, expect } from 'vitest';
import { CHECKS, STATUSES, formatResults, canvasStatus, canvasDetail } from '../../src/lib/selfcheck.js';

describe('self-check rows and text', () => {
  it('has the eleven checks the plan asks for, each once', () => {
    expect(CHECKS.map(c => c.id)).toEqual(['unlocked', 'keysource', 'homescreen', 'persisted', 'indexeddb', 'share', 'canvas', 'picker', 'crypto', 'screen', 'version']);
    expect(new Set(CHECKS.map(c => c.name)).size).toBe(CHECKS.length);
  });
  it('writes one line per row with its status, plus a header with the counts', () => {
    const rows = CHECKS.map((c, i) => ({ ...c, status: STATUSES[i % 3], detail: `d${i}` }));
    const t = formatResults(rows, new Date(2026, 9, 30, 8, 5));
    const lines = t.trimEnd().split('\n');
    expect(lines[0]).toBe('Try-on self-check, 2026-10-30 08:05 (4 PASS, 4 FAIL, 3 UNKNOWN)');
    expect(lines.slice(1)).toEqual(rows.map(r => `${r.status.padEnd(7)} ${r.name}: ${r.detail}`));
  });
  it('reports the largest canvas that worked, and FAIL when none did', () => {
    expect(canvasStatus([[4096, true], [6000, true], [8192, false]])).toBe('PASS');
    expect(canvasDetail([[4096, true], [6000, true], [8192, false]])).toBe('6000 x 6000 px drawn and read back (4096 ok, 6000 ok, 8192 failed)');
    expect(canvasStatus([[4096, false]])).toBe('FAIL');
    expect(canvasDetail([[4096, false]])).toBe('no size worked (4096 failed)');
  });
});
