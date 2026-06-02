import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test"

interface SandboxConfigOptions {
  testDir?: string
  timeout?: number
  actionTimeout?: number
  navigationTimeout?: number
  reportsDir?: string
  extraConfig?: Partial<PlaywrightTestConfig>
}

export function defineSandboxConfig(opts: SandboxConfigOptions = {}): PlaywrightTestConfig {
  const {
    testDir = "./tests",
    timeout = 120_000,
    actionTimeout = 15_000,
    navigationTimeout = 20_000,
    reportsDir = "./tests/reports",
    extraConfig = {},
  } = opts

  return defineConfig({
    testDir,
    timeout,
    fullyParallel: false,
    forbidOnly: true,
    retries: 1,
    workers: 1,
    reporter: [
      ["html", { outputFolder: `${reportsDir}/html-report`, open: "never" }],
      ["json", { outputFile: `${reportsDir}/test-results.json` }],
      ["list"],
    ],
    use: {
      baseURL: process.env.BASE_URL ?? "http://host.docker.internal:3000",
      trace: "off",
      screenshot: "only-on-failure",
      actionTimeout,
      navigationTimeout,
    },
    projects: [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    ...extraConfig,
  })
}
