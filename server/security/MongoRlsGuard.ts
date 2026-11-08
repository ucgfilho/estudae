import type { Db, Document } from 'mongodb';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

const OWNER_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const CONTEST_SCOPE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const EMAIL_HASH_REGEX = /^[a-f0-9]{64}$/;
const CONTEST_SEPARATOR = '::contest::';

export interface TenantScopeContext {
  /** ID raiz imutável do titular autenticado (chave primária de isolamento RLS). */
  ownerId: string;
  /** ID composto do documento (`ownerId` ou `${ownerId}::contest::${scopeId}`). */
  scopedId: string;
  /** Identificador do escopo de concurso (`'default'` ou `contest_xxx`). */
  scopeId: string;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Valida o identificador raiz do titular contra NoSQL Injection, operadores `$` e caracteres inválidos.
 */
export function assertValidOwnerId(rawOwnerId: unknown): string {
  if (typeof rawOwnerId !== 'string') {
    throw new UnauthorizedError('Violação RLS: identificador do titular ausente ou inválido.');
  }
  const trimmed = rawOwnerId.trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.startsWith('$') || !OWNER_ID_REGEX.test(trimmed)) {
    throw new ForbiddenError('Violação RLS: identificador do titular fora do padrão de segurança.');
  }
  return trimmed;
}

/**
 * Extrai e valida estritamente o contexto de isolamento de linha/documento (RLS) a partir do `userId` (com ou sem escopo de concurso).
 */
export function parseTenantScope(rawUserId: unknown): TenantScopeContext {
  if (typeof rawUserId !== 'string') {
    throw new UnauthorizedError('Violação RLS: contexto de autenticação ausente.');
  }
  const trimmed = rawUserId.trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.startsWith('$')) {
    throw new ForbiddenError('Violação RLS: identificador de escopo inválido.');
  }

  if (!trimmed.includes(CONTEST_SEPARATOR)) {
    const ownerId = assertValidOwnerId(trimmed);
    return {
      ownerId,
      scopedId: ownerId,
      scopeId: 'default',
    };
  }

  const parts = trimmed.split(CONTEST_SEPARATOR);
  if (parts.length !== 2) {
    throw new ForbiddenError('Violação RLS: delimitador de escopo de concurso malformado.');
  }

  const ownerId = assertValidOwnerId(parts[0]);
  const rawScope = parts[1].trim();
  if (!rawScope || rawScope.startsWith('$') || !CONTEST_SCOPE_REGEX.test(rawScope)) {
    throw new ForbiddenError('Violação RLS: identificador de concurso inválido.');
  }

  if (rawScope === 'default') {
    return {
      ownerId,
      scopedId: ownerId,
      scopeId: 'default',
    };
  }

  return {
    ownerId,
    scopedId: `${ownerId}${CONTEST_SEPARATOR}${rawScope}`,
    scopeId: rawScope,
  };
}

/**
 * Valida um Blind Index (HMAC-SHA256) antes de executar consultas no MongoDB.
 */
export function assertValidEmailHash(emailHash: unknown): string {
  if (typeof emailHash !== 'string' || !EMAIL_HASH_REGEX.test(emailHash)) {
    throw new ForbiddenError('Violação RLS: blind index de e-mail inválido.');
  }
  return emailHash;
}

/**
 * Filtro obrigatório de Row-Level Security (RLS) para leitura/escrita na coleção `users` por ID.
 */
export function buildUserRlsFilterById(rawUserId: unknown): { _id: string; ownerId: string } {
  const ownerId = assertValidOwnerId(rawUserId);
  return { _id: ownerId, ownerId };
}

/**
 * Filtro obrigatório de Row-Level Security (RLS) para busca por Blind Index de e-mail na coleção `users`.
 */
export function buildUserRlsFilterByEmailHash(emailHash: unknown): { emailHash: string } {
  return { emailHash: assertValidEmailHash(emailHash) };
}

/**
 * Filtro obrigatório de Row-Level Security (RLS) para leitura/escrita na coleção `user_workspaces`.
 * Exige correspondência simultânea do `_id` (escopo) e do `ownerId` (titular raiz).
 */
export function buildWorkspaceRlsFilter(rawUserId: unknown): { _id: string; ownerId: string } {
  const { ownerId, scopedId } = parseTenantScope(rawUserId);
  return { _id: scopedId, ownerId };
}

/**
 * Filtro RLS de exclusão em cascata (LGPD Art. 18, VI) para remover todos os workspaces
 * (principal e múltiplos concursos) pertencentes ao titular.
 */
export function buildWorkspaceCascadeDeleteFilter(rawUserId: unknown): Document {
  const { ownerId } = parseTenantScope(rawUserId);
  return {
    $or: [
      { ownerId },
      { _id: ownerId },
      { _id: { $regex: `^${escapeRegex(ownerId)}${CONTEST_SEPARATOR}[a-zA-Z0-9_-]{1,64}$` } },
    ],
  };
}

/**
 * Verificação pós-leitura (Defense-in-Depth RLS) garantindo que o documento de usuário
 * retornado pelo MongoDB pertence estritamente ao titular esperado.
 */
