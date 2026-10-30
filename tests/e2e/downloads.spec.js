// @ts-check
// Saving files through the platform "downloads" capability, and the step 4 picture (full-downloads.js).
// A stand-in for window.claude is installed before the page's scripts run; its mode decides how use() and save() answer.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, assertCheck, EXPECTED, NAMES, PREVIEW_PREFIX, SAMPLE_JPG, in8, shownPictureSha, pictureVsRenders } from './helpers.js';
import { runMain } from './flow.js';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('./helpers.js').Result} Result */

/** @param {Page} p */
const saves = p => p.evaluate(() => /** @type {{ filename: string, sha: string }[]} */ (/** @type {any} */ (window).__saves));
/** @param {Page} p */
const toastText = async p => (await p.textContent('#toast')) ?? '';
/** @param {Page} p */
const makePicture = async p => { await p.evaluate(() => window.__tryon?.goStep(4)); await p.click('#snapBtn'); await p.waitForSelector('#snapImg[src]'); };
/** @param {string} file */
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const today = () => { const d = new Date(), p2 = (/** @type {number} */ n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

// ---- an ordinary web host (no window.claude): the browser's own downloads, real files on disk, exact bytes
test('web_host_downloads_exact_files', async ({ open }) => {
  const p = await open({ label: 'web', hasTouch: false });
  const ui = await p.isVisible('#dlBox') && !(await p.isVisible('#dlNone')) && !(await p.isVisible('#dlWait')) && (await p.textContent('#dlHow')) === 'Tap a file to download it.';
  await p.click('#dlExtra summary');
  /** @type {[string, string][]} */
  const got = [];
  for (const b of await p.$$('[data-f]')) {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), b.click()]);
    got.push([d.suggestedFilename(), sha(await d.path())]);
  }
  await makePicture(p);
  const shownSha = await p.evaluate(shownPictureSha);
  const [dp] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#dlPic')]);
  const picOk = new RegExp(`^${PREVIEW_PREFIX}-preview-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.jpg$`).test(dp.suggestedFilename()) && sha(await dp.path()) === shownSha;
  const filesOk = got.length === 6 && got.every(([n, h]) => /** @type {Record<string, string>} */ (EXPECTED)[n] === h) && new Set(got.map(g => g[0])).size === 6;
  assertCheck('web_host_downloads_exact_files', { ok: ui && filesOk && picOk, detail: { ui, picOk, got: got.map(([n, h]) => [n, h.slice(0, 12)]) } });
});

