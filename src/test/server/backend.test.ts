import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAppContainer, type AppContainer } from '../../../server/container';
import { UnauthorizedError, ConflictError, DtoValidationError, NotFoundError } from '../../../server/errors/AppError';
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
    const delRes = await container.authController.deleteAccount(mariaAuth);
    expect(delRes.status).toBe(200);
    expect(delRes.data.deleted).toBe(true);

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
});
