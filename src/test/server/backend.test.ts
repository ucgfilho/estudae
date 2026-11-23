import { createServer } from 'node:http';
import { handleApiRequest } from '../../../server/app';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteDatabaseClient } from '../../../server/database/SqliteDatabaseClient';
import { RELATIONAL_SCHEMA_SQL } from '../../../server/database/schema';
import { CYCLE_COMPLETION, cycleCompletions, nextCycleActivity } from '../../domain/schedule';
import type { StudySession, TimerState, Topic } from '../../db/types';
import type { IStudyDataRepository } from '../../../server/interfaces/IStudyDataRepository';
import { SqlStudyDataRepository } from '../../../server/repositories/SqlStudyDataRepository';
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
import { sqliteAuthState } from '../../../server/security/AuthState';
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

const cycleTimer: TimerState = {
  id: 'active', sessionId: null, cycleStudy: true, status: 'paused', startedAt: null,
  firstStartedAt: 1000, accumulatedSeconds: 60, plannedSeconds: 1800,
  disciplineId: 'portugues', topicId: null, objective: 'Estudo', notes: 'Retomar', updatedAt: 61000,
};
const cycleSession: StudySession = {
  id: 'cycle-completed', date: '2026-11-17', disciplineId: 'portugues', topicId: null,
  plannedStart: null, plannedMinutes: 30, actualSeconds: 120, status: 'concluida',
  objective: 'Estudo', notes: '', origin: 'avulsa', startedAt: '2026-11-17T10:00:00Z',
  endedAt: '2026-11-17T10:02:00Z', recoveredFromId: null,
  history: [{ type: 'executada', at: '2026-11-17T10:02:00Z', description: CYCLE_COMPLETION }],
  createdAt: '2026-11-17T10:02:00Z', updatedAt: '2026-11-17T10:02:00Z',
};
async function assertReusableTopicCompletion(repository: IStudyDataRepository, owner: string, otherUser: string) {
  const target = `${owner}::contest::outro`;
  const source: Topic = {
    id: 'topic', disciplineId: 'portugues', title: 'Interpretação de textos', parentTopicId: null,
    status: 'concluido', notes: '', order: 0, active: true,
    createdAt: '2026-11-22T10:00:00Z', updatedAt: '2026-11-22T10:00:00Z',
  };
  const pending: Topic = { ...source, title: 'Interpretação de texto', status: 'em-andamento', notes: 'Anotação local' };
  await repository.ensureUserSeed(target);
  await repository.ensureUserSeed(otherUser);
  await repository.upsertTable(target, 'topics', [pending]);
  await repository.upsertTable(otherUser, 'topics', [pending]);
  await repository.upsertTable(owner, 'topics', [source, { ...pending, id: 'same-contest' }]);

  expect((await repository.getWorkspace(otherUser)).topics).toEqual([pending]);
  expect((await repository.getWorkspace(owner)).topics.find(({ id }) => id === 'same-contest')?.status).toBe('em-andamento');
  const [completed] = (await repository.getWorkspace(target)).topics;
  expect(completed).toEqual({ ...pending, status: 'concluido', updatedAt: expect.any(String) });
  expect((await repository.getWorkspace(target)).topics).toEqual([completed]);
  const reopened: Topic = { ...completed, status: 'nao-iniciado', completionReuseDisabled: true };
  await repository.upsertTable(target, 'topics', [reopened]);
  expect((await repository.getWorkspace(target)).topics).toEqual([reopened]);

  await repository.applyBatch(target, [{ table: 'settings', action: 'patch', changes: { contestHidden: true } }]);
  const hiddenTopic = { ...source, id: 'hidden-topic', title: 'Pontuação' };
  // A different scope owned by the same user can be hidden after storing completed content.
  const hidden = `${owner}::contest::hidden`;
  await repository.ensureUserSeed(hidden);
  await repository.upsertTable(hidden, 'topics', [hiddenTopic]);
  await repository.applyBatch(hidden, [{ table: 'settings', action: 'patch', changes: { contestHidden: true } }]);
  const activeTopic: Topic = { ...hiddenTopic, status: 'nao-iniciado' };
  await repository.upsertTable(owner, 'topics', [activeTopic]);
  expect((await repository.getWorkspace(owner)).topics.find(({ id }) => id === activeTopic.id)).toEqual(activeTopic);
}

