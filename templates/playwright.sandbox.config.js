import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "./tests/reports/html-report", open: "never" }],
    ["json", { outputFile: "./tests/reports/test-results.json" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? "http://host.docker.internal:3000",
    trace: "off",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
})
