import { defineConfig, devices } from '@playwright/test';
import { baseURL } from './env';

// Build first: `npm --prefix src/web run build && dotnet build src/Copernica`.
// E2E_PORT runs the test server on another port (default 8080); E2E_ARTIFACTS points
// `dotnet run` at an `--artifacts-path` build (e.g. when bin/ is in use by another instance).

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.mjs',
    url: `${baseURL}/health/ready`,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 120_000,
    stdout: process.env.E2E_SERVER_LOG ? 'pipe' : 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
