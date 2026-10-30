// @ts-check
import { $ } from './dom.js';

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastT;

/**
 * A short message at the bottom of the screen for 4.5 s (announced by screen readers: role="status").
 * @param {string} m
 */
export function toast(m) {
  const t = $('toast');
  t.textContent = m; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 4500);
}