export function assertUserDocumentOwnership(
  doc: { _id: string; ownerId?: string },
  expectedOwnerId: string,
): void {
  const cleanExpected = assertValidOwnerId(expectedOwnerId);
  if (!doc || doc._id !== cleanExpected || doc.ownerId !== cleanExpected) {
    throw new ForbiddenError(
      'Violação de política RLS no MongoDB: acesso negado a registro de outro titular.',
    );
  }
}

/**
 * Verificação pós-leitura (Defense-in-Depth RLS) garantindo que o workspace
 * retornado pelo MongoDB pertence estritamente ao titular e escopo autenticados.
 */
export function assertWorkspaceDocumentOwnership(
  doc: { _id: string; ownerId?: string; scopeId?: string },
  rawUserId: unknown,
): TenantScopeContext {
  const ctx = parseTenantScope(rawUserId);
  if (
    !doc ||
    doc._id !== ctx.scopedId ||
    doc.ownerId !== ctx.ownerId ||
    (doc.scopeId !== undefined && doc.scopeId !== ctx.scopeId)
  ) {
    throw new ForbiddenError(
      'Violação de política RLS no MongoDB: tentativa de acesso cruzado entre titulares ou escopos.',
    );
  }
  return ctx;
}

/**
 * JSON Schema nativo do MongoDB para a coleção `users`:
 * - Exige `ownerId`, `emailHash`, `encryptedEmail`, `encryptedName`, `passwordHash`, `rlsVersion`.
 * - `additionalProperties: false` proíbe terminantemente qualquer campo explícito (`email`, `name`, `avatarUrl`, `password`).
 * - Exige prefixo criptográfico `$aes256gcm$rls$v1$` nos campos de dados pessoais e `$scrypt$` no hash de senha.
 */
export const USERS_COLLECTION_JSON_SCHEMA: Document = {
  bsonType: 'object',
  required: [
    '_id',
    'ownerId',
    'emailHash',
    'encryptedEmail',
    'encryptedName',
    'passwordHash',
    'rlsVersion',
    'createdAt',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 1, maxLength: 128 },
    ownerId: { bsonType: 'string', minLength: 1, maxLength: 128 },
    emailHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
    encryptedEmail: { bsonType: 'string', pattern: '^\\$aes256gcm\\$rls\\$v1\\$' },
    encryptedName: { bsonType: 'string', pattern: '^\\$aes256gcm\\$rls\\$v1\\$' },
    encryptedAvatarUrl: {
      oneOf: [
        { bsonType: 'null' },
        { bsonType: 'string', pattern: '^\\$aes256gcm\\$rls\\$v1\\$' },
      ],
    },
    passwordHash: { bsonType: 'string', pattern: '^\\$scrypt\\$' },
    rlsVersion: { bsonType: ['int', 'long', 'double'], minimum: 1 },
    createdAt: { bsonType: 'string', minLength: 1 },
    updatedAt: { bsonType: 'string', minLength: 1 },
  },
};

/**
 * JSON Schema nativo do MongoDB para a coleção `user_workspaces`:
 * - Exige `ownerId`, `scopeId`, `encryptedPayload`, `rlsVersion`, `updatedAt`.
 * - `additionalProperties: false` proíbe terminantemente qualquer array explícito (`disciplines`, `topics`, `sessions`,
 *   `timer`, `questionLogs`, `errorNotes`, `reviews`, `weeklyPlans`, `settings`, `mockExams`).
 * - Exige prefixo criptográfico `$aes256gcm$rls$v1$` em `encryptedPayload`.
 */
export const WORKSPACES_COLLECTION_JSON_SCHEMA: Document = {
  bsonType: 'object',
  required: ['_id', 'ownerId', 'scopeId', 'encryptedPayload', 'rlsVersion', 'updatedAt'],
  additionalProperties: false,
  properties: {
    _id: { bsonType: 'string', minLength: 1, maxLength: 256 },
    ownerId: { bsonType: 'string', minLength: 1, maxLength: 128 },
    scopeId: { bsonType: 'string', minLength: 1, maxLength: 64 },
    encryptedPayload: { bsonType: 'string', pattern: '^\\$aes256gcm\\$rls\\$v1\\$' },
    rlsVersion: { bsonType: ['int', 'long', 'double'], minimum: 1 },
    updatedAt: { bsonType: 'string', minLength: 1 },
  },
};

async function ensureCollectionValidator(
  db: Db,
  collectionName: string,
  jsonSchema: Document,
): Promise<void> {
  const existing = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  if (existing.length === 0) {
    await db.createCollection(collectionName, {
      validator: { $jsonSchema: jsonSchema },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    return;
  }

  await db.command({
    collMod: collectionName,
    validator: { $jsonSchema: jsonSchema },
    validationLevel: 'strict',
    validationAction: 'error',
  });
}

export async function applyUsersCollectionValidator(db: Db): Promise<void> {
  await ensureCollectionValidator(db, 'users', USERS_COLLECTION_JSON_SCHEMA);
}

export async function applyWorkspacesCollectionValidator(db: Db): Promise<void> {
  await ensureCollectionValidator(db, 'user_workspaces', WORKSPACES_COLLECTION_JSON_SCHEMA);
}
