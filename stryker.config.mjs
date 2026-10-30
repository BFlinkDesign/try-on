// @ts-check
// Mutation testing of the unit-tested modules (the pure logic in src/lib and the payload loader) with the Vitest runner.
// Reports: reports/stryker/index.html and reports/stryker/mutation.json. No thresholds yet (break: null).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.config.js', related: false },
  mutate: ['src/lib/**/*.js', 'src/payload.js'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/stryker/index.html' },
  jsonReporter: { fileName: 'reports/stryker/mutation.json' },
  thresholds: { high: 80, low: 60, break: null },
  concurrency: 2,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  // Stryker 10 rewrites `extends`/`references` paths in tsconfig.json through the TypeScript JS API
  // (ts.parseConfigFileTextToJson). TypeScript 7 is the native compiler and its npm package exports no JS API, so that
  // step crashes. This tsconfig has no `extends` or `references`, so the rewrite has nothing to do: name a file that is
  // not in the project and Stryker skips it. Type checking stays with `npm run typecheck` (no Stryker checker plugin).
  tsconfigFile: 'tsconfig.not-used-by-stryker.json',
  cleanTempDir: true,
  // results are kept so an interrupted or repeated run only re-tests mutants whose code or tests changed
  incremental: true,
  incrementalFile: 'reports/stryker/incremental.json',
};
