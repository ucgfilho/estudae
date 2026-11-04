import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppContainer } from './container';
import { AppError, DtoValidationError, NotFoundError, TooManyRequestsError } from './errors/AppError';

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 25;
const authRateMap = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(req: IncomingMessage): void {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() ||
    req.socket?.remoteAddress ||
    'local';
  const now = Date.now();
  const entry = authRateMap.get(rawIp);
  if (!entry || now > entry.resetAt) {
    authRateMap.set(rawIp, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    throw new TooManyRequestsError();
  }
}

export function resetAuthRateLimiter(): void {
  authRateMap.clear();
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  setSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new DtoValidationError('Payload excede o limite máximo de 10 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new DtoValidationError('Corpo da requisição não é um JSON válido.'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Manipulador HTTP das rotas `/api/*` desacoplado de servidor (funciona em Node HTTP, Vite e Testes).
 */
export async function handleApiRequest(
  container: AppContainer,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const rawUrl = req.url ?? '/';
  const pathname = rawUrl.split('?')[0];

  if (!pathname.startsWith('/api/') && pathname !== '/api') {
    return false;
  }

  await container.seedReady;

  const method = (req.method ?? 'GET').toUpperCase();

  try {
    if (method === 'OPTIONS') {
      setSecurityHeaders(res);
      res.statusCode = 204;
      res.end();
      return true;
    }

    if (method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
      return true;
    }

    // Rotas públicas de Autenticação
    if (method === 'POST' && pathname === '/api/auth/register') {
      checkAuthRateLimit(req);
      const body = await readJsonBody(req);
      const result = await container.authController.register(body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      checkAuthRateLimit(req);
      const body = await readJsonBody(req);
      const result = await container.authController.login(body);
      sendJson(res, result.status, result.data);
      return true;
    }

    // Todas as rotas abaixo exigem autenticação JWT Bearer
    const user = await container.authGuard.authenticate(req.headers);

    if (method === 'GET' && pathname === '/api/auth/me') {
      const result = await container.authController.me(user);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/auth/me') {
      const result = await container.authController.deleteAccount(user);
      sendJson(res, result.status, result.data);
      return true;
    }

    // Suporte a múltiplos concursos por usuário via cabeçalho X-Contest-Id
    const rawContestHeader = req.headers['x-contest-id'];
    const contestIdHeader = (Array.isArray(rawContestHeader) ? rawContestHeader[0] : rawContestHeader)?.trim();
    const studyUser =
      contestIdHeader && contestIdHeader !== 'default' && /^[a-zA-Z0-9_-]{1,64}$/.test(contestIdHeader)
        ? { ...user, id: `${user.id}::contest::${contestIdHeader}` }
        : user;

    if (method === 'GET' && pathname === '/api/study-data') {
      const result = await container.studyDataController.getWorkspace(studyUser);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/study-data/batch') {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.executeBatch(studyUser, body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'PUT' && pathname === '/api/study-data/workspace') {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.replaceWorkspace(studyUser, body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/study-data/reset') {
      const result = await container.studyDataController.resetWorkspace(studyUser);
      sendJson(res, result.status, result.data);
      return true;
    }

    const tableMatch = /^\/api\/study-data\/table\/([a-zA-Z0-9_-]+)$/.exec(pathname);
    if (method === 'POST' && tableMatch) {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.mutateTable(studyUser, tableMatch[1], body);
      sendJson(res, result.status, result.data);
      return true;
    }

    throw new NotFoundError(`Endpoint não encontrado: ${method} ${pathname}`);
  } catch (err) {
    if (err instanceof AppError) {
      sendJson(res, err.statusCode, {
        error: err.message,
        code: err.code,
        details: err.details,
      });
      return true;
    }
    console.error('[API Error]', err);
    sendJson(res, 500, {
      error: 'Erro interno no servidor.',
      code: 'INTERNAL_SERVER_ERROR',
    });
    return true;
  }
}
