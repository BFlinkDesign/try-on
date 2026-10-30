// @ts-check
// Keeps work between visits, in this browser only (IndexedDB). Writes are debounced by 400 ms.
import { S, customArt } from './state.js';
import { $, $in } from './dom.js';

const DB = 'tattoo-placement', STORE = 'state';

/** @returns {Promise<IDBDatabase>} */
export function idb() {
  return new Promise((res, rej) => {
    try {
      const q = indexedDB.open(DB, 1);
      q.onupgradeneeded = () => q.result.createObjectStore(STORE);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    } catch (e) { rej(e); }
  });
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveT;
const noStore = () => { $('saveNote').textContent = 'This browser is not keeping your work (storage is blocked or full). Save pictures as you go.'; };

export function save() {
  if (!S.loaded) return; clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try {
      const db = await idb(), tx = db.transaction(STORE, 'readwrite');
      const clean = S.photos.map(r => ({ ...r, measures: r.measures.filter(L => L !== S.pending), cal: r.cal === S.pending ? null : r.cal }));
      // only a design she uploaded is kept; the built-in design always comes from the current page
      tx.objectStore(STORE).put({ v: 3, photos: clean, cur: S.cur, step: S.step, artSrc: customArt() ? S.artSrc : null, artAspect: S.artAspect, artTrueIn: S.artTrueIn, opacity: $in('opacity').value }, 'current');
      tx.onerror = noStore;
    } catch { noStore(); }
  }, 400);
}

/**
 * The saved state, or null when there is none or storage cannot be read.
 * @returns {Promise<any>}
 */
export async function loadSaved() {
  try {
    const db = await idb();
    return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get('current'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  } catch { return null; }
}
