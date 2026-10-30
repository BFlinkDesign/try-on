// @ts-check
// Shared fixtures and helpers for the end-to-end checks. Ported from the single-file page's full.js and
// full-downloads.js; the check names and what each one asserts are unchanged.
import { test as base, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Every page's JS errors are logged here per test; tests/e2e/js-errors.teardown.js checks the log at the end. */
export const ERR_DIR = resolve(ROOT, process.env.E2E_OUT || 'test-results', '_js-errors');

// The end-to-end checks run against the SYNTHETIC build (npm run build): made-up photo, design and files, sealed with
// the committed test key. The build writes the made-up files and their SHA-256 manifest to .payload/synthetic/.
export const SYNTHETIC_DIR = join(ROOT, '.payload', 'synthetic');
const MANIFEST = join(SYNTHETIC_DIR, 'manifest.json');
if (!existsSync(MANIFEST)) throw new Error(`${MANIFEST} is missing: run npm run build (the synthetic build) before the end-to-end checks`);
/** @type {{ sample: { path: string, sha256: string }, art: { path: string }, files: Record<string, { name: string, sha256: string }>, phrases: string[], text: { previewPrefix: string, fileNames: Record<string, string> } }} */
export const MANIFEST_JSON = JSON.parse(readFileSync(MANIFEST, 'utf8'));
export const SAMPLE_JPG = join(SYNTHETIC_DIR, MANIFEST_JSON.sample.path);
/** Saved file name -> SHA-256, from the synthetic files' manifest (computed by the build from the files themselves). */
export const EXPECTED = Object.freeze(Object.fromEntries(Object.values(MANIFEST_JSON.files).map(f => [f.name, f.sha256])));
/** What each file is saved as, by button key, and the saved picture's name prefix. */
export const NAMES = Object.freeze(MANIFEST_JSON.text.fileNames);
export const PREVIEW_PREFIX = MANIFEST_JSON.text.previewPrefix;
/** The committed TEST key (opens only the synthetic payload) and the page's address with it. */
export const TEST_KEY = readFileSync(join(ROOT, 'tests', 'fixtures', 'test-key.txt'), 'utf8').trim();
export const KEYED = `./#k=${TEST_KEY}`;

/**
 * Stand-in for the Claude platform's window.claude, installed before the page's scripts run. `mode` decides how
 * use('downloads') and save() answer. Runs in the page.
 * @param {string} mode
 */
export function standIn(mode) {
  const w = /** @type {any} */ (window);
  w.__saves = []; w.__nextCode = null;
  /** @param {ArrayBuffer} buf */
  const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
  /** @param {{ filename: string, data: Blob }} o */
  const save = async ({ filename, data }) => {
    w.__saves.push({ filename, sha: await hex(await data.arrayBuffer()) });
    /** @param {string} code */
    const no = code => { throw { code, message: code }; };
    if (mode === 'slow') { await new Promise(r => setTimeout(r, 600)); return { status: 'saved' }; }
    if (mode === 'declined') no('declined');
    if (mode === 'rate_limited') no('rate_limited');
    if (mode === 'unavailable') no('unavailable');
    if (mode === 'ext_pdf' && filename.endsWith('.pdf')) no('extension_not_enabled');
    if (mode === 'codes' && w.__nextCode) { if (w.__nextCode === '(no code)') throw new Error('broken'); no(w.__nextCode); }
    return { status: 'saved' };
  };
  w.claude = {
    use: (/** @type {string} */ name) => {
      if (mode === 'never') return new Promise(() => {});
      if (mode === 'null') return Promise.resolve(null);
      if (mode === 'reject') return Promise.reject(new Error('refused'));
      return Promise.resolve(name === 'downloads' ? Object.freeze({ save }) : null);
    },
  };
}

/** Waits until the page has its photo and design and has drawn them. @param {import('@playwright/test').Page} p */
export async function waitReady(p) {
  await p.waitForFunction(() => {
    const t = window.__tryon, ph = /** @type {HTMLImageElement} */ (document.getElementById('photo')), ai = /** @type {HTMLImageElement} */ (document.getElementById('artImg'));
    return !!t && t.S.booted && ph.complete && ph.naturalWidth > 0 && ai.complete && ai.naturalWidth > 0;
  }, null, { timeout: 15_000 });
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * @typedef {object} OpenOptions
 * @property {string | null} [mode]  window.claude stand-in mode; omitted or null = no window.claude (ordinary web host)
 * @property {{ width: number, height: number }} [viewport]  default: the project's
 * @property {boolean} [hasTouch]  default: the project's
 * @property {string} [label]      prefix for logged JS errors
 * @property {boolean} [ready]     wait until the page is ready (default true)
 * @property {string} [url]        address to open (default: the page with the test key in the link)
 * @property {import('@playwright/test').BrowserContext} [context]  open in this context instead of a new one
 */

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ errs: string[], open: (o?: OpenOptions) => Promise<Page> }} TryonFixtures */
/** @typedef {import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions} BaseTestArgs */
/** @typedef {import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions} BaseWorkerArgs */

