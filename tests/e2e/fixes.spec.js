// @ts-check
// Fixes from the independent end-to-end pass (October 30, 2026), one check each.
import { test, assertCheck, st, click, SAMPLE_JPG } from './helpers.js';
import { designPng } from '../../scripts/lib/synthetic.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @param {Page} p */
const photoCount = p => p.evaluate(() => window.__tryon?.S.photos.length ?? -1);

test('toast_does_not_block_taps', async ({ open }) => {
  const p = await open({ label: 'web', hasTouch: false, viewport: { width: 390, height: 844 } });
  let downloads = 0; p.on('download', () => { downloads++; });
  await p.click('[data-f="pdf"]');                                   // a download, and its toast
  await p.waitForSelector('#toast:not([hidden])');
  const tb = /** @type {{ x: number, y: number, width: number, height: number }} */ (await p.locator('#toast').boundingBox());
  // bring the SVG button under the toast, then tap the toast's middle
  const bb = /** @type {{ x: number, y: number, width: number, height: number }} */ (await p.locator('[data-f="svg"]').boundingBox());
  await p.evaluate(dy => window.scrollBy(0, dy), (bb.y + bb.height / 2) - (tb.y + tb.height / 2));
  const b2 = /** @type {{ x: number, y: number, width: number, height: number }} */ (await p.locator('[data-f="svg"]').boundingBox());
  const t2 = /** @type {{ x: number, y: number, width: number, height: number }} */ (await p.locator('#toast').boundingBox());
  const x = Math.max(b2.x, t2.x) + 10, y = t2.y + t2.height / 2;
  const covered = x < t2.x + t2.width && y > b2.y && y < b2.y + b2.height && await p.isVisible('#toast');
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }).catch(() => null), p.mouse.click(x, y)]);
  assertCheck('toast_does_not_block_taps', { ok: covered && !!d && /\.svg$/.test(d.suggestedFilename()) && downloads === 2, detail: { covered, got: d?.suggestedFilename(), downloads } });
});

test('zero_length_size_line_discarded', async ({ open }) => {
  const p = await open({ label: 'main' });
  await p.click('[data-step="1"] [data-next]');
  await click(p, 100, 300); await click(p, 101, 300);                // the second tap lands on the first
  const r1 = await p.evaluate(() => { const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S; return { cal: S.photos[S.cur].cal, pending: S.pending }; });
  const note1 = (await p.textContent('#calNote')) ?? '', applyHidden1 = !(await p.isVisible('#calApply'));
  await click(p, 100, 300); await click(p, 400, 300);                // a fresh start works
  const note2 = (await p.textContent('#calNote')) ?? '', applyShown2 = await p.isVisible('#calApply');
  await p.click('#calApply'); const s = await st(p);
  const neverLengthWithoutButton = !(applyHidden1 && /That line is/.test(note1));
  assertCheck('zero_length_size_line_discarded', {
    ok: r1.cal === null && r1.pending === null && /Tap the other end, a bit away from the first/.test(note1) && applyHidden1 && neverLengthWithoutButton
      && /That line is/.test(note2) && applyShown2 && Math.abs(/** @type {number} */ (s.ppi) - 300 / 3.370) < 0.01,
    detail: { r1, note1, note2, ppi: s.ppi },
  });
});

test('text_inputs_16px', async ({ open }) => {
  const p = await open({ label: 'main' });
  const sizes = await p.$$eval('input[type="text"], input[type="number"], input:not([type]), textarea', els => els.map(e => [e.id, parseFloat(getComputedStyle(e).fontSize)]));
  const ids = sizes.map(s => s[0]), small = sizes.filter(([, f]) => /** @type {number} */ (f) < 16);
  const want = ['calLen', 'wIn', 'hIn', 'xIn', 'yIn', 'rDeg', 'keyText', 'checkText'];
  assertCheck('text_inputs_16px', { ok: want.every(w => ids.includes(w)) && small.length === 0, detail: { small, ids } });
});

test('first_own_photo_replaces_sample', async ({ open }) => {
  const p = await open({ label: 'main' });
  const before = await photoCount(p);
  await p.setInputFiles('#photoInput', SAMPLE_JPG);
  await p.waitForFunction(() => window.__tryon?.S.step === 2, null, { timeout: 10_000 });
  const one = await p.evaluate(() => { const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S; return { n: S.photos.length, sample: S.photos.some(r => r.src === S.assets.sample) }; });
  const count1 = (await p.textContent('#photoCount')) ?? '';
  await p.evaluate(() => window.__tryon?.goStep(1));
  await p.setInputFiles('#photoInput', SAMPLE_JPG); await p.waitForFunction(() => window.__tryon?.S.photos.length === 2, null, { timeout: 10_000 });
  const count2 = (await p.textContent('#photoCount')) ?? '';
  assertCheck('first_own_photo_replaces_sample', { ok: before === 1 && one.n === 1 && !one.sample && !/2 photos/.test(count1) && /^2 photos/.test(count2), detail: { before, one, count1, count2 } });
});

