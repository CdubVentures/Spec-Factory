import { defineConfig } from 'playwright/test';

// WHY: The API server at port 8788 serves both the REST API and the
// built GUI (static files). No separate Vite dev server is needed.
const API_BASE = 'http://localhost:8788';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: API_BASE,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});

export { API_BASE };
