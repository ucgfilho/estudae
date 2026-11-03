import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStudyWorkspaceDto, type StudyWorkspaceDto } from '../dtos/study-data.dto';
import type { IPasswordHasher } from '../interfaces/IPasswordHasher';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';
import type { IUserRepository } from '../interfaces/IUserRepository';

export function deterministicUserIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const hex = createHash('sha256').update(`bnb-estudos-user-id:${normalized}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export interface SeedDefaultUserOptions {
  userRepository: IUserRepository;
  studyDataRepository: IStudyDataRepository;
  passwordHasher: IPasswordHasher;
  email: string;
  password: string;
  name: string;
  seedFilePath?: string;
}

function resolveDefaultSeedPath(): string {
  return resolve(process.cwd(), 'data', 'initial-workspace.seed.json');
}

export function loadFirefoxSeedWorkspace(seedFilePath?: string): StudyWorkspaceDto | null {
  const path = seedFilePath ?? resolveDefaultSeedPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { data?: unknown };
    if (!raw || typeof raw !== 'object' || !raw.data) return null;
    const workspace = parseStudyWorkspaceDto(raw.data);
    // LGPD / Secret Protection: never seed third-party API keys from static dump files
    if (Array.isArray(workspace.settings)) {
      workspace.settings = workspace.settings.map((s) => ({
        ...s,
        geminiApiKey: '',
      }));
    }
    return workspace;
  } catch {
    return null;
  }
}

/**
 * Garante de forma idempotente o provisionamento opcional do usuário inicial configurado
 * via variáveis de ambiente (.env), vinculando os dados locais ao seu `user_id` com senha hasheada.
 */
export async function ensureDefaultUserAndFirefoxData(
  options: SeedDefaultUserOptions,
): Promise<string> {
  const email = options.email.trim().toLowerCase();
  const password = options.password;
  const name = options.name.trim() || 'Titular da Conta';

  if (!email || !password) {
    return '';
  }

  const { userRepository, studyDataRepository, passwordHasher } = options;

  let user = await userRepository.findByEmail(email);
  const now = new Date().toISOString();

  if (!user) {
    const passwordHash = await passwordHasher.hash(password);
    user = await userRepository.create({
      id: deterministicUserIdFromEmail(email),
      name,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  const currentWorkspace = await studyDataRepository.getWorkspace(user.id);
  const isUnpopulated =
    currentWorkspace.topics.length === 0 &&
    currentWorkspace.sessions.length === 0 &&
    currentWorkspace.questionLogs.length === 0 &&
    currentWorkspace.weeklyPlans.length === 0;

  if (isUnpopulated) {
    const seedWorkspace = loadFirefoxSeedWorkspace(options.seedFilePath);
    if (seedWorkspace) {
      await studyDataRepository.replaceWorkspace(user.id, seedWorkspace);
    } else {
      await studyDataRepository.ensureUserSeed(user.id);
    }
  }

  return user.id;
}