// ---- saved: every file, exact bytes; the picture; clearing; captions; uploaded design; guide; storage
/** @typedef {{ notesUnmeasured?: string }} SavedCtx */
/** @type {[string, (p: Page, c: SavedCtx, main?: import('./flow.js').Ctx) => Promise<Result>][]} */
const SAVED = [
  ['six_files_saved_exact_bytes', async p => {
    const ready = await p.isVisible('#dlBox') && !(await p.isVisible('#dlWait')) && !(await p.isVisible('#dlNone'));
    await p.click('#dlExtra summary');
    for (const b of await p.$$('[data-f]')) { await b.click(); await p.waitForTimeout(150); }
    const got = await saves(p), msg = await toastText(p);
    const ok = got.length === 6 && got.every(s => /** @type {Record<string, string>} */ (EXPECTED)[s.filename] === s.sha) && new Set(got.map(s => s.filename)).size === 6;
    return { ok: ready && ok && /Handed to your device/.test(msg), detail: { got: got.map(s => [s.filename, s.sha.slice(0, 12)]), msg } };
  }],
  ['picture_saved_as_shown', async (p, c) => {
    await makePicture(p);
    c.notesUnmeasured = await p.$eval('#snapImg', i => /** @type {HTMLElement} */ (i).dataset.notes || '');
    const shownSha = await p.evaluate(shownPictureSha);
    const day = await p.evaluate(today);
    await p.click('#dlPic'); await p.waitForTimeout(200);
    const pic = (await saves(p)).at(-1);
    return { ok: !!pic && pic.sha === shownSha && new RegExp(`^${PREVIEW_PREFIX}-preview-${day}-\\d{4}\\.jpg$`).test(pic.filename), detail: pic && { filename: pic.filename, same: pic.sha === shownSha } };
  }],
  ['picture_cleared_when_anything_changes', async p => {
    await p.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('bigger')).click());
    const clearedByMove = !(await p.isVisible('#snapOut')) && !(await p.$eval('#snapImg', i => i.hasAttribute('src')));
    await makePicture(p);
    await p.evaluate(() => { const o = /** @type {HTMLInputElement} */ (document.getElementById('opacity')); o.value = '0.5'; o.dispatchEvent(new Event('input')); });
    const clearedByInk = !(await p.isVisible('#snapOut'));
    await p.evaluate(() => { const t = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon); t.S.photos = [t.sampleRecord(), t.sampleRecord()]; t.select(0); });
    await makePicture(p);
    await p.click('#more summary'); await p.click('#removePhoto'); await p.click('#removePhoto'); await p.waitForTimeout(200);
    const clearedByRemove = !(await p.isVisible('#snapOut')) && await p.evaluate(() => window.__tryon?.S.photos.length === 1);
    return { ok: clearedByMove && clearedByInk && clearedByRemove, detail: { clearedByMove, clearedByInk, clearedByRemove } };
  }],
  // the picture reads the same way as the screen, flipped or not
  ['picture_reads_same_way_as_screen', async p => {
    await p.evaluate(() => { const o = /** @type {HTMLInputElement} */ (document.getElementById('opacity')); o.value = '1'; o.dispatchEvent(new Event('input')); window.__tryon?.goStep(3); });
    await makePicture(p); const plain = await p.evaluate(pictureVsRenders);
    await p.evaluate(() => window.__tryon?.goStep(3)); await p.click('#flip'); await makePicture(p); const flipped = await p.evaluate(pictureVsRenders);
    const r = { ok: plain.dScreen * 3 < plain.dOther && flipped.dScreen * 3 < flipped.dOther, detail: { plain, flipped } };
    await p.evaluate(() => window.__tryon?.goStep(3)); await p.click('#unflip');
    return r;
  }],
  ['picture_captions', async (p, c, main) => {
    await p.evaluate(() => { const t = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon); t.S.photos[t.S.cur].w *= 1.3; t.render(); }); await makePicture(p);
    const notesStretched = await p.$eval('#snapImg', i => /** @type {HTMLElement} */ (i).dataset.notes || '');
    // later checks replay this phase only for its actions; the placement scenario is run only for picture_captions itself
    if (!main || !main.geomAtPic) return { ok: false, detail: 'placement scenario values not available' };
    const m = main, g = main.geomAtPic, ppi = /** @type {number} */ (g.ppi);
    const wantMeasured = `About ${in8(g.w / ppi)} wide × ${in8(g.h / ppi)} tall on the arm (measured from the photo) | Mirrored: the writing reads backwards`;
    return { ok: !!m.flipWarn && m.notesMeasured === wantMeasured && c.notesUnmeasured === 'Size not measured: not true size' && /Stretched out of shape/.test(notesStretched),
      detail: { measuredFlipped: m.notesMeasured, want: wantMeasured, unmeasured: c.notesUnmeasured, stretched: notesStretched, flipWarn: m.flipWarn } };
  }],
  ['uploaded_design_hides_art_files', async p => {
    const ids = () => p.evaluate(() => JSON.stringify(window.__tryon?.S.photos.map(r => [r.id, r.cx, r.cy])));
    const before = await ids();
    await p.setInputFiles('#artInput', SAMPLE_JPG); await p.waitForTimeout(400);
    const hidWithUpload = !(await p.isVisible('#dlBox')) && await p.isVisible('#dlCustom');
    await p.click('#origArt'); await p.waitForTimeout(200);
    const back = await p.evaluate(() => { const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S; return S.artSrc === S.assets.art && S.artTrueIn === 6; }), after = await ids();
    return { ok: hidWithUpload && back && before === after && await p.isVisible('#dlBox') && !(await p.isVisible('#dlCustom')), detail: { hidWithUpload, back, photosKept: before === after } };
  }],
  ['guide_matches_buttons', async p => {
    await p.click('#guide summary');
    const gt = (await p.textContent('#guide')) ?? '', labels = await p.$$eval('#guide b', bs => bs.map(b => (b.textContent ?? '').trim()).filter(t => /(PDF|PNG|SVG)$/.test(t)));
    const buttons = await p.$$eval('[data-f]', bs => bs.map(b => (b.textContent ?? '').trim()));
    return { ok: labels.length >= 4 && labels.every(l => buttons.includes(l)) && /Actual size \(100%\)/.test(gt) && /6-inch bar/.test(gt) && /not mirrored/.test(gt) && /Do not flip/.test(gt), detail: { labels, buttons } };
  }],
  // built-in design is never restored from storage; an uploaded one is
  ['old_saved_design_not_restored', async p => {
    /** @param {Record<string, unknown>} state */
    const writeState = state => p.evaluate(state => new Promise(res => {
      const t = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon);
      t.idb().then(db => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(Object.assign({ v: 3, photos: t.S.photos, cur: 0, step: 1, artAspect: 3, opacity: '0.9' }, state), 'current'); tx.oncomplete = res; });
    }), state);
    const reload = async () => { await p.reload(); await p.waitForFunction(() => window.__tryon?.S.booted, null, { timeout: 15_000 }); await p.waitForTimeout(900); };
    await p.waitForTimeout(600);
    await writeState({ artSrc: 'data:image/svg+xml;base64,T0xE', artTrueIn: 6 }); await reload();
    const oldDefaultIgnored = await p.evaluate(() => { const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S; return S.artSrc === S.assets.art && S.artTrueIn === 6; });
    await p.waitForTimeout(600);
    await writeState({ artSrc: 'data:image/svg+xml;base64,TUlORQ==', artTrueIn: null }); await reload();
    const uploadKept = await p.evaluate(() => { const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S; return S.artSrc === 'data:image/svg+xml;base64,TUlORQ==' && S.artTrueIn === null; });
    return { ok: oldDefaultIgnored && uploadKept, detail: { oldDefaultIgnored, uploadKept } };
  }],
];

