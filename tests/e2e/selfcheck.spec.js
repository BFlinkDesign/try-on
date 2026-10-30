// @ts-check
// "Check this phone": every row renders with PASS / FAIL / UNKNOWN, Copy puts the same text on the clipboard, and the
// text holds no key and no private word. Opened by "&check" in the link, and from More options.
import { test, assertCheck, KEYED, TEST_KEY, MANIFEST_JSON } from './helpers.js';
import { DEFAULT_PHRASES } from '../../scripts/leakscan.mjs';

const IDS = ['unlocked', 'keysource', 'homescreen', 'persisted', 'indexeddb', 'share', 'canvas', 'picker', 'crypto', 'screen', 'version'];

test('self_check_rows_and_copy', { tag: '@phone' }, async ({ open }) => {
  const p = await open({ url: `${KEYED}&check`, label: 'check' });
  await p.waitForSelector('#checkCopy:not([disabled])', { timeout: 60_000 });
  const rows = await p.$$eval('#checkRows li', ls => ls.map(l => ({ id: /** @type {HTMLElement} */ (l).dataset.check, status: /** @type {HTMLElement} */ (l).dataset.status, text: l.textContent ?? '' })));
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('#checkCopy');
  const copied = await p.evaluate(() => navigator.clipboard.readText());
  const shown = await p.inputValue('#checkText');
  const lower = copied.toLowerCase();
  const leaks = [...DEFAULT_PHRASES, ...MANIFEST_JSON.phrases, TEST_KEY.toLowerCase(), ...Object.values(MANIFEST_JSON.text.fileNames)].filter(w => lower.includes(w.toLowerCase()));
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const version = (await import('../../package.json', { with: { type: 'json' } })).default.version;
  const ok = JSON.stringify(rows.map(r => r.id)) === JSON.stringify(IDS) && rows.every(r => ['PASS', 'FAIL', 'UNKNOWN'].includes(String(r.status)))
    && byId.unlocked.status === 'PASS' && byId.keysource.status === 'PASS' && /from the link/.test(byId.keysource.text)
    && byId.indexeddb.status === 'PASS' && byId.crypto.status === 'PASS' && byId.canvas.status === 'PASS' && byId.version.text.includes(version)
    && copied === shown && copied.trimEnd().split('\n').length === IDS.length + 1 && leaks.length === 0;
  assertCheck('self_check_rows_and_copy', { ok, detail: { rows: rows.map(r => `${r.status} ${r.id}`), leaks, lines: copied.split('\n').length } });
});

test('self_check_from_more_options', async ({ open }) => {
  const p = await open({ label: 'check' });
  const hiddenAtStart = !(await p.isVisible('#check'));
  await p.click('#more summary'); await p.click('#checkBtn');
  await p.waitForSelector('#checkCopy:not([disabled])', { timeout: 60_000 });
  const n = await p.$$eval('#checkRows li', ls => ls.length);
  assertCheck('self_check_from_more_options', { ok: hiddenAtStart && n === IDS.length, detail: { hiddenAtStart, n } });
});

test('self_check_when_locked', async ({ open }) => {
  // no key at all: the check still runs and says the page did not open
  const p = await open({ url: './#check', ready: false, label: 'check' });
  await p.waitForSelector('#checkCopy:not([disabled])', { timeout: 60_000 });
  const st = await p.$eval('#checkRows li[data-check="unlocked"]', l => /** @type {HTMLElement} */ (l).dataset.status);
  assertCheck('self_check_when_locked', { ok: st === 'FAIL' && await p.isVisible('#gateNoKey'), detail: st });
});

