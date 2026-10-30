// @ts-check
// End-to-end tests against `vite preview` of the built page (dist/). Chromium only: it is the one browser installed
// here (Playwright 1.63.0 with the browsers in /opt/pw-browsers); WebKit/Safari cannot be installed in this
// environment, so the iPhone project is Chromium emulating an iPhone's screen, touch and user agent, not Safari.
//
// Environment (used by scripts/mutants.mjs to test a broken copy without touching dist/):
//   E2E_DIST  folder to serve (default dist)      E2E_PORT  port (default 4174)
//   E2E_OUT   output folder (default test-results) E2E_ONLY  run only the check with this exact name
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4174);
const DIST = process.env.E2E_DIST || 'dist';
const OUT = process.env.E2E_OUT || 'test-results';
const ONLY = process.env.E2E_ONLY;
if (ONLY && !/^[a-z0-9_]+(,[a-z0-9_]+)*$/.test(ONLY)) throw new Error(`E2E_ONLY must be check names separated by commas, got ${ONLY}`);
const name = ONLY ? `(?=.*(?:^|\\s)(?:${ONLY.split(',').join('|')})(?:\\s|$))` : '';
/** Tests whose title path has `tag` (and the E2E_ONLY name, when set). @param {string} tag */
const tagged = tag => new RegExp(`^${name}(?=.*(?:${tag}))`);
const onlyName = ONLY ? new RegExp(`^${name}`) : undefined;

const iPhone = devices['iPhone 17 Pro Max'];

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: OUT,
  timeout: 120_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ['list'],
    ['json', { outputFile: `${OUT}/results.json` }],
    ['html', { open: 'never', outputFolder: process.env.E2E_HTML || 'reports/playwright' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --outDir ${JSON.stringify(DIST)} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    // Clears the JS error log; its teardown checks that log after every other project has finished.
    { name: 'setup', testMatch: /global\.setup\.js/, teardown: 'js-errors' },
    { name: 'js-errors', testMatch: /js-errors\.teardown\.js/, grep: onlyName },
    {
      name: 'desktop', dependencies: ['setup'], testMatch: /\.spec\.js$/, grepInvert: /@phone/, grep: onlyName,
      use: { browserName: 'chromium', viewport: { width: 1280, height: 1000 }, hasTouch: true },
    },
    {
      name: 'phone', dependencies: ['setup'], testMatch: /\.spec\.js$/, grep: tagged('@phone|@a11y'),
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'iphone-pro-max', dependencies: ['setup'], testMatch: /\.spec\.js$/, grep: tagged('@phone'),
      use: {
        browserName: 'chromium', userAgent: iPhone.userAgent, viewport: { width: 440, height: 956 },
        contextOptions: { screen: { width: 440, height: 956 } }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      },
    },
  ],
});
