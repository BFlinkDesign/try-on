// Proves each targeted end-to-end check can fail: builds a deliberately broken copy of the page per mutant and
// confirms the named check fails on it. Ported from the single-file page's mutants.py (its 26 mutants, updated where
// the code moved), plus one or more per check added since: the private link, Check this phone, the leak gate, and the
// fixes from the independent end-to-end pass.
//
// usage: node scripts/mutants.mjs [filter]      filter: run only mutants whose check name contains this text
// Exit code 1 if any mutant survives (its check still passes), a mutant cannot be applied or built, or a targeted
// check fails on the unbroken page (then a "kill" would prove nothing).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.mutants');
const PARALLEL = Number(process.env.MUTANT_PARALLEL || 2);

/** @type {[check: string, file: string, old: string, broken: string][]} */
const MUTANTS = [
  ['web_host_downloads_exact_files', 'src/saving.js', "if (!window.claude) S.dlState = 'direct';", "if (!window.claude) S.dlState = 'none';"],
  ['web_host_downloads_exact_files', 'src/saving.js', 'a.download = filename;', "a.download = 'file';"],
  ['platform_null_says_how_to_get_files', 'src/saving.js', "$('dlNone').hidden = S.dlState !== 'none';", "$('dlNone').hidden = true;"],
  ['platform_null_says_how_to_get_files', 'src/saving.js', "S.dl = ns || null; S.dlState = S.dl ? 'on' : 'none'; dlUi();", "S.dl = ns || null; S.dlState = 'on'; dlUi();"],
  ['platform_reject_says_how_to_get_files', 'src/saving.js', "() => { S.dlState = 'none'; dlUi(); });", "() => { S.dlState = 'on'; dlUi(); });"],
  ['six_files_saved_exact_bytes', 'src/saving.js', 'offer(b, nameOf(key), () => b64Bytes(S.files[key]));', 'offer(b, nameOf(key), () => b64Bytes(S.files.pdf));'],
  ['picture_saved_as_shown', 'src/saving.js', "b64Bytes(src.slice(src.indexOf(',') + 1))", "b64Bytes(src.slice(src.indexOf(',') + 5))"],
  ['picture_cleared_when_anything_changes', 'src/render.js', 'if (S.picKey !== null && S.picKey !== picState()) clearPic();', 'if (false) clearPic();'],
  ['picture_cleared_when_anything_changes', 'src/picture.js', "snapState() + '|' + $in('opacity').value + '|' + S.artGen", "snapState() + '|' + S.artGen"],
  ['picture_cleared_when_anything_changes', 'src/picture.js', "return P().id + '|' + snapState()", 'return snapState()'],
  ['picture_reads_same_way_as_screen', 'src/picture.js', 'if (r.flip) x.scale(-1, 1);', 'if (!r.flip) x.scale(-1, 1);'],
  ['picture_captions', 'src/lib/captions.js', 'if (r.flip) n.push(', 'if (false) n.push('],
  ['picture_captions', 'src/lib/captions.js', 'About ${in8(r.w / r.ppi)} wide', 'About ${in8(r.w / r.ppi / 2)} wide'],
  ['uploaded_design_hides_art_files', 'src/saving.js', "$('dlBox').hidden = !on || customArt();", "$('dlBox').hidden = !on;"],
  ['uploaded_design_hides_art_files', 'src/photos.js', 'setDesign(S.assets.art, S.designIn.w / S.designIn.h, S.designIn.w);\n    S.photos.forEach', 'setDesign(S.assets.art, S.designIn.w / S.designIn.h, null);\n    S.photos.forEach'],
  ['guide_matches_buttons', 'index.html', 'data-f="sheet">Artist sheet PDF</button>', 'data-f="sheet">Sheet PDF</button>'],
  ['old_saved_design_not_restored', 'src/main.js', 'if (s.artSrc && s.artTrueIn === null) {', 'if (s.artSrc) {'],
  ['phone_save_buttons_fit_and_tap', 'src/styles.css', '.dl .b { min-height: 44px; }', '.dl .b { }'],
  ['declined_keeps_buttons', 'src/lib/save-outcome.js', "if (code === 'declined') return { toast: 'Not saved.', blockExt: null, lose: false };", "if (code === 'declined') return { toast: 'Not saved.', blockExt: null, lose: true };"],
  ['rate_limited_says_wait', 'src/lib/save-outcome.js', "if (code === 'rate_limited')", "if (code === 'rate_limited_x')"],
  ['format_off_disables_only_that_format', 'src/saving.js', 'if (o.blockExt) S.blockedExt.add(o.blockExt);', "if (o.blockExt) ['pdf', 'png', 'svg', 'jpg'].forEach(x => S.blockedExt.add(x));"],
  ['unavailable_hides_saving', 'src/saving.js', "if (o.lose) { S.dlState = 'none'; S.dlLost = true; }", 'if (o.lose) { S.dlLost = true; }'],
  ['every_other_error_code_handled', 'src/lib/save-outcome.js', "toast: 'That file is too big to save here.'", "toast: 'Handed to your device: check Downloads, or finish in the share screen.'"],
  ['every_other_error_code_handled', 'src/lib/save-outcome.js', "!code || code === 'bad_request' || code === 'transform_error'", '!code'],
  ['page_works_while_platform_silent', 'src/main.js', '    const [sealed, saved] = await Promise.all([fetchSealed(), loadSaved()]);\n', "    if (window.claude) await window.claude.use('downloads');\n    const [sealed, saved] = await Promise.all([fetchSealed(), loadSaved()]);\n"],
  ['button_busy_during_save', 'src/saving.js', "btn.disabled = true; btn.setAttribute('aria-busy', 'true');", "btn.setAttribute('aria-busy', 'true');"],
  // ---- the private link (tests/e2e/lock.spec.js)
  ['opens_with_key_in_hash', 'src/main.js', "add(keyFromHash(location.hash), 'link');", "add(keyFromHash(''), 'link');"],
  ['opens_with_stored_key', 'src/main.js', 'storeKey(opened.key);', ''],
  ['no_key_paste_opens', 'src/main.js', 'const key = keyFromText(text), msg', 'const key = keyFromHash(text), msg'],
  ['no_key_typed_link_opens', 'src/main.js', "tryOpen($in('keyText').value);", "tryOpen('');"],
  ['wrong_key_older_link_screen', 'src/lib/gate.js', "case 'wrongkey': return 'oldlink';", "case 'wrongkey': return 'reload';"],
  ['damaged_payload_reload_screen', 'src/lib/gate.js', "default: return 'reload';", "default: return 'offline';"],
  ['damaged_payload_reload_screen', 'src/main.js', "$('gateReload').hidden = which !== 'reload';", "$('gateReload').hidden = true;"],
  ['offline_screen', 'src/lib/gate.js', "case 'network': case 'timeout': return 'offline';", "case 'network': case 'timeout': return 'reload';"],
  // ---- Check this phone (tests/e2e/selfcheck.spec.js)
  ['self_check_rows_and_copy', 'src/selfcheck.js', 'await navigator.clipboard.writeText(text);', 'await navigator.clipboard.writeText(text.slice(1));'],
  ['self_check_rows_and_copy', 'src/lib/selfcheck.js', "  { id: 'version', name: 'App version' },\n", ''],
  ['self_check_from_more_options', 'src/selfcheck.js', "$btn('checkBtn').onclick = () => { openCheck(); };", "$btn('checkBtn').onclick = () => {};"],
  ['self_check_when_locked', 'src/main.js', '  } finally { starting = false; }\n  if (wantsCheck(location.hash)) openCheck();', '  } finally { starting = false; }'],
  // ---- the leak gate (tests/e2e/leak.spec.js): personal word in the shell; a scanner blind to base64
  ['dist_leak_scan_clean', 'index.html', '<h1>Try the tattoo on</h1>', '<h1>Try the synthetic-tryon tattoo on</h1>'],
  ['leak_scan_finds_planted_photo', 'scripts/leakscan.mjs', "for (let k = 0; k < 4; k++) out.push(['base64'", "for (let k = 0; k < 0; k++) out.push(['base64'"],
  // ---- fixes from the independent end-to-end pass (tests/e2e/fixes.spec.js)
  ['toast_does_not_block_taps', 'src/styles.css', 'box-shadow: 0 6px 18px rgba(0,0,0,.25); pointer-events: none; }', 'box-shadow: 0 6px 18px rgba(0,0,0,.25); }'],
  ['zero_length_size_line_discarded', 'src/taps.js', '* k() < MIN_LINE_SCREEN_PX) {\n', '* k() < 0) {\n'],
  ['text_inputs_16px', 'src/styles.css', 'font-family: var(--mono); font-size: 16px; font-variant-numeric', 'font-family: var(--mono); font-size: 15px; font-variant-numeric'],
  ['first_own_photo_replaces_sample', 'src/photos.js', 'if (first !== null && onlySample) {', 'if (false) {'],
  ['ruler_fraction_reads_right', 'src/lib/units.js', 'let m = x.match(/^(\\d+)\\/(\\d+)$/);\n    if (m) return parseFloat(m[1]) / parseFloat(m[2]);\n    m = x.match', 'let m = null;\n    m = x.match'],
  ['tap_areas_44px', 'src/styles.css', '.h::before, .rot::before {', '.not-a-handle::before, .rot::before {'],
  ['tap_areas_44px', 'src/render.js', "el('circle', { class: 'hit', cx: ax, cy: ay, r: 22,", "el('circle', { class: 'hit', cx: ax, cy: ay, r: 10,"],
  ['small_photo_refused', 'src/photos.js', 'export const MIN_PHOTO_SHORT_PX = 600;', 'export const MIN_PHOTO_SHORT_PX = 0;'],
  ['double_tap_saves_once', 'src/saving.js', 'if (now - (lastTap.get(btn) ?? -Infinity) < REPEAT_MS) return;', 'if (false) return;'],
  ['step3_banner_text', 'src/steps.js', "align: 'First tap the arm where the tattoo goes. Then drag the dots to adjust.'", "align: 'Tap the arm where the tattoo should go.'"],
];