async function assertCyclePersistence(repository: IStudyDataRepository, ownerId: string) {
  await repository.upsertTable(ownerId, 'timer', [cycleTimer]);
  await repository.upsertTable(ownerId, 'sessions', [cycleSession]);
  const workspace = await repository.getWorkspace(ownerId);
  expect(workspace.timer).toEqual([cycleTimer]);
  expect(cycleCompletions(workspace.sessions)).toHaveLength(1);
  const next = nextCycleActivity({ ...workspace, settings: workspace.settings[0] });
  const secondContest = await repository.getWorkspace(`${ownerId}::contest::outro`);
  expect(secondContest.timer).toHaveLength(0);
  expect(cycleCompletions(secondContest.sessions)).toHaveLength(0);
  expect(next?.discipline.id).not.toBe('portugues');
  // Nova instância de repositório lê o mesmo histórico persistido sem estado em memória.
  return workspace;
}

describe('Backend SOLID Architecture, DTOs, JWT Bearer & LGPD Compliance', () => {
  let container: AppContainer;

  beforeEach(async () => {
    container = createAppContainer({
      dbPath: ':memory:',
      mongoUri: '',
      seedFilePath: '__non_existent_seed__.json',
      jwtSecret: 'test-secret-key-for-jwt-signing-only-2026',
      dataEncryptionKey: 'test-secret-key-for-data-encryption-only-2026',
      isVercel: false,
      defaultUserEmail: TEST_USER.email,
      defaultUserPassword: TEST_USER.password,
      defaultUserName: TEST_USER.name,
    });
    await container.seedReady;
  });

  afterEach(() => {
    container.dbClient?.close();
  });

  it('reaproveita a conclusão entre editais do mesmo usuário no SQLite', async () => {
    const user = (await container.userRepository.findByEmail(TEST_USER.email))!;
    await container.userRepository.create({
      id: 'other-user', name: 'Outro titular', email: 'other@example.test', passwordHash: user.passwordHash,
      createdAt: user.createdAt, updatedAt: user.updatedAt,
    });
    await assertReusableTopicCompletion(container.studyDataRepository, user.id, 'other-user');
  });

  it('persiste o ciclo e cronômetro no SQLite, isolados por usuário e concurso', async () => {
    const user = await container.userRepository.findByEmail(TEST_USER.email);
    const saved = await assertCyclePersistence(container.studyDataRepository, user!.id);
    const repository = new SqlStudyDataRepository(container.dbClient!);
    expect((await repository.getWorkspace(user!.id)).sessions).toEqual(saved.sessions);
    expect((await repository.getWorkspace(user!.id)).timer).toEqual(saved.timer);
    expect(() => repository.upsertTable(user!.id, 'timer', [{ ...cycleTimer, cycleStudy: 'sim' }])).toThrow(DtoValidationError);
  });

  it('migra SQLite antigo e preserva ciclo e escolha de reestudo após reabrir o banco', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'estudae-cycle-'));
    const file = join(directory, 'study.sqlite');
    let client: SqliteDatabaseClient | undefined;
    try {
      const legacy = new DatabaseSync(file);
      legacy.exec(RELATIONAL_SCHEMA_SQL
        .replace('  cycle_study INTEGER NULL CHECK (cycle_study IN (0, 1)),\n', '')
        .replace('  completion_reuse_disabled INTEGER NOT NULL DEFAULT 0 CHECK (completion_reuse_disabled IN (0, 1)),\n', ''));
      legacy.exec("INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ('cycle-user', 'Teste', 'cycle@test.local', 'hash', '2026-11-17', '2026-11-17')");
      legacy.close();
      client = new SqliteDatabaseClient(file);
      const repository = new SqlStudyDataRepository(client);
      await assertCyclePersistence(repository, 'cycle-user');
      const topic: Topic = {
        id: 'reopened-topic', disciplineId: 'portugues', title: 'Pontuação', parentTopicId: null,
        status: 'em-andamento', completionReuseDisabled: true, notes: '', order: 0, active: true,
        createdAt: '2026-11-22T10:00:00Z', updatedAt: '2026-11-22T10:00:00Z',
      };
      repository.upsertTable('cycle-user', 'topics', [topic]);
      client.close();
      client = new SqliteDatabaseClient(file);
      const restored = new SqlStudyDataRepository(client).getWorkspace('cycle-user');
      expect(restored.timer).toEqual([cycleTimer]);
      expect(cycleCompletions(restored.sessions)).toHaveLength(1);
      expect(restored.topics).toEqual([topic]);
    } finally { client?.close(); rmSync(directory, { recursive: true, force: true }); }
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

  it('keeps browser credentials in a protected cookie and revokes them at logout', async () => {
    container.env.nodeEnv = 'production';
    const server = createServer((req, res) => { void handleApiRequest(container, req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Endereço do teste indisponível.');
      const api = `http://127.0.0.1:${address.port}/api/auth`;
      const login = await fetch(`${api}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Estudae-Session': 'start' },
        body: JSON.stringify(TEST_USER),
      });
      expect(login.status).toBe(200);
      const { user, token } = await login.json();
      expect(token).toBeUndefined();
      const setCookie = login.headers.get('set-cookie')!;
      expect(setCookie).toContain('HttpOnly; SameSite=Strict; Path=/api');
      expect(setCookie).toContain('Secure');
      const cookie = setCookie.split(';')[0];
      const headers = { cookie, 'X-Estudae-Session': user.id };
      expect((await fetch(`${api}/me`, { headers })).status).toBe(200);
      const restoreHeaders = { cookie, 'X-Estudae-Session': 'restore' };
      const restored = await fetch(`${api}/me`, { headers: restoreHeaders });
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({ user: { id: user.id }, expiresIn: expect.any(Number) });
      expect((await fetch(`${api}/me`, {
        headers: { ...restoreHeaders, 'Sec-Fetch-Site': 'cross-site' },
      })).status).toBe(403);

      const bearer = cookie.slice('estudae_session='.length);
      const migrationHeaders = {
        Authorization: `Bearer ${bearer}`,
        'X-Estudae-Session': 'exchange',
        'Content-Type': 'application/json',
      };
      const exchange = await fetch(`${api}/me`, { headers: migrationHeaders });
      expect(exchange.headers.get('set-cookie')).toContain('HttpOnly');
      expect(await exchange.json()).toMatchObject({ exchanged: true, user: { id: user.id } });

      const workspace = `http://127.0.0.1:${address.port}/api/study-data`;
      const settings = { dailyGoalMinutes: 75 };
      const save = await fetch(`${workspace}/batch`, {
        method: 'POST',
        headers: migrationHeaders,
        body: JSON.stringify({ operations: [{ table: 'settings', action: 'patch', changes: settings }] }),
      });
      expect(save.status).toBe(200);
      expect(await save.json()).toMatchObject({ ok: true });
      const reload = await fetch(workspace, { headers });
      expect(reload.status).toBe(200);
      expect(await reload.json()).toMatchObject({ data: { settings: [settings] } });

      expect((await fetch(`${api}/logout`, { method: 'POST', headers: { cookie } })).status).toBe(403);

      const logout = await fetch(`${api}/logout`, { method: 'POST', headers });
      expect(logout.status).toBe(200);
      expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await fetch(`${api}/me`, { headers })).status).toBe(401);
      expect((await fetch(`${api}/me`, { headers: restoreHeaders })).status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });

  it('limits concurrent contest creation per account and reuses slots after removal', async () => {
    const { data: { token } } = await container.authController.login(TEST_USER);
    const server = createServer((req, res) => { void handleApiRequest(container, req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Endereço do teste indisponível.');
      const api = `http://127.0.0.1:${address.port}/api/study-data`;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const { data } = await (await fetch(api, { headers })).json();
      const save = (id: string) => fetch(`${api}/workspace`, {
        method: 'PUT',
        headers: { ...headers, 'X-Contest-Id': id },
        body: JSON.stringify(data),
      });
      const responses = await Promise.all(['alpha', 'beta', 'gamma'].map(save));
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 200, 409]);

      const active = ['alpha', 'beta', 'gamma'].filter((_, index) => responses[index].ok);
      expect((await save(active[0])).status).toBe(200);
      expect((await fetch(api, { headers: { ...headers, 'X-Contest-Id': 'unknown' } })).status).toBe(404);
      expect((await fetch(`${api}/batch`, {
        method: 'POST',
        headers: { ...headers, 'X-Contest-Id': active[0] },
        body: JSON.stringify({ operations: [{ table: 'settings', action: 'patch', changes: { contestHidden: true } }] }),
      })).status).toBe(200);

      expect((await save('replacement')).status).toBe(200);
      expect((await save(active[0])).status).toBe(404);
      const { contests } = await (await fetch(`${api}/contests`, { headers })).json();
      expect(contests).toHaveLength(3);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });

  it('requires a persistent account and rejects sessions from an earlier registration', async () => {
    const input = { name: 'Conta temporária', email: 'temporaria@example.test', password: 'TemporaryPassword!' };
    const first = await container.authController.register(input);
    const headers = { authorization: `Bearer ${first.data.token}` };
    const user = await container.authGuard.authenticate(headers);
    await container.authController.deleteAccount(user);
    await expect(container.authGuard.authenticate(headers)).rejects.toThrow(UnauthorizedError);
    expect(await container.userRepository.findById(user.id)).toBeFalsy();

    const recreated = await container.authController.register(input);
    expect(recreated.data.user.id).not.toBe(user.id);
    await expect(container.authGuard.authenticate(headers)).rejects.toThrow(UnauthorizedError);
    expect(await container.authGuard.authenticate({ authorization: `Bearer ${recreated.data.token}` }))
      .toMatchObject({ id: recreated.data.user.id });
  });

  it('rejects unsafe startup configuration', () => {
    expect(() => createAppContainer({ ...container.env, jwtSecret: '' })).toThrow('JWT_SECRET');
    expect(() => createAppContainer({ ...container.env, dataEncryptionKey: '' }))
      .toThrow('DATA_ENCRYPTION_KEY');
    expect(() => createAppContainer({ ...container.env, isVercel: true, mongoUri: '' })).toThrow('MONGODB_URI');
  });

  it('shares auth counters and revocations across connections to the same database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'estudae-auth-'));
    const path = join(dir, 'auth.sqlite');
    const first = new SqliteDatabaseClient(path);
    const second = new SqliteDatabaseClient(path);
    try {
      const firstState = sqliteAuthState(first);
      const secondState = sqliteAuthState(second);
      const expiresAt = Date.now() + 60_000;
      expect(await firstState.increment('counter', expiresAt)).toBe(1);
      expect(await secondState.increment('counter', expiresAt)).toBe(2);
      await secondState.revoke('revoked', expiresAt);
      expect(await firstState.isRevoked('revoked')).toBe(true);
    } finally {
      first.close();
      second.close();
      rmSync(dir, { recursive: true, force: true });
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
          async *[Symbol.asyncIterator]() {
            for (const doc of await this.toArray()) yield doc;
          },
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
          update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown>; $unset?: Record<string, unknown> },
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
          if (!existing && update.$setOnInsert) {
            Object.assign(next, structuredClone(update.$setOnInsert));
          }
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

  it('persiste ciclo e cronômetro em payload MongoDB cifrado, com isolamento de concursos e usuários', async () => {
    const { db } = createInMemoryMongoDbMock();
    const repository = new MongoStudyDataRepository(db, cipher);
    await repository.initIndexes();
    const saved = await assertCyclePersistence(repository, 'user-cycle');
    const reopened = new MongoStudyDataRepository(db, cipher);
    expect((await reopened.getWorkspace('user-cycle')).timer).toEqual(saved.timer);
    expect((await reopened.getWorkspace('user-cycle')).sessions).toEqual(saved.sessions);
    expect((await reopened.getWorkspace('another-user')).sessions).toHaveLength(0);
  });

  it('preserva a conclusão de revisão quando outro dispositivo grava simultaneamente', async () => {
    const { db } = createInMemoryMongoDbMock();
    const first = new MongoStudyDataRepository(db, cipher);
    const second = new MongoStudyDataRepository(db, cipher);
    await first.initIndexes();
    const review = {
      id: 'review-concurrent', disciplineId: 'portugues', topicId: null, errorNoteId: null,
      title: 'Revisão', dueDate: '2026-11-17', intervalDays: 1,
      status: 'pendente', completedAt: null, createdAt: '2026-11-16T10:00:00Z',
    };
    await first.upsertTable('user-concurrent', 'reviews', [review]);
    await Promise.all([
      first.upsertTable('user-concurrent', 'reviews', [{ ...review, status: 'concluida', completedAt: '2026-11-17T10:00:00Z' }]),
      second.upsertTable('user-concurrent', 'sessions', [cycleSession]),
    ]);
    const saved = await second.getWorkspace('user-concurrent');
    expect(saved.reviews[0].status).toBe('concluida');
    expect(saved.sessions).toEqual([cycleSession]);
  });

  it('reaproveita a conclusão entre editais do mesmo usuário no MongoDB', async () => {
    const { db } = createInMemoryMongoDbMock();
    const repository = new MongoStudyDataRepository(db, cipher);
    await repository.initIndexes();
    await assertReusableTopicCompletion(repository, 'owner-topic', 'other-topic');
  });

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
            settings: [{ ...DEFAULT_SETTINGS, id: SETTINGS_ID }],
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
    expect(ws.settings[0]).not.toHaveProperty('geminiApiKey');
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

