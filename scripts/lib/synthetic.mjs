// The synthetic payload used by tests and CI: a made-up arm photo, a made-up design and six made-up package files of
// the right types. Nothing here comes from the private package; everything is drawn by this code and is deterministic
// (same bytes on every run), so its SHA-256 manifest is stable.
//
// The photo is 1050 x 1400 px (the size the page's starting placement is written for): a grey background and a band of
// skin colour running through (330, 800) at -15 degrees, the spot and angle the placement checks tap and expect.
import { deflateSync, crc32 } from 'node:zlib';
import { encodeJpeg } from './jpeg.mjs';

export const PHOTO = Object.freeze({ w: 1050, h: 1400, armX: 330, armY: 800, armDeg: -15, armWidth: 300 });
export const DESIGN = Object.freeze({ widthIn: 6, heightIn: 1.5, vbW: 600, vbH: 150 });

/** Words that only the synthetic payload contains, for the leak scan of a synthetic build. */
export const SYNTHETIC_PHRASES = ['synthetic-tryon', 'made-up source lettering'];

/** What the page shows and names, as the real payload's text would (see README "Payload text"). */
export const SYNTHETIC_TEXT = Object.freeze({
  previewPrefix: 'synthetic-tryon',
  designTitle: 'Synthetic test design',
  designWidthIn: DESIGN.widthIn,
  designHeightIn: DESIGN.heightIn,
  fileNames: {
    pdf: 'synthetic-tryon-2-look-6in.pdf',
    png: 'synthetic-tryon-2-look-6in-600dpi.png',
    svg: 'synthetic-tryon-2-look-6in.svg',
    sheet: 'synthetic-tryon-4-sheet.pdf',
    stencil: 'synthetic-tryon-1-line-6in.pdf',
    orig: 'synthetic-tryon-3-source-6in-600dpi.png',
  },
  fileNotes: {
    stencil: 'One even line (file 1 on the sheet).',
    orig: 'The made-up source lettering, same size (file 3 on the sheet).',
  },
  guideSheet: 'The artist sheet explains what this made-up test design is, the size, and the tight spots.',
});

// Block letters T E S T and a flag, in the design's own units (600 x 150 = 6 x 1.5 in). Not mirror-symmetric, so a
// flipped picture is told apart from an unflipped one.
/** @type {[number, number, number, number][]} */
const RECTS = [
  [20, 20, 120, 25], [57, 20, 26, 110],
  [160, 20, 26, 110], [160, 20, 100, 25], [160, 62, 80, 25], [160, 105, 100, 25],
  [290, 20, 100, 25], [290, 20, 26, 60], [290, 62, 100, 25], [364, 62, 26, 68], [290, 105, 100, 25],
  [420, 20, 120, 25], [467, 20, 26, 110],
];
const FLAG = [[560, 20], [590, 75], [560, 130]];

/** @returns {Buffer} the design as SVG, 6.000 in wide */
export function designSvg() {
  const paths = RECTS.map(([x, y, w, h]) => `  <path d="M${x} ${y}h${w}v${h}h${-w}Z"/>`);
  paths.push(`  <path d="M${FLAG.map(p => p.join(' ')).join('L')}Z"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${DESIGN.widthIn}in" height="${DESIGN.heightIn}in" viewBox="0 0 ${DESIGN.vbW} ${DESIGN.vbH}">
<title>Synthetic test design (not a real tattoo)</title>
<g fill="#1b1b1b">
${paths.join('\n')}
</g>
</svg>
`);
}

/** Deterministic pseudo-random numbers in [0, 1). @param {number} seed */
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** @returns {{ rgba: Uint8Array, w: number, h: number }} */
export function photoPixels() {
  const { w, h, armX, armY, armDeg, armWidth } = PHOTO, rnd = lcg(7);
  const a = armDeg * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a), ux = Math.cos(a), uy = Math.sin(a);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = (rnd() - 0.5) * 4;
    const g = 120 + 20 * (y / h);   // grey background, a little lighter toward the bottom
    let r = g + n, gg = g + 2 + n, b = g + 5 + n;
    const across = Math.abs((x - armX) * nx + (y - armY) * ny), along = (x - armX) * ux + (y - armY) * uy;
    const inside = Math.min(1, Math.max(0, (armWidth / 2 - across) / 6));   // soft 6 px edge
    if (inside > 0) {
      const shade = 1 - 0.06 * (across / (armWidth / 2)) ** 2 + 0.02 * Math.sin(along / 90);
      r = r * (1 - inside) + (224 * shade + n) * inside; gg = gg * (1 - inside) + (174 * shade + n) * inside; b = b * (1 - inside) + (146 * shade + n) * inside;
    }
    rgba[i] = Math.round(Math.min(255, Math.max(0, r))); rgba[i + 1] = Math.round(Math.min(255, Math.max(0, gg)));
    rgba[i + 2] = Math.round(Math.min(255, Math.max(0, b))); rgba[i + 3] = 255;
  }
  return { rgba, w, h };
}

