// @ts-check
// The self-check's rows and the text "Copy results" puts on the clipboard. Pure, so it is unit-tested; the probes that
// fill the rows are in src/selfcheck.js. The text holds only the check names, PASS/FAIL/UNKNOWN and generic details
// (numbers, yes/no wording): never the key, a file name, or anything from the payload.

/** @typedef {'PASS' | 'FAIL' | 'UNKNOWN'} Status */
/** @typedef {{ id: string, name: string, status: Status, detail: string }} Row */

export const STATUSES = /** @type {const} */ (['PASS', 'FAIL', 'UNKNOWN']);

/** The rows, in the order shown. */
export const CHECKS = Object.freeze([
  { id: 'unlocked', name: 'Opened with its key' },
  { id: 'keysource', name: 'Where the key came from' },
  { id: 'homescreen', name: 'Home Screen mode' },
  { id: 'persisted', name: 'Storage kept by the phone' },
  { id: 'indexeddb', name: 'Saving work on this phone' },
  { id: 'share', name: 'Share sheet with files' },
  { id: 'canvas', name: 'Largest picture it can make' },
  { id: 'picker', name: 'Photo picker' },
  { id: 'crypto', name: 'Web Crypto' },
  { id: 'screen', name: 'Screen' },
  { id: 'version', name: 'App version' },
]);

/**
 * @param {Row[]} rows
 * @param {Date} when
 * @returns {string}
 */
export function formatResults(rows, when) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const counts = STATUSES.map(s => `${rows.filter(r => r.status === s).length} ${s}`).join(', ');
  return [`Try-on self-check, ${stamp} (${counts})`, ...rows.map(r => `${r.status.padEnd(7)} ${r.name}: ${r.detail}`)].join('\n') + '\n';
}

/**
 * PASS when at least one size drew and read back. Sizes are tried in order, each only if the one before worked.
 * @param {[number, boolean][]} tried size and whether it drew and read back
 * @returns {Status}
 */
export function canvasStatus(tried) { return tried.some(([, ok]) => ok) ? 'PASS' : 'FAIL'; }

/** @param {[number, boolean][]} tried @returns {string} */
export function canvasDetail(tried) {
  const ok = tried.filter(([, good]) => good).map(([n]) => n), best = ok.length ? Math.max(...ok) : 0;
  const list = tried.map(([n, good]) => `${n}${good ? ' ok' : ' failed'}`).join(', ');
  return best ? `${best} x ${best} px drawn and read back (${list})` : `no size worked (${list})`;
}