/** @type {import('@playwright/test').Fixtures<TryonFixtures, {}, BaseTestArgs, BaseWorkerArgs>} */
const fixtures = {
  // Every JS error and console error from every page the test opens; written to ERR_DIR after the test.
  // eslint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from this pattern
  errs: [async ({}, use, info) => {
    /** @type {string[]} */
    const errs = [];
    await use(errs);
    mkdirSync(ERR_DIR, { recursive: true });
    writeFileSync(join(ERR_DIR, `${info.project.name}-${info.testId}.json`), JSON.stringify({ project: info.project.name, title: info.title, errs }));
  }, { auto: true }],
  /** Opens the page in a new browser context with the project's device settings. */
  open: async ({ browser, errs }, use, info) => {
    /** @type {import('@playwright/test').BrowserContext[]} */
    const ctxs = [];
    const u = info.project.use;
    await use(async (o = {}) => {
      const ctx = o.context ?? await browser.newContext({
        ...u.contextOptions, baseURL: u.baseURL, viewport: o.viewport ?? u.viewport, hasTouch: o.hasTouch ?? u.hasTouch,
        isMobile: u.isMobile, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent, acceptDownloads: true,
      });
      if (!o.context) ctxs.push(ctx);
      if (o.mode) await ctx.addInitScript(standIn, o.mode);
      const p = await ctx.newPage();
      const label = o.label ?? o.mode ?? 'web';
      p.on('pageerror', e => errs.push(`[${label}] ${e.message}`));
      p.on('console', m => { if (m.type() === 'error') errs.push(`[${label}] ${m.text()}`); });
      await p.goto(o.url ?? KEYED);
      if (o.ready !== false) await waitReady(p);
      return p;
    });
    for (const c of ctxs) await c.close();
  },
};
export const test = base.extend(fixtures);

/** A check's result, as full.js recorded it. @typedef {{ ok: boolean, detail?: unknown }} Result */

/** Fails the test with the check's detail when the check is not ok. @param {string} name @param {Result} r */
export function assertCheck(name, r) {
  expect(r.ok, `${name} failed: ${JSON.stringify(r.detail)}`).toBe(true);
}

