// @ts-check
// no_js_errors (full.js): no page error and no console error in any page of any check, in any project.
// Runs after every other project has finished, failures included (a Playwright teardown project).
import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERR_DIR } from './helpers.js';

test('no_js_errors', async () => {
  const files = existsSync(ERR_DIR) ? readdirSync(ERR_DIR).filter(f => f.endsWith('.json')) : [];
  expect(files.length, `no check recorded its pages' errors in ${ERR_DIR}`).toBeGreaterThan(0);
  const errs = files.flatMap(f => {
    const j = JSON.parse(readFileSync(join(ERR_DIR, f), 'utf8'));
    return j.errs.map((/** @type {string} */ e) => `${j.project} > ${j.title}: ${e}`);
  });
  expect(errs, `${files.length} checks logged`).toEqual([]);
});
