// @ts-check
// axe-core accessibility scan of each of the 4 steps (WCAG 2.x A and AA rules), at desktop and phone size.
// Runs in the desktop and phone projects. Each scan reports every violation with its rule, impact and elements.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers.js';

const STEPS = /** @type {const} */ ([1, 2, 3, 4]);

for (const n of STEPS) {
  test(`axe step ${n}`, { tag: '@a11y' }, async ({ open }) => {
    const p = await open({ mode: 'saved', label: `axe-${n}` });   // save buttons showing, as inside Claude
    if (n > 1) await p.click(`[data-go="${n}"]`);
    if (n === 4) { await p.click('#snapBtn'); await p.waitForSelector('#snapImg[src]'); }
    await p.click('#guide summary'); await p.click('#dlExtra summary');   // open the collapsed parts so they are scanned too
    const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const found = r.violations.map(v => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(x => x.target.join(' ')).slice(0, 8) }));
    test.info().annotations.push({ type: 'axe', description: `${r.passes.length} rules passed, ${r.violations.length} violated, ${r.incomplete.length} need review` });
    expect(found, JSON.stringify(found, null, 1)).toEqual([]);
  });
}
