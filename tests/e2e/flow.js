// @ts-check
// The placement scenario from full.js, as ordered phases. Each phase does what full.js did at that point and returns
// its check's result. A test replays the phases up to its own, then asserts only its own check: like full.js, an
// earlier check failing does not stop a later check from being judged on its own.
import { st, scr, click, corner, dragHandle } from './helpers.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {Awaited<ReturnType<typeof st>>} State */
/** @typedef {import('./helpers.js').Result} Result */
/**
 * Values later phases (and the downloads checks) read from earlier ones.
 * @typedef {{ s?: State, before?: State, listText?: string[], flipWarn?: boolean, notesMeasured?: string, geomAtPic?: State }} Ctx
 */
/** @typedef {[string, (p: Page, c: Ctx) => Promise<Result>]} Phase */

/** @param {Page} p */
const lens = p => p.evaluate(() => /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S.photos[/** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S.cur].measures.map(L => Math.round(Math.hypot(L.b.x - L.a.x, L.b.y - L.a.y))));

/** @type {Phase[]} */
export const MAIN = [
  ['opens_on_step_1_without_inch_values', async (p, c) => {
    const s = c.s = await st(p);
    return { ok: s.step === 1 && !s.ppiSet && await p.isVisible('[data-step="1"]') && (await p.inputValue('#wIn')) === '', detail: s.step };
  }],
  // STEP 2: size from the credit card default, 300 photo px = 3.370 in
  ['step2_size_math', async (p, c) => {
    await p.click('[data-step="1"] [data-next]');
    const bannerOn2 = await p.isVisible('#banner');
    await click(p, 100, 300); await click(p, 400, 300);
    const applyVisible = await p.isVisible('#calApply');
    await p.click('#calApply'); const s = c.s = await st(p);
    return { ok: s.ppiSet && Math.abs(/** @type {number} */ (s.ppi) - 300 / 3.370) < 0.01 && bannerOn2 && applyVisible, detail: { ppi: s.ppi, expected: 300 / 3.370 } };
  }],
  ['step2_shows_real_6in', async (p, c) => {
    const s = /** @type {State} */ (c.s);
    return { ok: Math.abs(s.w / /** @type {number} */ (s.ppi) - 6) < 1e-9 && await p.isVisible('#sizeDone'), detail: s.w / /** @type {number} */ (s.ppi) };
  }],
  // STEP 3: entering starts "tap the arm"; tap the forearm
  ['step3_auto_lines_up_with_arm', async (p, c) => {
    await p.click('#sizeNext'); let s = await st(p);
    const alignArmed = s.mode === 'align' && await p.isVisible('#banner');
    await click(p, 330, 800); s = c.s = await st(p);
    return { ok: alignArmed && !!s.axis && s.a > -20 && s.a < -10 && s.mode === 'art', detail: { angle: s.a, center: [Math.round(s.cx), Math.round(s.cy)] } };
  }],
  ['refuses_non_skin_tap', async (p, c) => {
    const before = c.before = await st(p);
    await p.click('#alignBtn'); await click(p, 800, 120); const after = await st(p); const msg = await p.textContent('#toast');
    const r = { ok: before.a === after.a && before.cx === after.cx && /not look like skin/.test(msg ?? ''), detail: msg };
    if (await p.isVisible('#bannerBtn')) await p.click('#bannerBtn');
    return r;
  }],
  // corner = diagonal: shape kept and the opposite corner stays put
  ['corner_scales_diagonally', async (p, c) => {
    let s = await st(p); const nw0 = corner(s, -s.w / 2, -s.h / 2), r0 = s.w / s.h;
    await dragHandle(p, '.h[data-c="se"]', 40, 25); s = await st(p); const nw1 = corner(s, -s.w / 2, -s.h / 2);
    const before = /** @type {State} */ (c.before);
    return { ok: Math.abs(s.w / s.h - r0) < 1e-9 && s.w > before.w && Math.hypot(nw1[0] - nw0[0], nw1[1] - nw0[1]) < 1e-6, detail: { ratioBefore: r0, ratioAfter: s.w / s.h, oppositeCornerMovedPx: Math.hypot(nw1[0] - nw0[0], nw1[1] - nw0[1]) } };
  }],
  // side tab = width only
  ['side_tab_stretches_width_only', async p => {
    const s0 = await st(p); const w0 = corner(s0, -s0.w / 2, 0);
    await dragHandle(p, '.h[data-c="e"]', 50, -13); const s = await st(p); const w1 = corner(s, -s.w / 2, 0);
    return { ok: s.w > s0.w && Math.abs(s.h - s0.h) < 1e-9 && Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) < 1e-6 && await p.isVisible('#stretchNote'), detail: { w: [s0.w, s.w], h: [s0.h, s.h] } };
  }],
  // top tab = height only
  ['top_tab_stretches_height_only', async p => {
    const s0 = await st(p); await dragHandle(p, '.h[data-c="n"]', -5, -20); const s = await st(p);
    return { ok: s.h > s0.h && Math.abs(s.w - s0.w) < 1e-9, detail: { w: [s0.w, s.w], h: [s0.h, s.h] } };
  }],
  ['put_back_in_shape', async p => {
    await p.click('#fixShape'); const s = await st(p);
    return { ok: Math.abs(s.w / s.h - s.aspect) < 1e-9 && !(await p.isVisible('#stretchNote')), detail: s.w / s.h };
  }],
  // simple buttons
  ['bigger_smaller_buttons', async p => {
    const s0 = await st(p); await p.click('#bigger'); let s = await st(p); const big = [s.w / s0.w, s.h / s0.h];
    await p.click('#smaller'); s = await st(p);
    return { ok: Math.abs(big[0] - 1.05) < 1e-9 && Math.abs(big[1] - 1.05) < 1e-9 && Math.abs(s.w - s0.w) < 1e-6 && Math.abs(s.h - s0.h) < 1e-6, detail: big };
  }],
  ['turn_button_5_degrees', async p => {
    const s0 = await st(p); await p.click('#turnR'); const s = await st(p);
    const r = { ok: Math.abs(s.a - s0.a - 5) < 1e-9, detail: s.a - s0.a };
    await p.click('#turnL');
    return r;
  }],
  // snapping onto the arm line, and Alt to skip it (start from centered on the arm line)
  ['pulls_onto_arm_line_alt_skips', async p => {
    await p.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('center')).click()); let s = await st(p);
    const axis = /** @type {NonNullable<State['axis']>} */ (s.axis);
    const [ax, ay] = await scr(p, s.cx, s.cy), ux = Math.cos(axis.ang * Math.PI / 180), uy = Math.sin(axis.ang * Math.PI / 180), nx = -uy, ny = ux;
    await p.mouse.move(ax, ay); await p.mouse.down(); await p.mouse.move(ax + 60 * ux + 30 * nx, ay + 60 * uy + 30 * ny, { steps: 4 }); await p.mouse.move(ax + 60 * ux + 5 * nx, ay + 60 * uy + 5 * ny, { steps: 4 }); await p.mouse.up();
    s = await st(p); const sAxis = /** @type {NonNullable<State['axis']>} */ (s.axis); const off = (s.cx - sAxis.x) * nx + (s.cy - sAxis.y) * ny;
    const [bx2, by2] = await scr(p, s.cx, s.cy);
    await p.keyboard.down('Alt'); await p.mouse.move(bx2, by2); await p.mouse.down(); await p.mouse.move(bx2 + 5 * nx, by2 + 5 * ny, { steps: 3 }); await p.mouse.up(); await p.keyboard.up('Alt');
    const s3 = await st(p), s3Axis = /** @type {NonNullable<State['axis']>} */ (s3.axis); const off2 = ((s3.cx - s3Axis.x) * nx + (s3.cy - s3Axis.y) * ny) * s3.k;
    return { ok: Math.abs(off) < 0.01 && Math.abs(off2 - 5) < 0.6, detail: { snapped: off, altScreenPx: off2 } };
  }],
  // undo / redo
  ['undo_redo', async p => {
    const s0 = await st(p); await p.click('#undoBtn'); let s = await st(p); const undone = s.cx !== s0.cx; await p.click('#redoBtn'); s = await st(p);
    return { ok: undone && s.cx === s0.cx, detail: { undone } };
  }],
  // arrow nudge = 1/16"
  ['arrow_nudge_1_16_in', async p => {
    const s0 = await st(p); await p.mouse.click(5, 5); await p.keyboard.press('ArrowRight'); const s = await st(p);
    return { ok: Math.abs((s.cx - s0.cx) / /** @type {number} */ (s.ppi) - 0.0625) < 1e-9, detail: (s.cx - s0.cx) / /** @type {number} */ (s.ppi) };
  }],
  // measuring (More options): three lines, remove the middle one by tapping it then its x, then Delete key
  ['remove_one_measure_line', async (p, c) => {
    await p.click('#more summary'); await p.click('#meaBtn');
    await click(p, 100, 300); await click(p, 200, 300); await click(p, 100, 420); await click(p, 300, 420); await click(p, 100, 540); await click(p, 400, 540);
    const l3 = await lens(p);
    await click(p, 200, 420);
    // the red x is redrawn on every render, so read its position in one step instead of holding an element handle
    const cb = /** @type {{ x: number, y: number }} */ (await (await p.waitForFunction(() => { const el = document.querySelector('.del circle'); if (!el) return null; const b = el.getBoundingClientRect(); return b.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }, null, { timeout: 3000 })).jsonValue());
    await p.mouse.click(cb.x, cb.y);
    const l2 = await lens(p); const listText = c.listText = await p.$$eval('#mlist li', l => l.map(x => x.textContent ?? ''));
    return { ok: JSON.stringify(l3) === '[100,200,300]' && JSON.stringify(l2) === '[100,300]', detail: { before: l3, after: l2, listText } };
  }],
  ['delete_key_removes_selected', async p => {
    await click(p, 150, 300); await p.keyboard.press('Delete');
    return { ok: JSON.stringify(await lens(p)) === '[300]', detail: await lens(p) };
  }],
  ['measure_reads_real_inches', async (p, c) => {
    const listText = c.listText ?? [];
    const r = { ok: listText.some(t => t.includes('3 3/8"')), detail: listText };
    await p.click('#meaBtn');
    return r;
  }],
  // zoom and pinch
  ['zoom_keeps_placement', async p => {
    const z0 = await st(p); await p.click('#zIn'); const z1 = await st(p);
    return { ok: z1.zoom === 1.5 && z1.cx === z0.cx && Math.abs(z1.k / z0.k - 1.5) < 0.01, detail: { k0: z0.k, k1: z1.k } };
  }],
  ['pinch_zoom', async p => {
    await p.evaluate(() => {
      const el = /** @type {HTMLElement} */ (document.getElementById('stage')), r = el.getBoundingClientRect(), cx = r.left + 300, cy = r.top + 300;
      /** @param {string} t @param {number} id @param {number} x @param {number} y */
      const ev = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
      ev('pointerdown', 1, cx - 50, cy); ev('pointerdown', 2, cx + 50, cy); ev('pointermove', 1, cx - 100, cy); ev('pointermove', 2, cx + 100, cy); ev('pointerup', 1, cx - 100, cy); ev('pointerup', 2, cx + 100, cy);
    });
    const z = (await st(p)).zoom;
    await p.click('#zFit');
    return { ok: Math.abs(z - 3) < 0.01, detail: z };
  }],
  // STEP 4: picture at full photo resolution, flip included
  ['step4_picture', async (p, c) => {
    await p.click('[data-go="3"]'); await p.click('#flip'); c.flipWarn = await p.isVisible('#flipNote'); await p.click('[data-go="4"]'); await p.click('#snapBtn'); await p.waitForTimeout(400);
    c.notesMeasured = await p.$eval('#snapImg', i => /** @type {HTMLElement} */ (i).dataset.notes || ''); c.geomAtPic = await st(p);
    const dims = await p.evaluate(() => new Promise(res => { const i = /** @type {HTMLImageElement} */ (document.getElementById('snapImg')); const go = () => res([i.naturalWidth, i.naturalHeight]); if (i.complete && i.naturalWidth) go(); else i.onload = go; }));
    const d = /** @type {[number, number]} */ (dims);
    return { ok: d[0] === 1050 && d[1] > 1400 && d[1] < 1400 + 200, detail: d };   // full photo plus a caption strip under it
  }],
  // work is kept after reload
  ['kept_after_reload', async p => {
    const keep = await st(p); await p.waitForTimeout(700); await p.reload();
    await p.waitForFunction(() => window.__tryon?.S.booted, null, { timeout: 15_000 }); await p.waitForTimeout(1200); const back = await st(p);
    return { ok: back.ppiSet && Math.abs(/** @type {number} */ (back.ppi) - /** @type {number} */ (keep.ppi)) < 1e-9 && back.flip && back.n === 1 && back.step === 4, detail: { step: back.step, n: back.n } };
  }],
  // measure again (step 2) removes the scale; start over needs a second tap
  ['measure_again_resets_scale', async p => {
    await p.click('[data-go="2"]'); await p.click('#calReset'); const s = await st(p);
    return { ok: !s.ppiSet && s.mode === 'cal' && await p.isDisabled('#wIn'), detail: s.mode };
  }],
  ['start_over_two_taps', async p => {
    await p.click('#more summary').catch(() => {}); if (!(await p.isVisible('#startOver'))) await p.click('#more summary');
    await p.click('#startOver'); const armedTxt = await p.textContent('#startOver'); await p.click('#startOver'); const s = await st(p);
    return { ok: /again/.test(armedTxt ?? '') && s.axis === null && s.step === 1, detail: armedTxt };
  }],
];

/**
 * Replays the scenario up to and including the phase named `upTo`; returns that phase's result and the shared values.
 * @param {Page} p
 * @param {string} upTo
 * @returns {Promise<{ result: Result, c: Ctx }>}
 */
export async function runMain(p, upTo) {
  if (!MAIN.some(([n]) => n === upTo)) throw new Error(`no phase ${upTo}`);
  /** @type {Ctx} */
  const c = {};
  for (const [name, phase] of MAIN) {
    const result = await phase(p, c);
    if (name === upTo) return { result, c };
  }
  throw new Error('unreachable');
}
