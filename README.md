# Tattoo try-on (placement preview)

The tattoo placement preview from `/home/claude/placer/placer-src.html`, moved onto Vite with ES modules, type checking,
lint, unit and property tests, end-to-end tests, accessibility scans, a size budget and mutation testing. What the page does
is unchanged. The old single-file page and its tests are still the reference in `/home/claude/placer/`.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | synthetic payload, sealed with the committed TEST key, then `vite build`, then the leak scan of `dist/` (scripts/build.mjs) |
| `npm run build:real` | the private package sealed with the link key, `vite build`, leak scan of `dist/` and of the source tree; prints the link. Needs `private/real.json` (see "Private build") |
| `npm run payload` | only the synthetic plain payload and its files (`.payload/`) |
| `npm run preview` | serves `dist/` on http://localhost:4173 (open it with `#k=` and the key) |
| `npm run typecheck` | `tsc --noEmit` (TypeScript 7 checking the JavaScript through JSDoc and `// @ts-check`) |
| `npm run lint` | ESLint 10 flat config, zero warnings allowed |
| `npm test` | Vitest unit and fast-check property tests (`tests/unit/`) |
| `npm run e2e` | Playwright against `vite preview` of the synthetic `dist/` (build first) |
| `npm run mutants` | `scripts/mutants.mjs`: targeted mutants; each must make its named end-to-end check fail |
| `npm run stryker` | Stryker mutation testing of `src/lib/` and `src/payload.js` (report in `reports/stryker/`) |
| `npm run size-budget` | fails if `dist/` without `payload.bin` is over 80 KiB (`SIZE_BUDGET_BYTES` to override) |
| `npm run verify` | typecheck, lint, unit, build, size budget, e2e, in that order; stops at the first failure |
| `node scripts/compare-screens.mjs` | screenshots of the 4 steps at 390 x 844, old page vs new build, pixel by pixel |

## Private link

Everything private (the sample photo, the design, the six package files, and every personal word the page shows:
file names, file notes, the shop-guide sentence, the design title) is only in `payload.bin`, sealed with AES-256-GCM
(`"TRY2"` + 8-byte key id + 12-byte IV + ciphertext + tag; the 24-byte header is authenticated). The key travels only in
the link's fragment, `https://bflinkdesign.github.io/try-on/#k=<key>`, which browsers never send to a server. The page
takes the key from the link, else from `localStorage['tryon-key']` (kept after a successful open, so a Home Screen app
opens without it; a recorded deviation from OWASP ASVS 5.0 14.3.3), and asks for persistent storage. It never strips
the fragment. When it cannot open it shows one of four screens: no key (paste the link), an old link, a damaged
download (reload), offline. Adding `&check` to the link (or `#check` alone), or More options > "Check this phone",
opens a self-check with PASS / FAIL / UNKNOWN rows and "Copy results"; the copied text holds no key or private word.

Plain payload layout (`src/lib/container.js`): 4-byte little-endian JSON length, JSON index
`{version, text, entries: [{key, type, offset, length}]}`, then the raw bytes. Only `payload.bin` ships.

`tests/fixtures/test-key.txt` is a TEST key and is public on purpose: it opens only the made-up synthetic payload
(`scripts/lib/synthetic.mjs`: a grey photo with a skin-coloured band, a block-letter "TEST" design 6.000 in wide, six
generated files). Tests and CI use only that. The leak scan (`scripts/leakscan.mjs`) looks for 24-byte pieces of every
private file as raw bytes, hex, base64 and base64url, for the key, and for a phrase list; the build deletes `dist/` and
stops on any finding.

## Private build

`npm run build:real` reads `private/real.json` (never committed; keep a copy with the art package):
`packageDir`, `keyFile`, `sample`, `art`, `files.<key>.source` for the six roles (`pdf`, `png`, `svg`, `sheet`,
`stencil`, `orig`), and `text` (`previewPrefix`, `designTitle`, `designWidthIn`, `designHeightIn`, `fileNames`,
`fileNotes.stencil`, `fileNotes.orig`, `guideSheet`). If the key file is missing it is created once (the link then
changes); keep the key in the password manager too. The real plain payload is written only to a private temporary
folder and deleted after sealing. `tests/unit/real-payload.test.js` checks, on this machine only, that the real
payload's six files equal the package files by SHA-256 (skipped elsewhere).