test('ruler_fraction_reads_right', async ({ open }) => {
  const p = await open({ label: 'main' });
  await p.click('[data-step="1"] [data-next]');
  await p.click('#refChoices [data-what="the two marks you know"]');
  await p.fill('#calLen', '11/16');
  await click(p, 100, 300); await click(p, 400, 300);
  const note = (await p.textContent('#calNote')) ?? '';
  await p.click('#calApply'); const s = await st(p);
  assertCheck('ruler_fraction_reads_right', { ok: /That line is 11\/16"/.test(note) && Math.abs(/** @type {number} */ (s.ppi) - 300 / 0.6875) < 0.01, detail: { note, ppi: s.ppi } });
});

test('tap_areas_44px', async ({ open }) => {
  const p = await open({ label: 'main' });
  await p.click('[data-step="1"] [data-next]');
  await click(p, 200, 300); await click(p, 700, 300);                 // a size line: its end dots are on screen
  /** @param {string} sel */
  const measure = sel => p.$$eval(sel, els => els.map(e => {
    const r = e.getBoundingClientRect(), b = getComputedStyle(e, '::before');
    const bw = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.width) || 0 : 0, bh = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.height) || 0 : 0;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    // spots 20 px from the middle must still be this control (the tap area is real, not only drawn): above and below
    // for buttons; for the design's dots, outward from the design's middle (inward, neighbouring dots may share space)
    const art = e.closest('.art'), ar = art?.getBoundingClientRect();
    /** @type {[number, number][]} */
    let probes = [[cx, cy - 20], [cx, cy + 20]];
    if (ar) { const ux = cx - (ar.x + ar.width / 2), uy = cy - (ar.y + ar.height / 2), d = Math.hypot(ux, uy) || 1; probes = [[cx + 20 * ux / d, cy + 20 * uy / d]]; }
    const hits = probes.map(([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h)); });
    return { sel: e.className && typeof e.className === 'string' ? e.className : e.getAttribute('class'), w: Math.max(r.width, bw), h: Math.max(r.height, bh), hits };
  }));
  const ends = await p.$$eval('.mlayer circle.hit', els => els.map(e => ({ sel: 'end hit', w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, hits: [true, true] })));
  await p.evaluate(() => window.__tryon?.goStep(3)); await p.click('#bannerBtn');   // the design's dots, in move mode
  const found = [...ends, ...await measure('.h.c'), ...await measure('.h.e'), ...await measure('.h.n'), ...await measure('.rot'), ...await measure('.photo-bar .mini'), ...await measure('.prog button')];
  const small = found.filter(f => f.w < 44 || f.h < 44 || !f.hits.every(Boolean));
  assertCheck('tap_areas_44px', { ok: ends.length === 2 && found.length >= 2 + 4 + 2 + 2 + 1 + 5 + 4 && small.length === 0, detail: { n: found.length, ends: ends.length, small } });
});

test('small_photo_refused', async ({ open }) => {
  const p = await open({ label: 'main' });
  await p.setInputFiles('#photoInput', { name: 'tiny.png', mimeType: 'image/png', buffer: designPng(100, 'fill') });   // 600 x 150 px
  await p.waitForSelector('#toast:not([hidden])');
  const msg = (await p.textContent('#toast')) ?? '', n = await photoCount(p), step = await p.evaluate(() => window.__tryon?.S.step);
  assertCheck('small_photo_refused', { ok: /tiny\.png is too small\. Use a photo at least 600 pixels on its short side/.test(msg) && n === 1 && step === 1, detail: { msg, n, step } });
});

test('double_tap_saves_once', async ({ open }) => {
  const p = await open({ label: 'web', hasTouch: false });
  let downloads = 0; p.on('download', () => { downloads++; });
  await p.dblclick('[data-f="pdf"]'); await p.waitForTimeout(1500);
  const afterDouble = downloads;
  await p.click('[data-f="pdf"]'); await p.waitForTimeout(500);       // a tap a second later is a new save
  assertCheck('double_tap_saves_once', { ok: afterDouble === 1 && downloads === 2, detail: { afterDouble, downloads } });
});

test('step3_banner_text', async ({ open }) => {
  const p = await open({ label: 'main' });
  await p.evaluate(() => window.__tryon?.goStep(3));
  const t = (await p.textContent('#bannerMsg')) ?? '';
  assertCheck('step3_banner_text', { ok: t === 'First tap the arm where the tattoo goes. Then drag the dots to adjust.' && await p.isVisible('#banner'), detail: t });
});
