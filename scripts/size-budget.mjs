// Size budget for the built page: every file in dist/ except payload.bin (the sealed art data, sized by the package)
// must total at most BUDGET bytes. Exit 1 when over budget or when dist/ is missing. Run after `npm run build`.
//
// Budget: 80 KiB. At the port (October 30, 2026) the code and markup came to about 61 KB against 64 KiB. The private
// link increment (key screens, unsealing, the binary container, "Check this phone", nine fixes) measured 77,253 bytes, so
// the budget was raised to 80 KiB on purpose; growth stays a decision, not an accident.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET = Number(process.env.SIZE_BUDGET_BYTES || 80 * 1024);
const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
if (!existsSync(join(dist, 'index.html'))) { console.error('STOP: dist/ is missing; run npm run build first'); process.exit(1); }

/** @param {string} dir @returns {string[]} */
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
let total = 0;
for (const f of files(dist).sort()) {
  const rel = relative(dist, f), size = statSync(f).size;
  if (rel === 'payload.bin') { console.log(`  ${'(excluded)'.padStart(10)}  ${rel} ${size.toLocaleString('en-US')} bytes`); continue; }
  total += size;
  console.log(`  ${size.toLocaleString('en-US').padStart(10)}  ${rel}`);
}
const ok = total <= BUDGET;
console.log(`${ok ? 'WITHIN BUDGET' : 'OVER BUDGET'}: ${total.toLocaleString('en-US')} of ${BUDGET.toLocaleString('en-US')} bytes (dist/ without payload.bin)`);
process.exit(ok ? 0 : 1);