Known limits: `robots.txt` at `/try-on/robots.txt` is not read by crawlers on a project site (only the domain root is);
the `noindex` meta is what keeps the page out of search. Google Fonts is the one third-party request at runtime. The
shared `github.io` origin is shared with other GitHub Pages sites.

## Layout

- `index.html` page markup (same as the old page, plus a loading line); `src/styles.css` the old page's CSS.
- `src/lib/` pure logic with unit tests: `units` (inch formatting, 1/8 and 1/16 rounding, length parsing),
  `geometry` (design box, corner and side-tab drag math), `snapping`, `calibration` (ppi), `captions` (picture notes),
  `save-outcome` (save error code to what she sees), `files` (file names, extensions, base64), `arm` (finding the forearm).
- `src/payload.js` `fetchSealed()` and `openSealed()`: the only reader of `payload.bin` (fetch with retries, backoff
  and jitter, timeout; unseal with each candidate key; unpack; shape and text checks). `src/lib/unseal.js` (Web
  Crypto), `src/lib/gate.js` (which screen), `src/main.js` (start-up), `src/selfcheck.js` (Check this phone).
- `src/` stateful modules by responsibility: `state`, `history` (undo), `render`, `steps`, `view` (zoom, pan),
  `drag`, `controls`, `photos`, `align`, `taps`, `calibrate`, `measure`, `picture`, `saving`, `storage`, `main` (start-up).
- `tests/unit/` Vitest; `tests/e2e/` Playwright; `scripts/` payload, mutants, size budget, screenshot comparison.

## Decisions

- **One sealed payload file instead of base64 in the HTML.** The sample photo, the preview design, the six package files
  and the private wording are in `payload.bin` (sealed binary container), fetched once at start. The page shows its
  shell and a loading line first; the controls stay inert until the photo and design are in. The built folder must be served over HTTP(S); opening `dist/index.html` straight from disk does not work
  (module scripts and `fetch` are blocked on `file://`), unlike the old single file.
- **`window.__tryon`.** The old page's state was reachable as globals; the tests read and drive it. The new page exposes
  the same things on one frozen object (`S`, `goStep`, `select`, `sampleRecord`, `render`, `idb`) so the end-to-end tests
  run against the production build.
- **End-to-end checks keep the old names and assertions.** Each check replays the old scenario up to its own point and
  asserts only its own result, so one failing check does not stop the others from being judged (as `full.js` did).
  `no_js_errors` runs as a teardown project after every other project, failures included.
- **Browsers.** Chromium only: Playwright 1.63.0 and its installed browsers are the only ones here; WebKit cannot be
  installed in this environment. The `iphone-pro-max` project is Chromium emulating a 440 x 956 screen at DPR 3 with touch
  and an iPhone user agent. It is not Safari.
- **Stryker without a TypeScript checker.** TypeScript 7's npm package has no JS API, so `stryker.config.mjs` points
  `tsconfigFile` at a file that does not exist (skipping Stryker's tsconfig rewrite, which this tsconfig does not need)
  and uses no checker plugin. Stryker 10.0.0's Vitest runner ran zero tests per mutant with Vitest 5; 10.1.1 works.
- **PWA.** `vite-plugin-pwa` is installed and configured with `disable: true`: no service worker or manifest is built.

## Fixes after the port (October 30, 2026, independent end-to-end pass)

`parseLen` reads every bare fraction (`11/16`, `13/16`, `15/16` were read as 1 1/16 and so on); a second size tap on
top of the first drops the line and says "Tap the other end, a bit away from the first"; the toast never takes taps;
text inputs are 16 px (no iOS zoom); her first own photo replaces the sample; photos under 600 px on the short side
are refused; a double tap on a save button saves once (a retry after an error is allowed); handles, end dots, toolbar
buttons and step tabs have 44 px tap areas; the step 3 banner reads "First tap the arm where the tattoo goes. Then drag
the dots to adjust." Each has a check in `tests/e2e/fixes.spec.js` with a mutant in `scripts/mutants.mjs`.
