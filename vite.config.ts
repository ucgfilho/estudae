/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function bnbApiServerPlugin(): Plugin {
  let initPromise: Promise<{
    container: ReturnType<typeof import('./server/container').createAppContainer>;
    handleApiRequest: typeof import('./server/app').handleApiRequest;
  }> | null = null;

  const getApi = () => {
    if (!initPromise) {
      const containerPath = './server/container';
      const appPath = './server/app';
      initPromise = Promise.all([
        import(/* @vite-ignore */ containerPath),
        import(/* @vite-ignore */ appPath),
      ]).then(([c, a]) => ({
        container: c.createAppContainer(),
        handleApiRequest: a.handleApiRequest,
      }));
    }
    return initPromise;
  };

  return {
    name: 'bnb-api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { container, handleApiRequest } = await getApi();
        const handled = await handleApiRequest(container, req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { container, handleApiRequest } = await getApi();
        const handled = await handleApiRequest(container, req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), bnbApiServerPlugin()],
  ssr: {
    noExternal: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { TZ: 'America/Bahia' },
  },
});
