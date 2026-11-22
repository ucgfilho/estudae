import { configDefaults } from 'vitest/config';
import { defineConfig, type Plugin, type PreviewServer } from 'vite';
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

  const configure = ({ middlewares }: Pick<PreviewServer, 'middlewares'>) => {
    middlewares.use((req, res, next) => {
      const pathname = req.url?.split('?')[0];
      if (pathname !== '/api' && !pathname?.startsWith('/api/')) {
        next();
        return;
      }
      void getApi()
        .then(({ container, handleApiRequest }) => handleApiRequest(container, req, res))
        .then((handled) => { if (!handled) next(); })
        .catch(next);
    });
  };

  return {
    name: 'bnb-api-server',
    configureServer: configure,
    configurePreviewServer: configure,
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
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { TZ: 'America/Bahia' },
  },
});
