import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAppContainer, type AppContainer } from './container';
import { handleApiRequest } from './app';

let container: AppContainer | null = null;

function getContainer(): AppContainer {
  if (!container) {
    container = createAppContainer();
  }
  return container;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  const handled = await handleApiRequest(getContainer(), req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Endpoint não encontrado.', code: 'NOT_FOUND' }));
  }
}
