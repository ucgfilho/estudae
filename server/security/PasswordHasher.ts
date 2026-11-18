import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { IPasswordHasher } from '../interfaces/IPasswordHasher';

const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LENGTH = 16;

export const DUMMY_PASSWORD_HASH =
  `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${'00'.repeat(SALT_LENGTH)}$${'00'.repeat(KEY_LENGTH)}`;

function deriveKey(password: string, salt: Buffer, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LENGTH, { N: n, r, p }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Implementação de IPasswordHasher (SRP & DIP) utilizando o algoritmo Scrypt (RFC 7914 / OWASP)
 * nativo do OpenSSL via `node:crypto`, com salt criptográfico único e comparação em tempo constante.
 */
export class PasswordHasher implements IPasswordHasher {
  public async hash(plainPassword: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await deriveKey(plainPassword, salt);
    return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  public async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    const parts = passwordHash.split('$');
    // Formato esperado: ['', 'scrypt', '16384', '8', '1', '<saltHex>', '<hashHex>']
    if (parts.length !== 7 || parts[1] !== 'scrypt') {
      return false;
    }
    const n = Number(parts[2]);
    const r = Number(parts[3]);
    const p = Number(parts[4]);
    const saltHex = parts[5];
    const hashHex = parts[6];
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !saltHex || !hashHex) {
      return false;
    }
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const actual = await deriveKey(plainPassword, salt, n, r, p);
      if (actual.length !== expected.length) return false;
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
