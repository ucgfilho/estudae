import { isIP } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  dataEncryptionKey: string;
  isVercel: boolean;
  trustedProxyIps: string[];
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresInSeconds: number;
  defaultUserEmail: string;
  defaultUserPassword: string;
  defaultUserName: string;
}

export function getServerEnv(): ServerEnv {
  loadDotEnvIfNeeded();

  return {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    dbPath: process.env.DB_PATH ?? resolve(process.cwd(), 'data', 'bnb_estudos.sqlite'),
    mongoUri: (process.env.MONGODB_URI ?? '').trim(),
    seedFilePath:
      process.env.SEED_FILE_PATH?.trim() ||
      resolve(process.cwd(), 'data', 'initial-workspace.seed.json'),
    jwtSecret: process.env.JWT_SECRET?.trim() ?? '',
    dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY?.trim() ?? process.env.JWT_SECRET?.trim() ?? '',
    isVercel: process.env.VERCEL === '1',
    trustedProxyIps: (process.env.TRUSTED_PROXY_IPS ?? '').split(',').map((ip) => ip.trim()).filter(Boolean),
    jwtIssuer: process.env.JWT_ISSUER ?? 'bnb-estudos-api',
    jwtAudience: process.env.JWT_AUDIENCE ?? 'bnb-estudos-client',
    jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN ?? 86_400),
    defaultUserEmail: (process.env.DEFAULT_USER_EMAIL ?? '').trim(),
    defaultUserPassword: process.env.DEFAULT_USER_PASSWORD ?? '',
    defaultUserName: (process.env.DEFAULT_USER_NAME ?? '').trim(),
  };
}

export function validateServerEnv(env: ServerEnv): void {
  if (Buffer.byteLength(env.jwtSecret) < 32) {
    throw new Error('JWT_SECRET deve conter um segredo aleatório de pelo menos 32 bytes.');
  }
  if (Buffer.byteLength(env.dataEncryptionKey) < 32) {
    throw new Error('DATA_ENCRYPTION_KEY deve conter pelo menos 32 bytes.');
  }
  if (!Number.isSafeInteger(env.jwtExpiresInSeconds) || env.jwtExpiresInSeconds < 1 || env.jwtExpiresInSeconds > 604_800) {
    throw new Error('JWT_EXPIRES_IN deve estar entre 1 e 604800 segundos.');
  }
  if (env.isVercel && !env.mongoUri) {
    throw new Error('MONGODB_URI é obrigatória no Vercel para persistir contas e controles de sessão.');
  }
  if (env.trustedProxyIps.some((ip) => !isIP(ip))) {
    throw new Error('TRUSTED_PROXY_IPS aceita apenas endereços IP separados por vírgulas.');
  }
}
