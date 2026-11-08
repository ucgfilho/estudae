import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { ForbiddenError } from '../errors/AppError';
import type { ISensitiveDataCipher } from '../interfaces/ISensitiveDataCipher';

const CIPHER_PREFIX = '$aes256gcm$';
const RLS_CIPHER_PREFIX = '$aes256gcm$rls$v1$';
const KEY_SALT = 'bnb-estudos-lgpd-at-rest-key-derivation-v1';
const BLIND_INDEX_SALT = 'bnb-estudos-lgpd-blind-index-key-v1';

/**
 * Criptografia autenticada em repouso (AES-256-GCM) com suporte a isolamento criptográfico
 * por titular (RLS Additional Authenticated Data - AAD) e Blind Indexing determinístico (HMAC-SHA256)
 * para conformidade integral com a LGPD (Art. 6º, VII e Art. 46).
 */
export class SensitiveDataCipher implements ISensitiveDataCipher {
  private readonly key: Buffer;
  private readonly blindIndexKey: Buffer;

  constructor(masterSecret: string) {
    this.key = scryptSync(masterSecret, KEY_SALT, 32);
    this.blindIndexKey = scryptSync(masterSecret, BLIND_INDEX_SALT, 32);
  }

  public encrypt(plaintext: string): string {
    if (!plaintext) return '';
    if (plaintext.startsWith(CIPHER_PREFIX)) return plaintext;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${CIPHER_PREFIX}${iv.toString('hex')}$${authTag.toString('hex')}$${encrypted.toString('hex')}`;
  }

  public decrypt(storedValue: string): string {
    if (!storedValue) return '';
    if (!storedValue.startsWith(CIPHER_PREFIX)) {
      return storedValue;
    }

    const parts = storedValue.slice(CIPHER_PREFIX.length).split('$');
    if (parts.length !== 3) return '';

    const [ivHex, authTagHex, encryptedHex] = parts;
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return '';
    }
  }

  /**
   * Criptografa dados vinculando criptograficamente o ciphertext ao `ownerId` via AES-256-GCM AAD.
   * Impede que dados cifrados de um titular sejam decriptados no contexto de outro titular.
   */
  public encryptForTenant(ownerId: string, plaintext: string): string {
    const cleanOwner = ownerId?.trim();
    if (!cleanOwner) {
      throw new ForbiddenError('Violação RLS: ownerId ausente para criptografia vinculada ao titular.');
    }
    if (plaintext.startsWith(RLS_CIPHER_PREFIX)) {
      // Verifica se já está criptografado para este mesmo ownerId
      this.decryptForTenant(cleanOwner, plaintext);
      return plaintext;
    }
    const rawPlaintext = plaintext.startsWith(CIPHER_PREFIX) ? this.decrypt(plaintext) : plaintext;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`rls:tenant:${cleanOwner}`, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(rawPlaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${RLS_CIPHER_PREFIX}${iv.toString('hex')}$${authTag.toString('hex')}$${encrypted.toString('hex')}`;
  }

  /**
   * Decripta dados exigindo correspondência exata do `ownerId` na verificação da tag GCM (AAD).
   */
  public decryptForTenant(ownerId: string, storedValue: string): string {
    const cleanOwner = ownerId?.trim();
    if (!cleanOwner) {
      throw new ForbiddenError('Violação RLS: ownerId ausente para decriptação vinculada ao titular.');
    }
    if (!storedValue) return '';

    if (storedValue.startsWith(RLS_CIPHER_PREFIX)) {
      const parts = storedValue.slice(RLS_CIPHER_PREFIX.length).split('$');
      if (parts.length !== 3) {
        throw new ForbiddenError('Violação RLS: formato de payload criptográfico inválido ou corrompido.');
      }
      const [ivHex, authTagHex, encryptedHex] = parts;
      try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAAD(Buffer.from(`rls:tenant:${cleanOwner}`, 'utf8'));
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
      } catch {
        throw new ForbiddenError(
          'Violação de isolamento criptográfico RLS: falha na autenticação do titular dos dados.',
        );
      }
    }

    if (storedValue.startsWith(CIPHER_PREFIX)) {
      const legacy = this.decrypt(storedValue);
      if (!legacy && storedValue !== CIPHER_PREFIX) {
        throw new ForbiddenError('Violação RLS: falha ao decriptar registro criptografado legado.');
      }
      return legacy;
    }

    throw new ForbiddenError('Violação RLS: dados explícitos (plaintext) rejeitados pela camada de segurança.');
  }

  /**
   * Gera um Blind Index determinístico (HMAC-SHA256) para busca indexada (ex.: e-mail)
   * sem armazenar o valor original em texto explícito no MongoDB.
   */
  public blindIndex(value: string, namespace = 'default'): string {
    const normalized = value.trim().toLowerCase();
    return createHmac('sha256', this.blindIndexKey)
      .update(`${namespace}:${normalized}`, 'utf8')
      .digest('hex');
  }
}