/** @returns {Buffer} the synthetic arm photo as JPEG */
export function photoJpeg() { const p = photoPixels(); return encodeJpeg(p.rgba, p.w, p.h, 90); }

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/**
 * The design drawn as a PNG at `ppi` pixels per inch (dark letters on white, or outlines only).
 * @param {number} ppi @param {'fill' | 'line'} style @returns {Buffer}
 */
export function designPng(ppi, style) {
  const k = ppi / 100, W = Math.round(DESIGN.vbW * k), H = Math.round(DESIGN.vbH * k), row = W * 3 + 1;
  const raw = Buffer.alloc(row * H, 255);
  /** @param {number} px @param {number} py */
  const inDesign = (px, py) => {
    const x = px / k, y = py / k;
    if (RECTS.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh)) return true;
    return x >= 560 && x <= 590 && Math.abs(y - 75) <= 55 * (1 - (x - 560) / 30);
  };
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;   // filter: none
    for (let x = 0; x < W; x++) {
      const on = inDesign(x, y) && (style === 'fill' || !(inDesign(x - 3, y) && inDesign(x + 3, y) && inDesign(x, y - 3) && inDesign(x, y + 3)));
      if (on) { const o = y * row + 1 + x * 3; raw[o] = 27; raw[o + 1] = 27; raw[o + 2] = 27; }
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8-bit RGB
  const phys = Buffer.alloc(9); const ppm = Math.round(ppi / 0.0254); phys.writeUInt32BE(ppm, 0); phys.writeUInt32BE(ppm, 4); phys[8] = 1;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('pHYs', phys),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A one- or more-page PDF that draws the design 6 in wide (rectangles in points) and a caption on every page.
 * @param {string} caption @param {number} pages @param {'fill' | 'line'} style @returns {Buffer}
 */
export function designPdf(caption, pages, style) {
  const s = 432 / DESIGN.vbW, ox = (612 - 432) / 2, oy = 500;   // 6 in = 432 pt, on a US Letter page
  const ops = RECTS.map(([x, y, w, h]) => `${(ox + x * s).toFixed(2)} ${(oy + (DESIGN.vbH - y - h) * s).toFixed(2)} ${(w * s).toFixed(2)} ${(h * s).toFixed(2)} re`);
  const flag = FLAG.map(([x, y], i) => `${(ox + x * s).toFixed(2)} ${(oy + (DESIGN.vbH - y) * s).toFixed(2)} ${i ? 'l' : 'm'}`).join(' ') + ' h';
  const paint = style === 'fill' ? 'f' : 'S';
  /** @type {string[]} */
  const objs = [];
  const pageIds = Array.from({ length: pages }, (_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pageIds.forEach((id, i) => {
    const text = `${caption} - page ${i + 1} of ${pages} - SYNTHETIC TEST FILE, not a real design`.replace(/[()\\]/g, '');
    const content = `0.11 g 0.11 G 1 w\n${ops.join('\n')}\n${flag}\n${paint}\nBT /F1 11 Tf 72 720 Td (${text}) Tj ET\n`;
    objs[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objs[id + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`;
  });
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  /** @type {number[]} */
  const offsets = [];
  for (let id = 1; id < objs.length; id++) { offsets[id] = Buffer.byteLength(pdf, 'latin1'); pdf += `${id} 0 obj\n${objs[id]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Everything the synthetic payload holds, by role.
 * @returns {{ sample: Buffer, art: Buffer, files: Record<import('../../src/lib/files.js').FileKey, Buffer> }}
 */
export function syntheticSet() {
  const svg = designSvg();
  return {
    sample: photoJpeg(),
    art: svg,
    files: {
      pdf: designPdf('Synthetic look, 6 in wide, print at Actual size', 1, 'fill'),
      png: designPng(100, 'fill'),
      svg,
      sheet: designPdf('Synthetic sheet', 4, 'fill'),
      stencil: designPdf('Synthetic line, 6 in wide', 1, 'line'),
      orig: designPng(100, 'line'),
    },
  };
}
