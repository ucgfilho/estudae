import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthResponseDto } from './dtos/auth.dto';
import type { AppContainer } from './container';
import { AppError, DtoValidationError, ForbiddenError, NotFoundError, UnauthorizedError } from './errors/AppError';

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

const BROWSER_SESSION_HEADER = 'x-estudae-session';
const SESSION_COOKIE = 'estudae_session';

function sessionCookie(req: IncomingMessage): string | undefined {
  return req.headers.cookie?.split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

function setSessionCookie(container: AppContainer, res: ServerResponse, token: string, maxAge: number): void {
  const secure = container.env.nodeEnv === 'production' || container.env.isVercel;
  const attributes = `HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${attributes}${secure ? '; Secure' : ''}`);
}

function checkBrowserWrite(req: IncomingMessage): void {
  const site = req.headers['sec-fetch-site'];
  if (typeof req.headers[BROWSER_SESSION_HEADER] !== 'string' || (site && site !== 'same-origin')) {
    throw new ForbiddenError('Requisição de origem não permitida.');
  }
}

function sendAuthResponse(
  container: AppContainer, req: IncomingMessage, res: ServerResponse, status: number, data: AuthResponseDto,
): void {
  if (req.headers[BROWSER_SESSION_HEADER] === 'start') {
    setSessionCookie(container, res, data.token, data.expiresIn);
    sendJson(res, status, { expiresIn: data.expiresIn, user: data.user });
    return;
  }
  sendJson(res, status, data);
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

  const method = (req.method ?? 'GET').toUpperCase();

  try {
    await container.seedReady;

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

    if (method === 'POST' && (pathname === '/api/auth/register' || pathname === '/api/auth/login')) {
      if (req.headers[BROWSER_SESSION_HEADER] === 'start') checkBrowserWrite(req);
      await container.authControls.limitOrigin(req);
      const body = await readJsonBody(req);
      if (pathname === '/api/auth/login') await container.authControls.limitAccount(body);
      const result = pathname === '/api/auth/register'
        ? await container.authController.register(body)
        : await container.authController.login(body);
      sendAuthResponse(container, req, res, result.status, result.data);
      return true;
    }

    const cookie = sessionCookie(req);
    const bearer = req.headers.authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1].trim();
    const token = bearer ?? cookie;
    const isLogout = method === 'POST' && pathname === '/api/auth/logout';

    if (cookie && !req.headers.authorization && method !== 'GET') checkBrowserWrite(req);
    if (isLogout) {
      checkBrowserWrite(req);
      if (token) {
        try {
          const payload = container.tokenService.verifyToken(token);
          if (cookie && !req.headers.authorization && payload.sub !== req.headers[BROWSER_SESSION_HEADER]) {
            throw new ForbiddenError('A conta da sessão mudou.');
          }
          await container.authControls.revoke(token, payload.exp * 1000);
        } catch (err) {
          if (!(err instanceof UnauthorizedError)) throw err;
        }
      }
      setSessionCookie(container, res, '', 0);
      sendJson(res, 200, { loggedOut: true });
      return true;
    }

    const user = await container.authGuard.authenticate(
      cookie && !req.headers.authorization ? { authorization: `Bearer ${cookie}` } : req.headers,
    );

    if (method === 'GET' && pathname === '/api/auth/me' && bearer && req.headers[BROWSER_SESSION_HEADER] === 'exchange') {
      checkBrowserWrite(req);
      const payload = container.tokenService.verifyToken(bearer);
      if (payload.sub !== user.id || await container.authControls.isRevoked(bearer)) {
        throw new UnauthorizedError('A sessão antiga não pode ser transferida.');
      }
      setSessionCookie(container, res, bearer, Math.max(0, payload.exp - Math.floor(Date.now() / 1000)));
      sendJson(res, 200, { exchanged: true, user: await container.authService.getProfile(user.id) });
      return true;
    }

    if (token && await container.authControls.isRevoked(token)) {
      throw new UnauthorizedError('Sessão encerrada.');
    }
    if (cookie && !req.headers.authorization && user.id !== req.headers[BROWSER_SESSION_HEADER]) {
      throw new UnauthorizedError('A conta da sessão mudou.');
    }

    if (method === 'GET' && pathname === '/api/auth/me') {
      const result = await container.authController.me(user);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'PATCH' && pathname === '/api/auth/me') {
      const body = await readJsonBody(req);
      const result = await container.authController.updateMe(user, body);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'DELETE' && pathname === '/api/auth/me') {
      const result = await container.authController.deleteAccount(user);
      if (cookie && !req.headers.authorization) setSessionCookie(container, res, '', 0);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (method === 'GET' && pathname === '/api/study-data/contests') {
      const contests = await container.studyDataController.listContestWorkspaces(user);
      sendJson(res, 200, { contests });
      return true;
    }

    // Suporte a múltiplos concursos por usuário via cabeçalho X-Contest-Id (validado contra bypass de RLS)
    const rawContestHeader = req.headers['x-contest-id'];
    const contestIdHeader = (Array.isArray(rawContestHeader) ? rawContestHeader[0] : rawContestHeader)?.trim();
    if (
      contestIdHeader &&
      contestIdHeader !== 'default' &&
      !/^[a-zA-Z0-9_-]{1,64}$/.test(contestIdHeader)
    ) {
      throw new DtoValidationError('Identificador de concurso (X-Contest-Id) inválido.');
    }
    const studyUser =
      contestIdHeader && contestIdHeader !== 'default'
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
