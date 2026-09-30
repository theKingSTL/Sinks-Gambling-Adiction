import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests against a production build with a throwaway database.
 * They use the live ESPN feed, so they need network access.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: {
    command: `rm -f data/e2e.db* && npm run build && npm start -- --port ${PORT}`,
    env: { DATABASE_PATH: "data/e2e.db" },
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