for (const [name] of SAVED) {
  test(name, async ({ open }) => {
    // picture_captions also reads the measured, flipped caption from the placement scenario, as full.js passed it on
    const main = name === 'picture_captions' ? (await runMain(await open({ label: 'main' }), 'step4_picture')).c : undefined;
    const p = await open({ mode: 'saved', hasTouch: false });
    /** @type {SavedCtx} */
    const c = {};
    for (const [n, phase] of SAVED) {
      const result = await phase(p, c, main);
      if (n === name) { assertCheck(name, result); break; }
    }
  });
}

// ---- platform answers null, or refuses: no buttons, say how to get the files
for (const mode of ['null', 'reject']) {
  test(`platform_${mode}_says_how_to_get_files`, async ({ open }) => {
    const p = await open({ mode, hasTouch: false });
    const ok = await p.isVisible('#dlNone') && !(await p.isVisible('#dlBox')) && !(await p.isVisible('#dlWait')) && /claude\.ai/.test((await p.textContent('#dlNone')) ?? '');
    assertCheck(`platform_${mode}_says_how_to_get_files`, { ok, detail: await p.textContent('#dlNone') });
  });
}

// ---- declined: says so, keeps everything
test('declined_keeps_buttons', async ({ open }) => {
  const p = await open({ mode: 'declined', hasTouch: false });
  await p.click('[data-f="pdf"]'); await p.waitForTimeout(200);
  assertCheck('declined_keeps_buttons', { ok: (await toastText(p)) === 'Not saved.' && await p.isVisible('#dlBox') && await p.isEnabled('[data-f="pdf"]'), detail: await toastText(p) });
});

// ---- rate limited: neutral wait message, keeps everything
test('rate_limited_says_wait', async ({ open }) => {
  const p = await open({ mode: 'rate_limited', hasTouch: false });
  await p.click('[data-f="png"]'); await p.waitForTimeout(200);
  assertCheck('rate_limited_says_wait', { ok: /wait a moment/.test(await toastText(p)) && await p.isVisible('#dlBox') && await p.isEnabled('[data-f="png"]'), detail: await toastText(p) });
});

