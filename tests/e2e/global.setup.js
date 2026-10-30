// @ts-check
// Starts each run with an empty JS error log (see js-errors.teardown.js).
import { test as setup } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { ERR_DIR } from './helpers.js';

setup('start', async () => {
  rmSync(ERR_DIR, { recursive: true, force: true });
  mkdirSync(ERR_DIR, { recursive: true });
});
