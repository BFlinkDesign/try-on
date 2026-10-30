// Locks the app's payload so only someone holding the link's key can read it.
// usage: node scripts/seal.mjs <plain-payload> <out payload.bin> <key-file> [--new-key]
// The key file must already exist (256-bit, base64url); the script stops if it is missing, so a lost key file can never
// silently replace the key and break every link. --new-key writes a fresh key on purpose: the live link then changes.
// Output: "TRY2" (4) || key id (8, first bytes of SHA-256 of the key) || IV (12) || AES-256-GCM ciphertext || tag (16).
// The first 24 bytes are bound to the ciphertext as additional authenticated data, so they cannot be altered unnoticed.
// Adopted from the tested /home/claude/seal/seal.mjs; the same steps, split into functions so the build can call them.
import { chmodSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export class SealStop extends Error {}

/** @param {Buffer} key @returns {Buffer} first 8 bytes of SHA-256 of the key */
export const keyIdOf = key => createHash('sha256').update(key).digest().subarray(0, 8);

/**
 * Reads the key file, or writes a new key when `newKey` is set. Throws SealStop when the file is missing or wrong.
 * @param {string} keyPath @param {boolean} newKey @returns {{ key: Buffer, created: boolean }}
 */
export function loadKey(keyPath, newKey) {
  if (newKey) {
    const key = randomBytes(32);
    writeFileSync(keyPath, key.toString('base64url') + '\n', { mode: 0o600 });
    chmodSync(keyPath, 0o600);   // the mode option is ignored by some file systems and by umask; set it outright
    return { key, created: true };
  }
  if (!existsSync(keyPath)) throw new SealStop(`STOP: no key file at ${keyPath}. Restore it, or pass --new-key to start a new link on purpose.`);
  const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64url');
  if (key.length !== 32) throw new SealStop(`STOP: ${keyPath} does not hold a 256-bit key`);
  return { key, created: false };
}

/** @param {Uint8Array} plain @param {Buffer} key @returns {Buffer} the sealed bytes, with a fresh random IV */
export function sealBytes(plain, key) {
  const iv = randomBytes(12);
  const header = Buffer.concat([Buffer.from('TRY2'), keyIdOf(key), iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const newKey = process.argv.includes('--new-key');
  const [plainPath, outPath, keyPath] = process.argv.slice(2).filter(a => a !== '--new-key');
  if (!plainPath || !outPath || !keyPath) {
    console.error('usage: node scripts/seal.mjs <plain-payload> <out payload.bin> <key-file> [--new-key]');
    process.exit(2);
  }
  try {
    const { key, created } = loadKey(keyPath, newKey);
    if (created) console.log(`NEW KEY written to ${keyPath}: the link changes; send the new link.`);
    writeFileSync(outPath, sealBytes(readFileSync(plainPath), key));
    console.log(`sealed ${plainPath} -> ${outPath} (key id ${keyIdOf(key).toString('hex')})`);
  } catch (e) {
    if (e instanceof SealStop) { console.error(e.message); process.exit(1); }
    throw e;
  }
}
