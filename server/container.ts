import { getServerEnv, type ServerEnv } from './config/env';
import { AuthController } from './controllers/AuthController';
import { StudyDataController } from './controllers/StudyDataController';
import { getMongoDb } from './database/mongoClient';
import { ensureDefaultUserAndFirefoxData } from './database/seedFirefoxData';
import { SqliteDatabaseClient } from './database/SqliteDatabaseClient';
import type { IAuthService } from './interfaces/IAuthService';
import type { IDatabaseClient } from './interfaces/IDatabaseClient';
import type { IPasswordHasher } from './interfaces/IPasswordHasher';
import type { ISensitiveDataCipher } from './interfaces/ISensitiveDataCipher';
import type { IStudyDataRepository } from './interfaces/IStudyDataRepository';
import type { IStudyDataService } from './interfaces/IStudyDataService';
import type { ITokenService } from './interfaces/ITokenService';
import type { IUserRepository } from './interfaces/IUserRepository';
import { BearerAuthGuard } from './middlewares/authMiddleware';
import { MongoStudyDataRepository } from './repositories/MongoStudyDataRepository';
import { MongoUserRepository } from './repositories/MongoUserRepository';
import { SqlStudyDataRepository } from './repositories/SqlStudyDataRepository';
import { SqlUserRepository } from './repositories/SqlUserRepository';
import { JwtTokenService } from './security/JwtTokenService';
import { PasswordHasher } from './security/PasswordHasher';
import { SensitiveDataCipher } from './security/SensitiveDataCipher';
import { AuthService } from './services/AuthService';
import { StudyDataService } from './services/StudyDataService';

export interface AppContainer {
  env: ServerEnv;
  dbClient?: IDatabaseClient;
  passwordHasher: IPasswordHasher;
  sensitiveDataCipher: ISensitiveDataCipher;
  tokenService: ITokenService;
  userRepository: IUserRepository;
  studyDataRepository: IStudyDataRepository;
  authService: IAuthService;
  studyDataService: IStudyDataService;
  authGuard: BearerAuthGuard;
  authController: AuthController;
  studyDataController: StudyDataController;
  seedReady: Promise<string>;
}

/**
 * Composition Root (DIP): instancia e injeta as dependências do backend.
 * Suporta MongoDB nativo na nuvem quando MONGODB_URI estiver configurado,
 * com fallback para SQLite local em ambientes de desenvolvimento sem rede.
 */
export function createAppContainer(overrides: Partial<ServerEnv> = {}): AppContainer {
  const env: ServerEnv = {
    ...getServerEnv(),
    ...overrides,
  };

  const passwordHasher = new PasswordHasher();
  const sensitiveDataCipher = new SensitiveDataCipher(env.jwtSecret);
  const tokenService = new JwtTokenService({
    secret: env.jwtSecret,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    expiresInSeconds: env.jwtExpiresInSeconds,
  });

  let userRepository: IUserRepository;
  let studyDataRepository: IStudyDataRepository;
  let dbClient: IDatabaseClient | undefined;

  let resolveDbReady: () => void = () => {};
  const dbReadyPromise = new Promise<void>((resolve) => {
    resolveDbReady = resolve;
  });

  if (env.mongoUri) {
    // Modo MongoDB Cloud (Atlas) com RLS e Criptografia Autenticada em Repouso
    const initMongo = async () => {
      const db = await getMongoDb({ uri: env.mongoUri });
      const mongoUserRepo = new MongoUserRepository(db, sensitiveDataCipher);
      const mongoStudyRepo = new MongoStudyDataRepository(db, sensitiveDataCipher);
      await Promise.all([mongoUserRepo.initIndexes(), mongoStudyRepo.initIndexes()]);
      return { mongoUserRepo, mongoStudyRepo };
    };

    const mongoInitPromise = initMongo();

    // Repositório proxy que aguarda conexão
    userRepository = {
      async findByEmail(email: string) {
        const { mongoUserRepo } = await mongoInitPromise;
        return mongoUserRepo.findByEmail(email);
      },
      async findById(id: string) {
        const { mongoUserRepo } = await mongoInitPromise;
        return mongoUserRepo.findById(id);
      },
      async create(user) {
        const { mongoUserRepo } = await mongoInitPromise;
        return mongoUserRepo.create(user);
      },
      async updateProfile(id, changes) {
        const { mongoUserRepo } = await mongoInitPromise;
        return mongoUserRepo.updateProfile(id, changes);
      },
      async deleteById(id: string) {
        const { mongoUserRepo } = await mongoInitPromise;
        return mongoUserRepo.deleteById(id);
      },
    };

    studyDataRepository = {
      async ensureUserSeed(userId: string) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.ensureUserSeed(userId);
      },
      async getWorkspace(userId: string) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.getWorkspace(userId);
      },
      async replaceWorkspace(userId, ws) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.replaceWorkspace(userId, ws);
      },
      async resetWorkspace(userId) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.resetWorkspace(userId);
      },
      async deleteUserWorkspace(userId) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.deleteUserWorkspace(userId);
      },
      async applyBatch(userId, ops) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.applyBatch(userId, ops);
      },
      async upsertTable(userId, table, recs) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.upsertTable(userId, table, recs);
      },
      async deleteFromTable(userId, table, ids) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.deleteFromTable(userId, table, ids);
      },
      async clearTable(userId, table) {
        const { mongoStudyRepo } = await mongoInitPromise;
        return mongoStudyRepo.clearTable(userId, table);
      },
    };

    mongoInitPromise
      .then(() => resolveDbReady())
      .catch(() => {
        // Resolve readiness so request handlers can surface a clean error instead of hanging
        resolveDbReady();
      });
  } else {
    // Fallback SQLite local
    dbClient = new SqliteDatabaseClient(env.dbPath);
    userRepository = new SqlUserRepository(dbClient);
    studyDataRepository = new SqlStudyDataRepository(dbClient, sensitiveDataCipher);
    resolveDbReady();
  }

  const authService = new AuthService(
    userRepository,
    studyDataRepository,
    passwordHasher,
    tokenService,
  );
  const studyDataService = new StudyDataService(studyDataRepository);

  const authGuard = new BearerAuthGuard(
    tokenService,
    userRepository,
    !env.mongoUri && Boolean(process.env.VERCEL),
  );
  const authController = new AuthController(authService);
  const studyDataController = new StudyDataController(studyDataService);

  const seedReady = dbReadyPromise.then(() =>
    ensureDefaultUserAndFirefoxData({
      userRepository,
      studyDataRepository,
      passwordHasher,
      email: env.defaultUserEmail,
      password: env.defaultUserPassword,
      name: env.defaultUserName,
      seedFilePath: env.seedFilePath,
    }),
  );

  return {
    env,
    dbClient,
    passwordHasher,
    sensitiveDataCipher,
    tokenService,
    userRepository,
    studyDataRepository,
    authService,
    studyDataService,
    authGuard,
    authController,
    studyDataController,
    seedReady,
  };
}
