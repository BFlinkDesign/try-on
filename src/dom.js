// @ts-check
// Element lookups. Module scripts run after the document is parsed, so the fixed elements exist at import time.

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export const $ = id => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`page markup is missing #${id}`);
  return el;
};
/** @param {string} id */
export const $in = id => /** @type {HTMLInputElement} */ ($(id));
/** @param {string} id */
export const $btn = id => /** @type {HTMLButtonElement} */ ($(id));
/**
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export const $$ = sel => /** @type {HTMLElement[]} */ ([...document.querySelectorAll(sel)]);

export const stage = $('stage');
export const viewport = $('viewport');
export const photo = /** @type {HTMLImageElement} */ ($('photo'));
export const art = $('art');
export const artImg = /** @type {HTMLImageElement} */ ($('artImg'));

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
