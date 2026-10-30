// @ts-check
// The page's state and photo records. Positions and sizes are in the photo's own pixels; inches exist only once a
// photo has a measured scale (ppiSet).

/** @typedef {import('./lib/calibration.js').Line} Line */
/** @typedef {import('./lib/arm.js').ArmFound} ArmFound */
/** @typedef {import('./lib/files.js').FileKey} FileKey */
/**
 * @typedef {object} PhotoRecord
 * @property {string} id
 * @property {string} src      data URL of the (shrunk) photo
 * @property {number} nw       photo size in pixels
 * @property {number} nh
 * @property {number | null} ppi   photo pixels per inch, once measured
 * @property {boolean} ppiSet
 * @property {Line | null} cal      the size line from step 2
 * @property {Line[]} measures      lines from "Measure on the photo"
 * @property {ArmFound | null} axis the arm found by "line it up"
 * @property {boolean} placed
 * @property {number} cx       design center, size and turn (degrees)
 * @property {number} cy
 * @property {number} w
 * @property {number} h
 * @property {number} a
 * @property {boolean} flip
 */
/** @typedef {'art' | 'cal' | 'align' | 'mea'} Mode  move the design | size taps | tap the arm | measure */
/** @typedef {'wait' | 'on' | 'none' | 'direct'} DlState  platform save capability; 'direct' = ordinary web host */
/** @typedef {{ save: (o: { filename: string, data: Blob }) => Promise<unknown> }} Downloads */

export const S = {
  /** @type {PhotoRecord[]} */ photos: [],
  cur: 0, zoom: 1, step: 1,
  /** @type {Mode} */ mode: 'art',
  booted: false,
  loaded: false,                                       // storage may be written (after the saved state was read)
  /** data URLs from the payload */
  assets: { sample: '', art: '' },
  /** @type {Record<FileKey, string>} base64 of each package file, from the payload */
  files: /** @type {Record<FileKey, string>} */ ({}),
  artSrc: '',
  /** the built-in design's real size in inches, from the payload's text (set at start) */
  designIn: { w: 6, h: 1 },
  /** @type {import('./payload.js').PayloadText | null} private wording from the payload */
  text: null,
  /** @type {{ ok: boolean, code: string | null, source: import('./payload.js').KeySource | null }} how the page opened */
  unlock: { ok: false, code: null, source: null },
  artAspect: 6,
  /** @type {number | null} real width of the design in inches; null for a design she uploaded */
  artTrueIn: 6,
  /** @type {number | null} */ refLen: 3.370,
  refWhat: 'the long side of the card',
  /** @type {string | null} what the step 4 picture was made from */
  picKey: null,
  artGen: 0,                                           // bumps when the design changes
  photoSeq: 0,
  /** @type {Downloads | null} */ dl: null,
  /** @type {DlState} */ dlState: 'wait',
  dlLost: false,
  /** @type {Set<string>} formats the platform refused in this view */
  blockedExt: new Set(),
  /** @type {string[]} snap guides to draw */
  guides: [],
  /** @type {Line | null} a size or measure line whose second end is not placed yet */
  pending: null,
  /** a second tap landed on the first: the line was dropped and the size note says so until the next tap */
  shortTap: false,
  /** @type {number | null} selected measure line */
  sel: null,
  /** @type {{ p: { x: number, y: number }, ok: boolean } | null} */
  tapMark: null,
};

/** A design she uploaded (its real size is unknown). */
export const customArt = () => S.artTrueIn === null;

export function newId() { return 'p' + Date.now().toString(36) + '-' + (++S.photoSeq); }

/**
 * @param {string} src
 * @param {number} nw
 * @param {number} nh
 * @param {{ w?: number, cx?: number, cy?: number, a?: number }} [o]
 * @returns {PhotoRecord}
 */
export function newRecord(src, nw, nh, o = {}) {
  const w = o.w ?? nw * 0.42;
  return {
    id: newId(), src, nw, nh, ppi: null, ppiSet: false, cal: null, measures: [], axis: null, placed: false,
    cx: o.cx ?? nw / 2, cy: o.cy ?? nh / 2, w, h: w / S.artAspect, a: o.a ?? 0, flip: false,
  };
}

/** The starting photo, with the design roughly on its forearm. */
export function sampleRecord() { return newRecord(S.assets.sample, 1050, 1400, { w: 450, cx: 330, cy: 800, a: -15 }); }

/** The photo on screen. */
export const P = () => S.photos[S.cur];
/** True when the photo on screen has a measured scale. */
export const real = () => !!(P() && P().ppiSet);
/** Record fields that undo and the picture key follow. */
export const GEOM = /** @type {const} */ (['ppi', 'ppiSet', 'cal', 'measures', 'axis', 'placed', 'cx', 'cy', 'w', 'h', 'a', 'flip']);