/** The placement on screen, read from the page's state. @param {import('@playwright/test').Page} p */
export const st = p => p.evaluate(() => {
  const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S, r = S.photos[S.cur];
  const photo = /** @type {HTMLImageElement} */ (document.getElementById('photo'));
  return { cx: r.cx, cy: r.cy, w: r.w, h: r.h, a: r.a, ppi: r.ppi, ppiSet: r.ppiSet, axis: r.axis, n: r.measures.length, flip: r.flip, zoom: S.zoom, step: S.step, mode: S.mode, k: photo.clientWidth / r.nw, aspect: S.artAspect };
});
/** Screen position of a point given in photo pixels. @param {import('@playwright/test').Page} p @param {number} x @param {number} y */
export const scr = async (p, x, y) => {
  const s = await st(p), bb = /** @type {{ x: number, y: number }} */ (await p.locator('#stage').boundingBox());
  return [bb.x + x * s.k, bb.y + y * s.k];
};
/** Mouse click at a point given in photo pixels. @param {import('@playwright/test').Page} p @param {number} x @param {number} y */
export const click = async (p, x, y) => { const [sx, sy] = await scr(p, x, y); await p.mouse.click(sx, sy); };
/** A point of the design's box, from its own frame to photo pixels. @param {{ cx: number, cy: number, a: number }} s @param {number} lx @param {number} ly */
export const corner = (s, lx, ly) => { const c = Math.cos(s.a * Math.PI / 180), n = Math.sin(s.a * Math.PI / 180); return [s.cx + c * lx - n * ly, s.cy + n * lx + c * ly]; };
/** Drags a handle of the design by (dx, dy) screen px. @param {import('@playwright/test').Page} p @param {string} sel @param {number} dx @param {number} dy */
export const dragHandle = async (p, sel, dx, dy) => {
  const bb = /** @type {{ x: number, y: number, width: number, height: number }} */ (await p.locator(sel).boundingBox());
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 5 }); await p.mouse.up();
};

/** Inches rounded to 1/8, written the way the page writes them (6", 1 3/4"). Independent of the page's code. @param {number} v */
export const in8 = v => { const e = Math.round(v * 8), w = Math.floor(e / 8); let n = e % 8, d = 8; while (n && n % 2 === 0) { n /= 2; d /= 2; } return n ? `${w ? w + ' ' : ''}${n}/${d}"` : `${w}"`; };

/** SHA-256 of the picture shown in step 4 (decoded from its data URL). Runs in the page. */
export const shownPictureSha = async () => {
  const s = /** @type {string} */ (document.getElementById('snapImg')?.getAttribute('src'));
  const b = atob(s.slice(s.indexOf(',') + 1)), u = Uint8Array.from(b, c => c.charCodeAt(0));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
};

/**
 * Compares the picture's photo area with two independent renders of the placed design: as on screen, and mirrored.
 * Returns the summed pixel difference inside the design's box for each. Runs in the page.
 */
export const pictureVsRenders = async () => {
  const S = /** @type {NonNullable<Window['__tryon']>} */ (window.__tryon).S, r = S.photos[S.cur];
  /** @param {string} s @returns {Promise<HTMLImageElement>} */
  const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
  const [pic, bg, fg] = await Promise.all([load(/** @type {HTMLImageElement} */ (document.getElementById('snapImg')).src), load(r.src), load(S.artSrc)]);
  const canvas = () => { const c = document.createElement('canvas'); c.width = r.nw; c.height = r.nh; return /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); };
  const pc = canvas(); pc.drawImage(pic, 0, 0); const P = pc.getImageData(0, 0, r.nw, r.nh).data;
  /** @param {boolean} mirrored */
  const render = mirrored => {
    const x = canvas(); x.drawImage(bg, 0, 0, r.nw, r.nh);
    const a = r.a * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), f = mirrored ? -1 : 1;
    x.setTransform(co * f, si * f, -si, co, r.cx, r.cy);
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = parseFloat(/** @type {HTMLInputElement} */ (document.getElementById('opacity')).value);
    x.drawImage(fg, -r.w / 2, -r.h / 2, r.w, r.h); return x.getImageData(0, 0, r.nw, r.nh).data;
  };
  const screenWay = render(r.flip), otherWay = render(!r.flip), half = Math.hypot(r.w, r.h) / 2;
  let dScreen = 0, dOther = 0;
  for (let y = Math.max(0, Math.floor(r.cy - half)); y < Math.min(r.nh, Math.ceil(r.cy + half)); y++)
    for (let xx = Math.max(0, Math.floor(r.cx - half)); xx < Math.min(r.nw, Math.ceil(r.cx + half)); xx++) {
      const i = (y * r.nw + xx) * 4;
      for (let c = 0; c < 3; c++) { dScreen += Math.abs(P[i + c] - screenWay[i + c]); dOther += Math.abs(P[i + c] - otherWay[i + c]); }
    }
  return { dScreen, dOther };
};
