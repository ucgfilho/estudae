import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppContainer } from './container';
import { AppError, DtoValidationError, NotFoundError } from './errors/AppError';

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
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
      const body = await readJsonBody(req);
      const result = await container.authController.register(body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
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

    if (method === 'GET' && pathname === '/api/study-data') {
      const result = await container.studyDataController.getWorkspace(user);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/study-data/batch') {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.executeBatch(user, body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'PUT' && pathname === '/api/study-data/workspace') {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.replaceWorkspace(user, body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'POST' && pathname === '/api/study-data/reset') {
      const result = await container.studyDataController.resetWorkspace(user);
      sendJson(res, result.status, result.data);
      return true;
    }

    const tableMatch = /^\/api\/study-data\/table\/([a-zA-Z0-9_-]+)$/.exec(pathname);
    if (method === 'POST' && tableMatch) {
      const body = await readJsonBody(req);
      const result = await container.studyDataController.mutateTable(user, tableMatch[1], body);
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
