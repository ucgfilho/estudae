import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function deriveDeterministicFallbackSecret(): string {
  const seed = [
    'bnb-estudos-jwt-hs256-fallback-v1',
    process.env.DEFAULT_USER_EMAIL ?? '',
    process.env.VERCEL_PROJECT_ID ?? '',
    process.env.VERCEL_GIT_REPO_SLUG ?? 'estudos-bnb',
  ].join(':');
  return createHash('sha256').update(seed).digest('hex');
}

function loadDotEnvIfNeeded(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) return;
    const content = readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env read errors in restricted environments
  }
}

export interface ServerEnv {
  port: number;
  nodeEnv: string;
  dbPath: string;
  mongoUri: string;
  seedFilePath: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresInSeconds: number;
  defaultUserEmail: string;
  defaultUserPassword: string;
  defaultUserName: string;
}

export function getServerEnv(): ServerEnv {
  loadDotEnvIfNeeded();

  const rawSecret = process.env.JWT_SECRET?.trim();
  const jwtSecret =
    rawSecret && rawSecret.length >= 16 ? rawSecret : deriveDeterministicFallbackSecret();

  const defaultDbPath = process.env.VERCEL
    ? '/tmp/bnb_estudos.sqlite'
    : resolve(process.cwd(), 'data', 'bnb_estudos.sqlite');

  return {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    dbPath: process.env.DB_PATH ?? defaultDbPath,
    mongoUri: (process.env.MONGODB_URI ?? '').trim(),
    seedFilePath:
      process.env.SEED_FILE_PATH ??
      resolve(process.cwd(), 'data', 'initial-workspace.seed.json'),
    jwtSecret,
    jwtIssuer: process.env.JWT_ISSUER ?? 'bnb-estudos-api',
    jwtAudience: process.env.JWT_AUDIENCE ?? 'bnb-estudos-client',
    jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN ?? 60 * 60 * 24 * 7), // 7 days
    defaultUserEmail: (process.env.DEFAULT_USER_EMAIL ?? '').trim(),
    defaultUserPassword: process.env.DEFAULT_USER_PASSWORD ?? '',
    defaultUserName: (process.env.DEFAULT_USER_NAME ?? '').trim(),
  };
}
