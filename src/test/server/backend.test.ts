import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Db } from 'mongodb';
import { createAppContainer, type AppContainer } from '../../../server/container';
import {
  UnauthorizedError,
  ConflictError,
  DtoValidationError,
  NotFoundError,
  ForbiddenError,
} from '../../../server/errors/AppError';
import { MongoUserRepository } from '../../../server/repositories/MongoUserRepository';
import { MongoStudyDataRepository } from '../../../server/repositories/MongoStudyDataRepository';
import { SensitiveDataCipher } from '../../../server/security/SensitiveDataCipher';
import {
  parseTenantScope,
  assertValidOwnerId,
  assertUserDocumentOwnership,
  assertWorkspaceDocumentOwnership,
  USERS_COLLECTION_JSON_SCHEMA,
  WORKSPACES_COLLECTION_JSON_SCHEMA,
} from '../../../server/security/MongoRlsGuard';
import { SETTINGS_ID } from '../../db/types';
import { DEFAULT_SETTINGS } from '../../db/seed';

const TEST_USER = {
  name: 'Titular Teste LGPD',
  email: 'titular.lgpd@exemplo.local',
  password: 'SenhaSegura!2026#Test',
};

describe('Backend SOLID Architecture, DTOs, JWT Bearer & LGPD Compliance', () => {
  let container: AppContainer;

  beforeEach(async () => {
    container = createAppContainer({
      dbPath: ':memory:',
      mongoUri: '',
      seedFilePath: '__non_existent_seed__.json',
      jwtSecret: 'test-secret-key-for-jwt-signing-and-aes256gcm-2026',
      defaultUserEmail: TEST_USER.email,
      defaultUserPassword: TEST_USER.password,
      defaultUserName: TEST_USER.name,
    });
    await container.seedReady;
  });

  afterEach(() => {
    container.dbClient?.close();
  });

  it('provisions user with Scrypt-hashed password and authenticates via JWT Bearer', async () => {
    const dbUser = await container.userRepository.findByEmail(TEST_USER.email);
    expect(dbUser).not.toBeNull();
    expect(dbUser!.email).toBe(TEST_USER.email);
    expect(dbUser!.passwordHash).not.toBe(TEST_USER.password);
    expect(dbUser!.passwordHash).toMatch(/^\$scrypt\$16384\$8\$1\$/);

    expect(await container.passwordHasher.verify(TEST_USER.password, dbUser!.passwordHash)).toBe(true);
    expect(await container.passwordHasher.verify('SenhaIncorreta123', dbUser!.passwordHash)).toBe(false);

    const loginRes = await container.authController.login({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.tokenType).toBe('Bearer');
    expect(loginRes.data.token).toBeTruthy();
    expect(loginRes.data.user.email).toBe(TEST_USER.email);
    expect('passwordHash' in loginRes.data.user).toBe(false);

    const authUser = await container.authGuard.authenticate({
      authorization: `Bearer ${loginRes.data.token}`,
    });
    expect(authUser.id).toBe(dbUser!.id);
    expect(authUser.email).toBe(TEST_USER.email);

    const workspaceRes = await container.studyDataController.getWorkspace(authUser);
    expect(workspaceRes.status).toBe(200);
    expect(workspaceRes.data.data.disciplines).toHaveLength(8);
    expect(workspaceRes.data.data.settings).toHaveLength(1);
  });

  it('encrypts sensitive third-party API keys (gemini_api_key) at rest using AES-256-GCM (LGPD Art. 46)', async () => {
    const loginRes = await container.authController.login({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });
    const authUser = await container.authGuard.authenticate({
      authorization: `Bearer ${loginRes.data.token}`,
    });

    const sampleSensitiveKey = 'test-sensitive-api-key-value-do-not-store-plaintext';
    await container.studyDataController.mutateTable(authUser, 'settings', {
      action: 'upsert',
      records: [
        {
          ...DEFAULT_SETTINGS,
          id: SETTINGS_ID,
          geminiApiKey: sampleSensitiveKey,
          aiProvider: 'gemini',
        },
      ],
    });

    // Inspect raw SQLite row to prove key is encrypted at rest and NOT stored in plaintext
    const rawRow = container.dbClient!.get<{ gemini_api_key: string }>(
      `SELECT gemini_api_key FROM user_settings WHERE user_id = ?`,
      [authUser.id],
    );
    expect(rawRow).not.toBeNull();
    expect(rawRow!.gemini_api_key).not.toBe(sampleSensitiveKey);
    expect(rawRow!.gemini_api_key).toMatch(/^\$aes256gcm\$/);

    // Verify transparent decryption when read back by the authenticated owner
    const ws = (await container.studyDataController.getWorkspace(authUser)).data.data;
    expect(ws.settings[0].geminiApiKey).toBe(sampleSensitiveKey);
  });

  it('enforces JWT Bearer authentication, isolates data per user, and supports permanent LGPD account deletion (Art. 18, VI)', async () => {
    await expect(container.authGuard.authenticate({})).rejects.toThrow(UnauthorizedError);
    await expect(
      container.authGuard.authenticate({ authorization: 'Basic abc123' }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      container.authGuard.authenticate({ authorization: 'Bearer invalid.jwt.token' }),
    ).rejects.toThrow(UnauthorizedError);

    const regRes = await container.authController.register({
      name: 'Maria Analista',
      email: 'maria.bnb@exemplo.local',
      password: 'MariaPassword!2026',
    });
    expect(regRes.status).toBe(201);
    expect(regRes.data.tokenType).toBe('Bearer');
    expect(regRes.data.user.email).toBe('maria.bnb@exemplo.local');

    await expect(
      container.authController.register({
        name: 'Maria Duplicada',
        email: 'maria.bnb@exemplo.local',
        password: 'MariaPassword!2026',
      }),
    ).rejects.toThrow(ConflictError);

    const mariaAuth = await container.authGuard.authenticate({
      authorization: `Bearer ${regRes.data.token}`,
    });

    // Add a topic to Maria's workspace
    await container.studyDataController.mutateTable(mariaAuth, 'topics', {
      action: 'upsert',
      records: [
        {
          id: 'topic-maria-1',
          disciplineId: 'portugues',
          title: 'Sintaxe',
          parentTopicId: null,
          status: 'em-andamento',
          notes: '',
          order: 0,
          active: true,
          createdAt: '2026-10-28T00:00:00.000Z',
          updatedAt: '2026-10-28T00:00:00.000Z',
        },
      ],
    });
    expect((await container.studyDataController.getWorkspace(mariaAuth)).data.data.topics).toHaveLength(1);

    // LGPD Art. 18, VI: Permanent deletion of Maria's account and cascading elimination of all her records
    const deleteWorkspaceSpy = vi.spyOn(container.studyDataRepository, 'deleteUserWorkspace');
    const delRes = await container.authController.deleteAccount(mariaAuth);
    expect(delRes.status).toBe(200);
    expect(delRes.data.deleted).toBe(true);
    expect(deleteWorkspaceSpy).toHaveBeenCalledWith(mariaAuth.id);

    // Token for deleted user must now be rejected
    await expect(
      container.authGuard.authenticate({
        authorization: `Bearer ${regRes.data.token}`,
      }),
    ).rejects.toThrow(UnauthorizedError);

    // Verify cascading deletion in SQLite
    const remainingTopics = container.dbClient!.all(
      `SELECT id FROM topics WHERE user_id = ?`,
      [mariaAuth.id],
    );
    expect(remainingTopics).toHaveLength(0);

    // Deleting non-existent user throws NotFoundError
    await expect(container.authController.deleteAccount(mariaAuth)).rejects.toThrow(NotFoundError);
  });

  it('validates DTO inputs strictly and rejects invalid registration or login payloads', async () => {
    await expect(
      container.authController.register({
        name: 'A',
        email: 'email-invalido',
        password: '123',
      }),
    ).rejects.toThrow(DtoValidationError);

    await expect(
      container.authController.login({
        email: TEST_USER.email,
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('preserves session across serverless cold starts when starting or pausing a timer', async () => {
    const loginRes = await container.authController.login({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });

    // Simulate a second serverless instance cold-starting with a fresh ephemeral SQLite DB
    const secondInstance = createAppContainer({
      dbPath: ':memory:',
      mongoUri: '',
      seedFilePath: '__non_existent_seed__.json',
      jwtSecret: 'test-secret-key-for-jwt-signing-and-aes256gcm-2026',
      defaultUserEmail: TEST_USER.email,
      defaultUserPassword: TEST_USER.password,
      defaultUserName: TEST_USER.name,
    });
    await secondInstance.seedReady;

    try {
      const authUser = await secondInstance.authGuard.authenticate({
        authorization: `Bearer ${loginRes.data.token}`,
      });
      expect(authUser.id).toBe(loginRes.data.user.id);

      const batchRes = await secondInstance.studyDataController.executeBatch(authUser, {
        operations: [
          {
            table: 'timer',
            action: 'upsert',
            records: [
              {
                id: 'active',
                sessionId: null,
                status: 'running',
                startedAt: 1793200000000,
                firstStartedAt: 1793200000000,
                accumulatedSeconds: 0,
                plannedSeconds: 3600,
                disciplineId: 'portugues',
                topicId: null,
                objective: 'Sessão de teste',
                notes: '',
                updatedAt: 1793200000000,
              },
            ],
          },
        ],
      });
      expect(batchRes.status).toBe(200);
      expect(batchRes.data.data.timer).toHaveLength(1);
      expect(batchRes.data.data.timer[0].status).toBe('running');
    } finally {
      secondInstance.dbClient?.close();
    }
  });

  it('updates user profile (name and avatarUrl) via AuthController.updateMe', async () => {
    const loginRes = await container.authController.login({
      email: TEST_USER.email,
      password: TEST_USER.password,
    });
    const authUser = await container.authGuard.authenticate({
      authorization: `Bearer ${loginRes.data.token}`,
    });

    const sampleAvatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const patchRes = await container.authController.updateMe(authUser, {
      name: 'Novo Nome Estudaê',
      avatarUrl: sampleAvatar,
    });

    expect(patchRes.status).toBe(200);
    expect(patchRes.data.user.name).toBe('Novo Nome Estudaê');
    expect(patchRes.data.user.avatarUrl).toBe(sampleAvatar);

    const meRes = await container.authController.me(authUser);
    expect(meRes.data.user.name).toBe('Novo Nome Estudaê');
    expect(meRes.data.user.avatarUrl).toBe(sampleAvatar);
  });
});

function createInMemoryMongoDbMock(): {
  db: Db;
  rawCollections: Map<string, Map<string, Record<string, unknown>>>;
  validators: Map<string, Record<string, unknown>>;
} {
  const rawCollections = new Map<string, Map<string, Record<string, unknown>>>();
  const validators = new Map<string, Record<string, unknown>>();

  const getStore = (name: string) => {
    let store = rawCollections.get(name);
    if (!store) {
      store = new Map();
      rawCollections.set(name, store);
    }
    return store;
  };

  const matchesFilter = (doc: Record<string, unknown>, filter: Record<string, unknown>): boolean => {
    if ('$or' in filter && Array.isArray(filter.$or)) {
      return filter.$or.some((sub) => matchesFilter(doc, sub as Record<string, unknown>));
    }
    for (const [k, v] of Object.entries(filter)) {
      if (v && typeof v === 'object' && '$regex' in (v as Record<string, unknown>)) {
        const re = new RegExp(String((v as { $regex: string }).$regex));
        if (!re.test(String(doc[k] ?? ''))) return false;
      } else if (doc[k] !== v) {
        return false;
      }
    }
    return true;
  };

  const validateAgainstSchema = (colName: string, doc: Record<string, unknown>) => {
    const schema = validators.get(colName) as
      | {
          required?: string[];
          additionalProperties?: boolean;
          properties?: Record<string, { pattern?: string }>;
        }
      | undefined;
    if (!schema) return;
    for (const req of schema.required ?? []) {
      if (!(req in doc) || doc[req] === undefined) {
        throw new Error(`Document failed validation: missing required field ${req}`);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(doc)) {
        if (!allowed.has(key)) {
          throw new Error(`Document failed validation: explicit field "${key}" is forbidden by RLS schema`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.pattern && typeof doc[key] === 'string') {
          const re = new RegExp(propSchema.pattern);
          if (!re.test(doc[key] as string)) {
            throw new Error(`Document failed validation: field "${key}" failed pattern ${propSchema.pattern}`);
          }
        }
      }
    }
  };

  const db = {
    listCollections: ({ name }: { name?: string } = {}) => ({
      toArray: async () => {
        const names = Array.from(rawCollections.keys()).filter((n) => !name || n === name);
        return names.map((n) => ({ name: n }));
      },
    }),
    createCollection: async (name: string, opts?: { validator?: { $jsonSchema?: Record<string, unknown> } }) => {
      getStore(name);
      if (opts?.validator?.$jsonSchema) {
        validators.set(name, opts.validator.$jsonSchema);
      }
    },
    command: async (cmd: { collMod?: string; validator?: { $jsonSchema?: Record<string, unknown> } }) => {
      if (cmd.collMod && cmd.validator?.$jsonSchema) {
        validators.set(cmd.collMod, cmd.validator.$jsonSchema);
      }
      return { ok: 1 };
    },
    collection: (name: string) => {
      const store = getStore(name);
      return {
        indexes: async () => [{ name: '_id_' }, { name: 'email_1' }],
        dropIndex: async () => ({ ok: 1 }),
        createIndex: async () => 'ok',
        find: (filter: Record<string, unknown> = {}) => ({
          toArray: async () =>
            Array.from(store.values())
              .filter((d) => matchesFilter(d, filter))
              .map((d) => structuredClone(d)),
        }),
        findOne: async (filter: Record<string, unknown>) => {
          for (const doc of store.values()) {
            if (matchesFilter(doc, filter)) {
              return structuredClone(doc);
            }
          }
          return null;
        },
        insertOne: async (doc: Record<string, unknown>) => {
          const copy = structuredClone(doc);
          validateAgainstSchema(name, copy);
          store.set(String(copy._id), copy);
          return { insertedId: copy._id };
        },
        updateOne: async (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
          opts?: { upsert?: boolean },
        ) => {
          let existing: Record<string, unknown> | undefined;
          for (const doc of store.values()) {
            if (matchesFilter(doc, filter)) {
              existing = doc;
              break;
            }
          }
          if (!existing && !opts?.upsert) {
            return { matchedCount: 0, modifiedCount: 0 };
          }
          const next: Record<string, unknown> = existing
            ? structuredClone(existing)
            : { _id: filter._id };
          if (update.$set) {
            Object.assign(next, structuredClone(update.$set));
          }
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
              delete next[k];
            }
          }
          validateAgainstSchema(name, next);
          store.set(String(next._id), next);
          return { matchedCount: existing ? 1 : 0, modifiedCount: 1 };
        },
        deleteOne: async (filter: Record<string, unknown>) => {
          for (const [id, doc] of store.entries()) {
            if (matchesFilter(doc, filter)) {
              store.delete(id);
              return { deletedCount: 1 };
            }
          }
          return { deletedCount: 0 };
        },
        deleteMany: async (filter: Record<string, unknown>) => {
          let deletedCount = 0;
          for (const [id, doc] of Array.from(store.entries())) {
            if (matchesFilter(doc, filter)) {
              store.delete(id);
              deletedCount++;
            }
          }
          return { deletedCount };
        },
      };
    },
  } as unknown as Db;

  return { db, rawCollections, validators };
}

describe('MongoDB Row-Level Security (RLS) & Zero Explicit Data at Rest', () => {
  const cipher = new SensitiveDataCipher('test-master-secret-for-mongodb-rls-2026-suite');

  it('enforces zero explicit PII in MongoDB users collection with Blind Indexing and AAD tenant encryption', async () => {
    const { db, rawCollections, validators } = createInMemoryMongoDbMock();
    const userRepo = new MongoUserRepository(db, cipher);
    await userRepo.initIndexes();

    expect(validators.get('users')).toEqual(USERS_COLLECTION_JSON_SCHEMA);

    const created = await userRepo.create({
      id: 'user-rls-1',
      name: 'Carlos Analista',
      email: 'carlos.rls@exemplo.com',
      passwordHash: '$scrypt$16384$8$1$aabbcc$ddeeff',
      createdAt: '2026-11-08T00:00:00.000Z',
      updatedAt: '2026-11-08T00:00:00.000Z',
    });
    expect(created.email).toBe('carlos.rls@exemplo.com');

    await userRepo.updateProfile('user-rls-1', {
      name: 'Carlos Sênior',
      avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    });

    const rawDoc = rawCollections.get('users')!.get('user-rls-1')!;
    expect(rawDoc).toBeDefined();
    expect(rawDoc.ownerId).toBe('user-rls-1');
    expect(rawDoc.rlsVersion).toBe(1);
    // Zero explicit fields in MongoDB
    expect('email' in rawDoc).toBe(false);
    expect('name' in rawDoc).toBe(false);
    expect('avatarUrl' in rawDoc).toBe(false);
    expect(String(rawDoc.encryptedEmail)).toMatch(/^\$aes256gcm\$rls\$v1\$/);
    expect(String(rawDoc.encryptedName)).toMatch(/^\$aes256gcm\$rls\$v1\$/);
    expect(String(rawDoc.encryptedAvatarUrl)).toMatch(/^\$aes256gcm\$rls\$v1\$/);
    expect(String(rawDoc.emailHash)).toMatch(/^[a-f0-9]{64}$/);

    // Cryptographic tenant isolation: User B cannot decrypt User A's encrypted fields
    expect(() =>
      cipher.decryptForTenant('user-rls-2', String(rawDoc.encryptedEmail)),
    ).toThrow(ForbiddenError);

    // Owner can transparently query by email (via blind index) and by id
    const foundByEmail = await userRepo.findByEmail('CARLOS.RLS@EXEMPLO.COM');
    expect(foundByEmail).not.toBeNull();
    expect(foundByEmail!.id).toBe('user-rls-1');
    expect(foundByEmail!.name).toBe('Carlos Sênior');
    expect(foundByEmail!.avatarUrl).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
  });

  it('enforces zero explicit study data in MongoDB user_workspaces, isolates contest scopes, and cascade-deletes all scopes on account removal', async () => {
    const { db, rawCollections, validators } = createInMemoryMongoDbMock();
    const studyRepo = new MongoStudyDataRepository(db, cipher);
    await studyRepo.initIndexes();

    expect(validators.get('user_workspaces')).toEqual(WORKSPACES_COLLECTION_JSON_SCHEMA);

    // Seed default contest and two additional contests for user-rls-1
    await studyRepo.upsertTable('user-rls-1', 'topics', [
      {
        id: 't-bnb-1',
        disciplineId: 'arquitetura',
        title: 'Segurança no MongoDB',
        parentTopicId: null,
        status: 'em-andamento',
        notes: 'Anotação confidencial do usuário',
        order: 0,
        active: true,
        createdAt: '2026-11-08T00:00:00.000Z',
        updatedAt: '2026-11-08T00:00:00.000Z',
      },
    ]);
    await studyRepo.ensureUserSeed('user-rls-1::contest::bb_ti');
    await studyRepo.ensureUserSeed('user-rls-1::contest::pf_agente');
    // Seed another user to verify cross-tenant isolation during cascade delete
    await studyRepo.ensureUserSeed('user-rls-2');

    const rawWsDoc = rawCollections.get('user_workspaces')!.get('user-rls-1')!;
    expect(rawWsDoc).toBeDefined();
    expect(rawWsDoc.ownerId).toBe('user-rls-1');
    expect(rawWsDoc.scopeId).toBe('default');
    expect(String(rawWsDoc.encryptedPayload)).toMatch(/^\$aes256gcm\$rls\$v1\$/);
    expect(String(rawWsDoc.encryptedPayload)).not.toContain('Anotação confidencial do usuário');

    // No explicit study tables exist on the MongoDB document
    for (const table of [
      'disciplines',
      'topics',
      'sessions',
      'timer',
      'questionLogs',
      'errorNotes',
      'reviews',
      'weeklyPlans',
      'settings',
      'mockExams',
    ]) {
      expect(table in rawWsDoc).toBe(false);
    }

    // Cryptographic AAD check blocks decryption under another tenant's ownerId
    expect(() =>
      cipher.decryptForTenant('user-rls-2', String(rawWsDoc.encryptedPayload)),
    ).toThrow(ForbiddenError);

    // Cascade delete for user-rls-1 removes default workspace AND all contest scopes, preserving user-rls-2
    await studyRepo.deleteUserWorkspace('user-rls-1');
    const store = rawCollections.get('user_workspaces')!;
    expect(store.has('user-rls-1')).toBe(false);
    expect(store.has('user-rls-1::contest::bb_ti')).toBe(false);
    expect(store.has('user-rls-1::contest::pf_agente')).toBe(false);
    expect(store.has('user-rls-2')).toBe(true);
  });

  it('migrates legacy plaintext documents in users and user_workspaces removing all explicit fields', async () => {
    const { db, rawCollections } = createInMemoryMongoDbMock();

    // Pre-populate legacy explicit documents before initIndexes()
    rawCollections.set(
      'users',
      new Map([
        [
          'legacy-user-1',
          {
            _id: 'legacy-user-1',
            name: 'Usuária Legada Explícita',
            email: 'legada@exemplo.com',
            passwordHash: '$scrypt$16384$8$1$112233$445566',
            avatarUrl: 'data:image/jpeg;base64,/9j/legacy',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      ]),
    );
    rawCollections.set(
      'user_workspaces',
      new Map([
        [
          'legacy-user-1',
          {
            _id: 'legacy-user-1',
            disciplines: [],
            topics: [
              {
                id: 'legacy-topic',
                disciplineId: 'portugues',
                title: 'Crase',
                parentTopicId: null,
                status: 'concluido',
                notes: 'Texto explícito antigo',
                order: 0,
                active: true,
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            sessions: [],
            timer: [],
            questionLogs: [],
            errorNotes: [],
            reviews: [],
            weeklyPlans: [],
            settings: [{ ...DEFAULT_SETTINGS, id: SETTINGS_ID, geminiApiKey: 'plain-api-key-123' }],
            mockExams: [],
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      ]),
    );

    const userRepo = new MongoUserRepository(db, cipher);
    const studyRepo = new MongoStudyDataRepository(db, cipher);
    await userRepo.initIndexes();
    await studyRepo.initIndexes();

    const migratedUserRaw = rawCollections.get('users')!.get('legacy-user-1')!;
    expect('email' in migratedUserRaw).toBe(false);
    expect('name' in migratedUserRaw).toBe(false);
    expect('avatarUrl' in migratedUserRaw).toBe(false);
    expect(migratedUserRaw.ownerId).toBe('legacy-user-1');

    const migratedWsRaw = rawCollections.get('user_workspaces')!.get('legacy-user-1')!;
    expect('topics' in migratedWsRaw).toBe(false);
    expect('settings' in migratedWsRaw).toBe(false);
    expect(migratedWsRaw.ownerId).toBe('legacy-user-1');

    const user = await userRepo.findByEmail('legada@exemplo.com');
    expect(user?.name).toBe('Usuária Legada Explícita');

    const ws = await studyRepo.getWorkspace('legacy-user-1');
    expect(ws.topics).toHaveLength(1);
    expect(ws.topics[0].title).toBe('Crase');
    expect(ws.settings[0].geminiApiKey).toBe('plain-api-key-123');
  });

  it('rejects NoSQL operator injection, invalid tenant scopes, and cross-tenant document ownership tampering', () => {
    expect(() => assertValidOwnerId('$ne')).toThrow(ForbiddenError);
    expect(() => assertValidOwnerId('user\0id')).toThrow(ForbiddenError);
    expect(() => parseTenantScope('user1::contest::$where')).toThrow(ForbiddenError);
    expect(() => parseTenantScope('user1::contest::../admin')).toThrow(ForbiddenError);

    expect(() =>
      assertUserDocumentOwnership({ _id: 'user-a', ownerId: 'user-b' }, 'user-a'),
    ).toThrow(ForbiddenError);
    expect(() =>
      assertWorkspaceDocumentOwnership(
        { _id: 'user-a', ownerId: 'user-b', scopeId: 'default' },
        'user-a',
      ),
    ).toThrow(ForbiddenError);
  });
});

