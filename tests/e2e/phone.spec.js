// @ts-check
// Phone checks (full.js and full-downloads.js). Run by the phone (390 x 844) and iPhone Pro Max (440 x 956, DPR 3,
// touch) projects at their own screen size.
import { test, assertCheck } from './helpers.js';

test('phone_no_sideways_scroll', { tag: '@phone' }, async ({ open }) => {
  const p = await open({ label: 'phone' });
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assertCheck('phone_no_sideways_scroll', { ok: sideways <= 0, detail: sideways });
});

// with the save buttons showing: nothing scrolls sideways; buttons are big enough to tap
test('phone_save_buttons_fit_and_tap', { tag: '@phone' }, async ({ open }) => {
  const p = await open({ mode: 'saved' });
  await p.click('#dlExtra summary'); await p.click('#guide summary');
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const small = await p.$$eval('[data-f], #files summary', els => els.map(e => [(e.textContent ?? '').trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => /** @type {number} */ (h) < 44));
  assertCheck('phone_save_buttons_fit_and_tap', { ok: sideways <= 0 && small.length === 0 && await p.isVisible('#dlBox'), detail: { sideways, small } });
});
