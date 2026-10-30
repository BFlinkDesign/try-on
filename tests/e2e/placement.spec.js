// @ts-check
// Placement checks (full.js): size, line up with the arm, handles, buttons, snapping, undo, measuring, zoom, picture,
// keeping work, start over. Desktop 1280 x 1000 with touch, as full.js ran them.
import { test, assertCheck } from './helpers.js';
import { MAIN, runMain } from './flow.js';

for (const [name] of MAIN) {
  test(name, async ({ open }) => {
    const p = await open({ label: 'main' });
    const { result } = await runMain(p, name);
    assertCheck(name, result);
  });
}
