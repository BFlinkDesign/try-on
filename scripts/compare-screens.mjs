// Behavior check for the port: screenshots of each of the 4 steps at 390 x 844, old single-file page vs the new build,
// compared pixel by pixel. Saves both screenshots and a difference image per step to reports/screens/.
//
// usage: node scripts/compare-screens.mjs [old_page.html]   (default /home/claude/placer/site/index.html; run npm run build first)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oldPage = resolve(process.argv[2] || '/home/claude/placer/site/index.html');
const PORT = Number(process.env.SCREENS_PORT || 4176);
const out = join(root, 'reports', 'screens');
if (!existsSync(oldPage)) { console.error(`STOP: ${oldPage} not found`); process.exit(1); }
if (!existsSync(join(root, 'dist', 'index.html'))) { console.error('STOP: dist/ is missing; run npm run build first'); process.exit(1); }
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch();
let exit = 0;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    if (i > 75) throw new Error('preview server did not start');
    await new Promise(r => setTimeout(r, 200));
  }
  /** Screenshots of steps 1-4 for one page. @param {string} url @param {string} isReady  page expression */
  const shots = async (url, isReady) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(url);
    await p.waitForFunction(isReady, null, { timeout: 15_000 });
    await p.waitForFunction(() => { const i = /** @type {HTMLImageElement} */ (document.getElementById('photo')); return i.complete && i.naturalWidth > 0; });
    await p.evaluate(() => document.fonts.ready);
    const settle = async () => { await p.waitForTimeout(400); await p.evaluate(() => window.scrollTo(0, 0)); };
    await settle();
    const s = [await p.screenshot({ fullPage: true })];
    await p.click('[data-step="1"] [data-next]'); await settle(); s.push(await p.screenshot({ fullPage: true }));
    await p.click('[data-go="3"]'); await settle(); s.push(await p.screenshot({ fullPage: true }));
    await p.click('[data-go="4"]'); await p.click('#snapBtn'); await p.waitForSelector('#snapImg[src]');
    await p.waitForFunction(() => /** @type {HTMLImageElement} */ (document.getElementById('snapImg')).complete);
    await settle(); s.push(await p.screenshot({ fullPage: true }));
    await ctx.close();
    return s;
  };
  // the old page keeps its state in top-level variables of a classic script; the new one exposes window.__tryon
  const oldShots = await shots(pathToFileURL(oldPage).href, "typeof booted !== 'undefined' && booted === true");
  const newShots = await shots(`http://localhost:${PORT}/`, '!!(window.__tryon && window.__tryon.S.booted)');

  const cmp = await browser.newPage();
  for (let n = 0; n < 4; n++) {
    writeFileSync(join(out, `old-step${n + 1}.png`), oldShots[n]); writeFileSync(join(out, `new-step${n + 1}.png`), newShots[n]);
    const r = await cmp.evaluate(async ([a, b]) => {
      /** @param {string} s @returns {Promise<HTMLImageElement>} */
      const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
      const [A, B] = await Promise.all([load(a), load(b)]);
      const W = Math.max(A.width, B.width), H = Math.max(A.height, B.height);
      const data = (/** @type {HTMLImageElement} */ img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H); };
      const da = data(A), db = data(B), c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), d = x.createImageData(W, H);
      let diff = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let i = 0; i < W * H; i++) {
        const j = i * 4, same = da.data[j] === db.data[j] && da.data[j + 1] === db.data[j + 1] && da.data[j + 2] === db.data[j + 2] && da.data[j + 3] === db.data[j + 3];
        const g = (da.data[j] + da.data[j + 1] + da.data[j + 2]) / 12 + 170;
        d.data[j] = same ? g : 255; d.data[j + 1] = same ? g : 0; d.data[j + 2] = same ? g : 0; d.data[j + 3] = 255;
        if (!same) { diff++; const px = i % W, py = (i / W) | 0; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      }
      x.putImageData(d, 0, 0);
      return { old: [A.width, A.height], new: [B.width, B.height], diffPixels: diff, box: diff ? [x0, y0, x1, y1] : null, png: c.toDataURL('image/png') };
    }, [`data:image/png;base64,${oldShots[n].toString('base64')}`, `data:image/png;base64,${newShots[n].toString('base64')}`]);
    writeFileSync(join(out, `diff-step${n + 1}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    const same = r.diffPixels === 0 && r.old.join() === r.new.join();
    if (!same) exit = 1;
    console.log(`step ${n + 1}: ${same ? 'IDENTICAL' : 'DIFFERENT'}  old ${r.old.join('x')}  new ${r.new.join('x')}  differing pixels ${r.diffPixels}${r.box ? `  in box ${r.box.join(',')}` : ''}`);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`screenshots and differences in ${out}`);
process.exit(exit);
