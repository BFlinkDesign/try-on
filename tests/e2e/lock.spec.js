// @ts-check
// The private link: the page opens only with the key in the link (or the one kept on this device after a successful
// open), and says plainly why when it cannot open. Runs against the synthetic build, sealed with the test key.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, assertCheck, waitReady, TEST_KEY, ROOT } from './helpers.js';

/** @typedef {import('@playwright/test').Page} Page */
/** Which gate screens are showing, and whether the app is. @param {Page} p */
const gate = p => p.evaluate(() => {
  const vis = (/** @type {string} */ id) => { const el = document.getElementById(id); return !!el && !el.hidden && el.getClientRects().length > 0; };
  return { nokey: vis('gateNoKey'), old: vis('gateOld'), form: vis('keyForm'), reload: vis('gateReload'), offline: vis('gateOffline'), loading: vis('loadNote'), app: vis('app'), booted: !!window.__tryon?.S.booted };
});
/** Waits until the start-up has settled on a screen (not loading). @param {Page} p */
const settled = p => p.waitForFunction(() => {
  const l = document.getElementById('loadNote');
  return (!!window.__tryon?.S.booted) || (!!l && l.hidden);
}, null, { timeout: 15_000 });
/** Drops the network errors a test causes on purpose from the JS error log. @param {string[]} errs */
const dropExpected = errs => { for (let i = errs.length - 1; i >= 0; i--) if (/Failed to load resource|net::ERR_|the page could not open/.test(errs[i])) errs.splice(i, 1); };

test('opens_with_key_in_hash', async ({ open }) => {
  const p = await open({ label: 'lock' });
  const g = await gate(p), stored = await p.evaluate(() => localStorage.getItem('tryon-key')), hash = await p.evaluate(() => location.hash);
  assertCheck('opens_with_key_in_hash', { ok: g.booted && g.app && !g.nokey && stored === TEST_KEY && hash === `#k=${TEST_KEY}`, detail: { g, storedSame: stored === TEST_KEY, hashKept: hash === `#k=${TEST_KEY}` } });
});

test('opens_with_stored_key', async ({ open, browser }) => {
  const u = test.info().project.use;
  const ctx = await browser.newContext({ ...u.contextOptions, baseURL: u.baseURL, viewport: u.viewport, isMobile: u.isMobile, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent, hasTouch: u.hasTouch });
  try {
    await open({ context: ctx, label: 'lock' });                       // first visit: the link
    const p2 = await open({ context: ctx, url: './', label: 'lock' });   // later: no key in the address
    const g = await gate(p2), source = await p2.evaluate(() => window.__tryon?.S.unlock.source);
    assertCheck('opens_with_stored_key', { ok: g.booted && g.app && source === 'stored' && (await p2.evaluate(() => location.hash)) === '', detail: { g, source } });
  } finally { await ctx.close(); }
});

test('no_key_paste_opens', async ({ open }) => {
  const p = await open({ url: './', ready: false, label: 'lock' });
  await settled(p);
  const first = await gate(p), text = (await p.textContent('#gateNoKey')) ?? '';
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.evaluate(t => navigator.clipboard.writeText(t), `Here it is: https://bflinkdesign.github.io/try-on/#k=${TEST_KEY}`);
  await p.click('#keyPaste');
  await waitReady(p);
  const after = await gate(p), hash = await p.evaluate(() => location.hash), source = await p.evaluate(() => window.__tryon?.S.unlock.source);
  assertCheck('no_key_paste_opens', {
    ok: first.nokey && first.form && !first.app && /This page needs the full link you were sent\./.test(text) && after.booted && hash === `#k=${TEST_KEY}` && source === 'pasted',
    detail: { first, after, hash: hash.slice(0, 4), source },
  });
});

test('no_key_typed_link_opens', async ({ open }) => {
  const p = await open({ url: './', ready: false, label: 'lock' });
  await settled(p);
  await p.fill('#keyText', 'not a link'); await p.click('#keyOpen');
  const refused = await p.isVisible('#keyMsg') && !(await gate(p)).booted;
  await p.fill('#keyText', `https://bflinkdesign.github.io/try-on/#k=${TEST_KEY}`); await p.click('#keyOpen');
  await waitReady(p);
  assertCheck('no_key_typed_link_opens', { ok: refused && (await gate(p)).booted, detail: { refused } });
});

test('wrong_key_older_link_screen', async ({ open }) => {
  const p = await open({ url: `./#k=${randomBytes(32).toString('base64url')}`, ready: false, label: 'lock' });
  await settled(p);
  const g = await gate(p), text = (await p.textContent('#gateOld')) ?? '';
  assertCheck('wrong_key_older_link_screen', { ok: g.old && g.form && !g.nokey && !g.reload && !g.app && !g.booted && /This link is from an older version\. Ask for the current link\./.test(text), detail: g });
});

test('damaged_payload_reload_screen', async ({ open, browser, errs }) => {
  const u = test.info().project.use;
  const ctx = await browser.newContext({ ...u.contextOptions, baseURL: u.baseURL, viewport: u.viewport, isMobile: u.isMobile, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent, hasTouch: u.hasTouch });
  try {
    const bad = readFileSync(join(ROOT, 'dist', 'payload.bin')); bad[bad.length - 100] ^= 0x01;   // one flipped bit in the body
    await ctx.route('**/payload.bin', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: bad }));
    const p = await open({ context: ctx, ready: false, label: 'lock' });
    await settled(p);
    const g = await gate(p), text = (await p.textContent('#gateReload')) ?? '';
    dropExpected(errs);
    assertCheck('damaged_payload_reload_screen', { ok: g.reload && !g.old && !g.offline && !g.form && !g.booted && /The page didn't load completely\. Reload\./.test(text) && await p.isVisible('#gateReloadBtn'), detail: g });
  } finally { await ctx.close(); }
});

test('offline_screen', async ({ open, browser, errs }) => {
  const u = test.info().project.use;
  const ctx = await browser.newContext({ ...u.contextOptions, baseURL: u.baseURL, viewport: u.viewport, isMobile: u.isMobile, deviceScaleFactor: u.deviceScaleFactor, userAgent: u.userAgent, hasTouch: u.hasTouch });
  try {
    await ctx.route('**/payload.bin', r => r.abort('internetdisconnected'));
    const p = await open({ context: ctx, ready: false, label: 'lock' });
    await settled(p);
    const g = await gate(p), text = (await p.textContent('#gateOffline')) ?? '';
    dropExpected(errs);
    assertCheck('offline_screen', { ok: g.offline && !g.reload && !g.old && !g.booted && /You're offline and this page isn't saved on this phone yet\./.test(text), detail: g });
  } finally { await ctx.close(); }
});