/**
 * @param {string} cmd @param {string[]} args @param {{ cwd: string, env?: NodeJS.ProcessEnv, timeoutMs: number }} o
 * @returns {Promise<{ code: number | null, out: string }>}
 */
function run(cmd, args, o) {
  return new Promise(res => {
    const child = spawn(cmd, args, { cwd: o.cwd, env: { ...process.env, ...o.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { child.kill('SIGKILL'); out += `\n[killed after ${o.timeoutMs} ms]`; }, o.timeoutMs);
    child.on('close', code => { clearTimeout(t); res({ code, out }); });
  });
}

/**
 * Copies the page source into dir, applies `mutate` to one file, builds it. Returns dist path or throws.
 * @param {string} dir @param {[string, string, string, string] | null} mutate
 */
async function buildCopy(dir, mutate) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (const f of ['index.html', 'vite.config.js', 'package.json']) cpSync(join(root, f), join(dir, f));
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'scripts')); cpSync(join(root, 'scripts', 'leakscan.mjs'), join(dir, 'scripts', 'leakscan.mjs'));   // the leak checks use the copy's scanner (E2E_SRC)
  symlinkSync(join(root, 'public'), join(dir, 'public'), 'dir');
  if (mutate) {
    const [, file, old, broken] = mutate, path = join(dir, file), text = readFileSync(path, 'utf8');
    const count = text.split(old).length - 1;
    if (count !== 1) throw new Error(`text to break found ${count} times in ${file} (must be exactly once)`);
    writeFileSync(path, text.replace(old, () => broken));
  }
  const b = await run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error'], { cwd: dir, timeoutMs: 120_000 });
  if (b.code !== 0) throw new Error(`build failed: ${b.out.trim().split('\n').slice(-4).join(' | ')}`);
  return join(dir, 'dist');
}

