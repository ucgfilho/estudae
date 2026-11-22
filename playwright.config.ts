import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4287';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  outputDir: 'test-results/e2e',
  use: { baseURL, timezoneId: 'America/Bahia', locale: 'pt-BR', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npx --no-install vite build && npx --no-install vite build --ssr server/index.ts --outDir dist-server && node dist-server/index.js',
    url: baseURL + '/health',
    timeout: 120000,
    env: {
      PORT: '4287',
      DB_PATH: ':memory:',
      MONGODB_URI: '',
      VERCEL: '0',
      DEFAULT_USER_EMAIL: 'estudante@example.test',
      DEFAULT_USER_PASSWORD: 'estudos-e2e-123',
      DEFAULT_USER_NAME: 'Estudante E2E',
      SEED_FILE_PATH: '/dev/null',
      JWT_SECRET: 'segredo-descartavel-para-testes-locais',
      DATA_ENCRYPTION_KEY: 'chave-descartavel-para-testes-locais',
    },
  },
});
