import type { Db } from 'mongodb';
import { ForbiddenError } from '../errors/AppError';
import type { ISensitiveDataCipher } from '../interfaces/ISensitiveDataCipher';
import type { CreateUserRecord, IUserRepository, UserEntity } from '../interfaces/IUserRepository';
import {
  applyUsersCollectionValidator,
  assertUserDocumentOwnership,
  assertValidOwnerId,
  buildUserRlsFilterByEmailHash,
  buildUserRlsFilterById,
} from '../security/MongoRlsGuard';

export const USER_EMAIL_BLIND_INDEX_NAMESPACE = 'users:email';

export interface UserDoc {
  _id: string; // ownerId
  ownerId: string; // RLS tenant owner ID
  emailHash: string; // HMAC-SHA256 blind index
  encryptedEmail: string; // AES-256-GCM AAD-bound to ownerId
  encryptedName: string; // AES-256-GCM AAD-bound to ownerId
  encryptedAvatarUrl?: string | null; // AES-256-GCM AAD-bound to ownerId
  passwordHash: string; // Scrypt ($scrypt$...)
  rlsVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface LegacyUserDoc extends Partial<UserDoc> {
  _id: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
}

/**
 * Repositório de Usuários no MongoDB com Row-Level Security (RLS) estrito e Zero Dados Explícitos:
 * - Nenhum dado pessoal (`email`, `name`, `avatarUrl`) é armazenado em texto puro (plaintext).
 * - Busca por e-mail utiliza Blind Index determinístico (`emailHash` via HMAC-SHA256).
 * - Todos os campos sensíveis são cifrados com AES-256-GCM vinculado ao `ownerId` via AAD.
 * - Validação nativa `$jsonSchema` no MongoDB bloqueia inserções/atualizações com campos explícitos.
 */
export class MongoUserRepository implements IUserRepository {
  private readonly db: Db;
  private readonly cipher: ISensitiveDataCipher;

