import { defineConfig, devices } from '@playwright/test';

// Build first: `npm --prefix src/web run build && dotnet build src/Copernica`.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:8080/health/ready',
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