/**
 * Runs the named checks against a built folder; returns { title -> statuses[] } and the raw output tail.
 * @param {string} dist @param {string} dir @param {string[]} names @param {number} port
 */
async function e2e(dist, dir, names, port) {
  const out = join(dir, 'test-results');
  const r = await run(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--reporter=json'], {
    cwd: root, timeoutMs: 600_000,
    env: { E2E_SRC: dir, E2E_DIST: dist, E2E_PORT: String(port), E2E_OUT: out, E2E_ONLY: names.join(','), E2E_WORKERS: '1', E2E_HTML: join(dir, 'report'), PLAYWRIGHT_JSON_OUTPUT_FILE: join(dir, 'results.json') },
  });
  /** @type {Record<string, string[]>} */
  const statuses = {};
  if (existsSync(join(dir, 'results.json'))) {
    /** @param {any} s */
    const walk = s => {
      for (const sp of s.specs ?? []) for (const t of sp.tests) for (const res of t.results) (statuses[sp.title] ??= []).push(`${t.projectName}:${res.status}`);
      for (const c of s.suites ?? []) walk(c);
    };
    for (const s of JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')).suites) walk(s);
  }
  return { statuses, tail: r.out.trim().split('\n').slice(-3).join(' | ') };
}
const failed = (/** @type {string[] | undefined} */ s) => (s ?? []).some(x => /:(failed|timedOut|interrupted)$/.test(x));
const passed = (/** @type {string[] | undefined} */ s) => !!s && s.length > 0 && s.every(x => x.endsWith(':passed'));