  constructor(db: Db, cipher: ISensitiveDataCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  private collection() {
    return this.db.collection<UserDoc>('users');
  }

  public async initIndexes(): Promise<void> {
    // 1. Remove índice legado em texto explícito (`email_1`) ANTES de fazer $unset do campo `email`
    try {
      const indexes = await this.collection().indexes();
      if (indexes.some((idx) => idx.name === 'email_1')) {
        await this.collection().dropIndex('email_1');
      }
    } catch {
      // Coleção ainda não existe ou índice já foi removido
    }

    // 2. Migra documentos legados para campos criptografados com RLS e faz $unset de campos explícitos
    await this.migrateLegacyDocuments();

    // 3. Cria índices de Blind Index e RLS
    await Promise.all([
      this.collection().createIndex(
        { emailHash: 1 },
        { unique: true, name: 'idx_users_email_hash_unique' },
      ),
      this.collection().createIndex({ ownerId: 1 }, { name: 'idx_users_rls_owner' }),
    ]);

    // 4. Aplica validação estrita de schema nativo no MongoDB ($jsonSchema)
    await applyUsersCollectionValidator(this.db);
  }

  /**
   * Migra de forma idempotente documentos legados com campos explícitos (`email`, `name`, `avatarUrl`)
   * para o formato criptografado com RLS (`ownerId`, `emailHash`, `encryptedEmail`, `encryptedName`)
   * e remove (`$unset`) todos os campos explícitos do MongoDB.
   */
  public async migrateLegacyDocuments(): Promise<void> {
    const existingCols = await this.db.listCollections({ name: 'users' }, { nameOnly: true }).toArray();
    if (existingCols.length === 0) return;

    const rawCol = this.db.collection<LegacyUserDoc>('users');
    const docs = await rawCol.find({}).toArray();
    const now = new Date().toISOString();

    for (const raw of docs) {
      const hasLegacyFields =
        raw.email !== undefined ||
        raw.name !== undefined ||
        raw.avatarUrl !== undefined ||
        !raw.ownerId ||
        !raw.emailHash ||
        !raw.encryptedEmail ||
        !raw.encryptedName ||
        !raw.rlsVersion;

      if (!hasLegacyFields) continue;

      const ownerId = assertValidOwnerId(raw._id);
      const plainEmail = (
        raw.encryptedEmail
          ? this.cipher.decryptForTenant(ownerId, raw.encryptedEmail)
          : String(raw.email ?? '')
      )
        .trim()
        .toLowerCase();

      const plainName = (
        raw.encryptedName
          ? this.cipher.decryptForTenant(ownerId, raw.encryptedName)
          : String(raw.name ?? 'Titular da Conta')
      ).trim();

      const plainAvatar = raw.encryptedAvatarUrl
        ? this.cipher.decryptForTenant(ownerId, raw.encryptedAvatarUrl)
        : (raw.avatarUrl ?? null);

      const emailHash = this.cipher.blindIndex(plainEmail, USER_EMAIL_BLIND_INDEX_NAMESPACE);
      const encryptedEmail = this.cipher.encryptForTenant(ownerId, plainEmail);
      const encryptedName = this.cipher.encryptForTenant(ownerId, plainName);
      const encryptedAvatarUrl = plainAvatar
        ? this.cipher.encryptForTenant(ownerId, plainAvatar)
        : null;

      await rawCol.updateOne(
        { _id: ownerId },
        {
          $set: {
            ownerId,
            emailHash,
            encryptedEmail,
            encryptedName,
            encryptedAvatarUrl,
            passwordHash: raw.passwordHash ?? '',
            rlsVersion: 1,
            createdAt: raw.createdAt || now,
            updatedAt: raw.updatedAt || now,
          },
          $unset: {
            email: '',
            name: '',
            avatarUrl: '',
          },
        },
      );
    }
  }

  private mapDocToEntity(doc: UserDoc, expectedOwnerId: string): UserEntity {
    assertUserDocumentOwnership(doc, expectedOwnerId);

    const email = this.cipher
      .decryptForTenant(expectedOwnerId, doc.encryptedEmail)
      .trim()
      .toLowerCase();
    const name = this.cipher.decryptForTenant(expectedOwnerId, doc.encryptedName);
    const avatarUrl = doc.encryptedAvatarUrl
      ? this.cipher.decryptForTenant(expectedOwnerId, doc.encryptedAvatarUrl)
      : null;

    const computedEmailHash = this.cipher.blindIndex(email, USER_EMAIL_BLIND_INDEX_NAMESPACE);
    if (computedEmailHash !== doc.emailHash) {
      throw new ForbiddenError(
        'Violação de integridade RLS no MongoDB: divergência no blind index do titular.',
      );
    }

    return {
      id: doc._id,
      name,
      email,
      passwordHash: doc.passwordHash,
      avatarUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const emailHash = this.cipher.blindIndex(normalized, USER_EMAIL_BLIND_INDEX_NAMESPACE);
    const doc = await this.collection().findOne(buildUserRlsFilterByEmailHash(emailHash));
    if (!doc) return null;

    return this.mapDocToEntity(doc, doc._id);
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const rlsFilter = buildUserRlsFilterById(id);
    const doc = await this.collection().findOne(rlsFilter);
    if (!doc) return null;

    return this.mapDocToEntity(doc, rlsFilter.ownerId);
  }

  public async create(user: CreateUserRecord): Promise<UserEntity> {
    const ownerId = assertValidOwnerId(user.id);
    if (!user.passwordHash || !user.passwordHash.startsWith('$scrypt$')) {
      throw new ForbiddenError(
        'Violação de segurança no MongoDB: hash de senha inválido ou explícito rejeitado.',
      );
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const trimmedName = user.name.trim();
    const emailHash = this.cipher.blindIndex(normalizedEmail, USER_EMAIL_BLIND_INDEX_NAMESPACE);

    const doc: UserDoc = {
      _id: ownerId,
      ownerId,
      emailHash,
      encryptedEmail: this.cipher.encryptForTenant(ownerId, normalizedEmail),
      encryptedName: this.cipher.encryptForTenant(ownerId, trimmedName),
      encryptedAvatarUrl: null,
      passwordHash: user.passwordHash,
      rlsVersion: 1,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    await this.collection().updateOne(
      buildUserRlsFilterById(ownerId),
      { $set: doc },
      { upsert: true },
    );

    return {
      id: ownerId,
      name: trimmedName,
      email: normalizedEmail,
      passwordHash: user.passwordHash,
      avatarUrl: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  public async updateProfile(
    id: string,
    changes: { name?: string; avatarUrl?: string | null },
  ): Promise<UserEntity | null> {
    const rlsFilter = buildUserRlsFilterById(id);
    const existing = await this.collection().findOne(rlsFilter);
    if (!existing) return null;
    assertUserDocumentOwnership(existing, rlsFilter.ownerId);

    const set: Partial<UserDoc> = { updatedAt: new Date().toISOString() };
    if (changes.name?.trim()) {
      set.encryptedName = this.cipher.encryptForTenant(rlsFilter.ownerId, changes.name.trim());
    }
    if (changes.avatarUrl !== undefined) {
      set.encryptedAvatarUrl = changes.avatarUrl
        ? this.cipher.encryptForTenant(rlsFilter.ownerId, changes.avatarUrl)
        : null;
    }

    await this.collection().updateOne(rlsFilter, { $set: set });
    return this.findById(rlsFilter.ownerId);
  }

  public async deleteById(id: string): Promise<boolean> {
    const rlsFilter = buildUserRlsFilterById(id);
    const res = await this.collection().deleteOne(rlsFilter);
    return (res.deletedCount ?? 0) > 0;
  }
}
