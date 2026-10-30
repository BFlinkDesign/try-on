// @ts-check
// Which calm screen the page shows when it cannot open, and the link's extra flags. Pure, so it is unit-tested.

/** @typedef {'nokey' | 'oldlink' | 'reload' | 'offline'} Screen */

/**
 * @param {string} code a PayloadError code (src/payload.js), or anything else for an unexpected failure
 * @returns {Screen}
 *   nokey    no key, or text that is not a key: ask for the full link
 *   oldlink  a real key, but not this page's: the link is from an older version
 *   offline  the file could not be fetched at all (no network, or it timed out)
 *   reload   everything else: the file arrived but is damaged, cut short, not a payload, or the server said no
 */
export function screenFor(code) {
  switch (code) {
    case 'nokey': case 'key': return 'nokey';
    case 'wrongkey': return 'oldlink';
    case 'network': case 'timeout': return 'offline';
    default: return 'reload';
  }
}

/** True when the link asks for the self-check screen: "#check" alone or alongside the key ("#k=...&check"). @param {string} hash */
export const wantsCheck = hash => /(?:^#|&)check(?=&|$)/.test(hash || '');

/**
 * The fragment for a key, keeping the check flag when the page had it.
 * @param {string} key @param {boolean} check @returns {string}
 */
export const hashFor = (key, check) => `#k=${key}${check ? '&check' : ''}`;
