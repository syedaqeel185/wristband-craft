import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for sensitive supplier payment configuration
 * (gateway keys, bank/wallet details). Ciphertext format is a single string:
 *   base64(iv).base64(authTag).base64(ciphertext)
 *
 * Keyed by APP_ENCRYPTION_KEY, which must be 32 bytes provided as base64 or
 * hex. Generate one with:  openssl rand -base64 32
 */

const ALGO = 'aes-256-gcm';

function loadKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY is not set — cannot encrypt/decrypt payment config');
  }
  // Accept base64 or hex; both must decode to exactly 32 bytes.
  let key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const hex = Buffer.from(raw, 'hex');
    if (hex.length === 32) key = hex;
  }
  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)');
  }
  return key;
}

export function encryptString(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptString(payload: string): string {
  const key = loadKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed ciphertext');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** Encrypt an arbitrary JSON-serialisable config object. */
export function encryptJson(obj: unknown): string {
  return encryptString(JSON.stringify(obj ?? {}));
}

/** Decrypt back into an object. Returns {} on empty input. */
export function decryptJson<T = Record<string, unknown>>(payload?: string | null): T {
  if (!payload) return {} as T;
  return JSON.parse(decryptString(payload)) as T;
}