// ---- one format switched off: only that format's buttons stop, with a lasting note
test('format_off_disables_only_that_format', async ({ open }) => {
  const p = await open({ mode: 'ext_pdf', hasTouch: false });
  await p.click('[data-f="pdf"]'); await p.waitForTimeout(200); const m1 = await toastText(p);
  const pdfOff = await p.isDisabled('[data-f="pdf"]') && await p.isDisabled('[data-f="sheet"]');
  const pngOn = await p.isEnabled('[data-f="png"]');
  if (pngOn) { await p.click('[data-f="png"]'); await p.waitForTimeout(200); }
  const pngSaved = pngOn && (await saves(p)).some(s => s.filename === NAMES.png) && /Handed/.test(await toastText(p));
  const note = (await p.isVisible('#dlBlocked')) ? (await p.textContent('#dlBlocked')) ?? '' : '';
  assertCheck('format_off_disables_only_that_format', { ok: /can't save \.pdf/.test(m1) && pdfOff && pngSaved && await p.isEnabled('[data-f="svg"]') && /^PDF files can't be saved here/.test(note), detail: { m1, pdfOff, pngSaved, note } });
});

// ---- unavailable during a save: hide every save control, say saving stopped
test('unavailable_hides_saving', async ({ open }) => {
  const p = await open({ mode: 'unavailable', hasTouch: false });
  await p.click('[data-f="pdf"]'); await p.waitForTimeout(200);
  const none = (await p.textContent('#dlNone')) ?? '';
  assertCheck('unavailable_hides_saving', { ok: !(await p.isVisible('#dlBox')) && await p.isVisible('#dlNone') && /stopped working/.test(none) && await p.$eval('#dlPic', e => /** @type {HTMLElement} */ (e).hidden === true), detail: none });
});

// ---- the rest of the contract's codes, each with the spec's outcome
test('every_other_error_code_handled', async ({ open }) => {
  const p = await open({ mode: 'codes', hasTouch: false });
  /** @param {string} code @param {string} f */
  const tryCode = async (code, f) => {
    const sel = `[data-f="${f}"]`;
    if (!(await p.isVisible(sel)) || !(await p.isEnabled(sel))) return { code, skipped: 'button not available' };
    await p.evaluate(c => { /** @type {any} */ (window).__nextCode = c; }, code); await p.click(sel); await p.waitForTimeout(150);
    return { code, toast: await toastText(p), box: await p.isVisible('#dlBox'), on: await p.isEnabled(`[data-f="${f}"]`).catch(() => false) };
  };
  /** @type {{ code: string, skipped?: string, toast?: string, box?: boolean, on?: boolean }[]} */
  const r = [];
  for (const c of ['too_large', 'bad_request', 'transform_error', '(no code)']) r.push(await tryCode(c, 'svg'));
  r.push(await tryCode('rejected_extension', 'png'));
  r.push(await tryCode('capability_removed', 'pdf'));
  const [big, bad, tr, none, rej, gone] = r, kept = (/** @type {typeof r[number]} */ x) => !!x.box && !!x.on;
  const ok = r.every(x => !x.skipped) && big.toast === 'That file is too big to save here.' && kept(big)
    && [bad, tr, none].every(x => x.toast === 'Something went wrong saving that file. Please try again.' && kept(x))
    && /can't save \.png/.test(rej.toast ?? '') && !!rej.box && !rej.on && await p.isEnabled('[data-f="svg"]').catch(() => false) === true
    && !gone.box && /stopped working/.test((await p.textContent('#dlNone')) ?? '');
  assertCheck('every_other_error_code_handled', { ok, detail: r });
});

// ---- platform never answers: the page still works; buttons wait
test('page_works_while_platform_silent', async ({ open }) => {
  const p = await open({ mode: 'never', hasTouch: false });
  await p.waitForTimeout(600);
  const works = await p.evaluate(() => window.__tryon?.S.photos.length === 1);
  await p.click('[data-step="1"] [data-next]'); const step = await p.evaluate(() => window.__tryon?.S.step);
  assertCheck('page_works_while_platform_silent', { ok: works && step === 2 && await p.isVisible('#dlWait') && !(await p.isVisible('#dlBox')), detail: { works, step } });
});

// ---- a save in progress: its button is off, a second tap does nothing
test('button_busy_during_save', async ({ open }) => {
  const p = await open({ mode: 'slow', hasTouch: false });
  await p.click('[data-f="svg"]'); const busy = await p.isDisabled('[data-f="svg"]');
  await p.click('[data-f="svg"]', { force: true }); await p.waitForTimeout(900);
  const n = (await saves(p)).length;
  assertCheck('button_busy_during_save', { ok: busy && n === 1 && await p.isEnabled('[data-f="svg"]'), detail: { busy, saves: n } });
});