const filter = process.argv[2] || '';
const chosen = MUTANTS.map((m, i) => /** @type {const} */ ([i, m])).filter(([, m]) => m[0].includes(filter));
const checks = [...new Set(chosen.map(([, m]) => m[0]))];
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const started = Date.now();
let bad = 0;

// Control: every targeted check must pass on the unbroken page, or a "kill" proves nothing.
{
  const dir = join(work, 'control');
  const dist = await buildCopy(dir, null);
  const { statuses, tail } = await e2e(dist, dir, checks, 4300);
  const notPassing = checks.filter(c => !passed(statuses[c]));
  console.log(`control (unbroken page): ${checks.length - notPassing.length}/${checks.length} targeted checks pass`);
  if (notPassing.length) { bad++; console.log(`  NOT PASSING on the unbroken page: ${notPassing.map(c => `${c} ${JSON.stringify(statuses[c] ?? 'not run')}`).join('; ')}  [${tail}]`); }
}

/** @type {{ i: number, check: string, verdict: string, detail: string }[]} */
const results = [];
const queue = [...chosen];
await Promise.all(Array.from({ length: PARALLEL }, async (_, w) => {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [i, m] = next, dir = join(work, `m${i}`);
    /** @type {string} */ let verdict;
    /** @type {string} */ let detail;
    try {
      const dist = await buildCopy(dir, m);
      const { statuses, tail } = await e2e(dist, dir, [m[0]], 4310 + w);
      const failing = Object.keys(statuses).filter(t => failed(statuses[t]));
      if (!statuses[m[0]]) { verdict = 'ERROR   '; detail = `check did not run [${tail}]`; }
      else { verdict = failed(statuses[m[0]]) ? 'KILLED  ' : 'SURVIVED'; detail = `failing: ${JSON.stringify(failing)} ${JSON.stringify(statuses[m[0]])}`; }
    } catch (e) { verdict = 'ERROR   '; detail = /** @type {Error} */ (e).message; }
    results.push({ i, check: m[0], verdict, detail });
    console.log(`${verdict} #${String(i + 1).padStart(2)} ${m[0]} (${m[1]}): ${detail}`);
    rmSync(dir, { recursive: true, force: true });
  }
}));

const killed = results.filter(r => r.verdict.startsWith('KILLED')).length;
bad += results.length - killed;
if (!process.env.KEEP_MUTANTS) rmSync(work, { recursive: true, force: true });
console.log(`${killed}/${results.length} mutants caught, covering ${new Set(results.map(r => r.check)).size} checks (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(bad ? 1 : 0);
