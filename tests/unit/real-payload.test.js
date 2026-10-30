// @ts-check
// LOCAL ONLY: the real payload's six files must equal the private package's files, byte for byte (SHA-256). Skipped
// when the private build settings or the package folder are absent (CI, and any machine but the private build one).
// Builds the real container in memory, seals and unseals it with a throwaway key, and reads it with the page's reader.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, packParts, realParts, sha256 } from '../../scripts/make-payload.mjs';
import { sealBytes } from '../../scripts/seal.mjs';
import { openSealed } from '../../src/payload.js';
import { FILE_KEYS, b64Bytes } from '../../src/lib/files.js';

const CFG = join(ROOT, 'private', 'real.json');
const cfg = existsSync(CFG) ? JSON.parse(readFileSync(CFG, 'utf8')) : null;
const present = !!cfg && existsSync(cfg.packageDir);

describe.skipIf(!present)('real payload (local only)', () => {
  it('holds the six package files byte for byte, and its text passes the page\'s checks', async () => {
    const container = packParts(realParts(cfg.packageDir, CFG));
    const key = randomBytes(32), sealed = sealBytes(container, key);
    const { payload } = await openSealed(/** @type {ArrayBuffer} */ (sealed.buffer.slice(sealed.byteOffset, sealed.byteOffset + sealed.length)), [{ key: key.toString('base64url'), source: 'link' }]);
    for (const k of FILE_KEYS) expect(sha256(b64Bytes(payload.files[k])), k).toBe(sha256(readFileSync(join(cfg.packageDir, cfg.files[k].source))));
    expect(payload.text.designWidthIn).toBe(6);
  });
});
