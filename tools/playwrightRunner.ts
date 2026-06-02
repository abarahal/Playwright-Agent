import { execSync, spawnSync } from "child_process"
import path from "path"
import { config } from "../config.js"

export interface TestResult {
  passed: number
  failed: number
  skipped: number
  failures: TestFailure[]
  rawOutput: string
  exitCode: number
  duration: number
}

export interface TestFailure {
  file: string
  testName: string
  errorMessage: string
  errorStack: string
}

function parseFailures(output: string): TestFailure[] {
  const failures: TestFailure[] = []

  // Playwright outputs errors in blocks starting with "●"
  const blocks = output.split(/\n\s*●\s+/).slice(1)
  for (const block of blocks) {
    const lines = block.split("\n")
    const testName = lines[0]?.trim() ?? "unknown test"

    // Find which file the test is in
    const fileMatch = block.match(/(?:at |in )([^\s(]+\.spec\.[jt]s)/m)
    const file = fileMatch?.[1] ?? "unknown"

    // Extract error message (first Error: line)
    const errorMatch = block.match(/Error:\s+(.+)/m)
    const errorMessage = errorMatch?.[1]?.trim() ?? block.slice(0, 200)

    failures.push({
      file: path.basename(file),
      testName,
      errorMessage,
      errorStack: block.trim(),
    })
  }

  return failures
}

function parseSummary(output: string): Pick<TestResult, "passed" | "failed" | "skipped"> {
  const summaryMatch = output.match(
    /(\d+)\s+passed.*?(\d+)?\s*failed.*?(\d+)?\s*skipped/i
  ) ?? output.match(/(\d+)\s+passed/i)

  const passedMatch = output.match(/(\d+)\s+passed/i)
  const failedMatch = output.match(/(\d+)\s+failed/i)
  const skippedMatch = output.match(/(\d+)\s+skipped/i)

  return {
    passed: parseInt(passedMatch?.[1] ?? "0", 10),
    failed: parseInt(failedMatch?.[1] ?? "0", 10),
    skipped: parseInt(skippedMatch?.[1] ?? "0", 10),
  }
}

export function runTests(filter?: string): TestResult {
  const start = Date.now()
  const appRoot = config.app.root
  const configArg = `--config=${path.relative(appRoot, config.playwright.configPath)}`

  const args = ["playwright", "test", configArg, "--reporter=line"]
  if (filter) args.push(filter)

  const result = spawnSync("npx", args, {
    cwd: appRoot,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 120_000,
  })

  const rawOutput = [result.stdout, result.stderr].filter(Boolean).join("\n")
  const duration = Date.now() - start
  const summary = parseSummary(rawOutput)
  const failures = result.status !== 0 ? parseFailures(rawOutput) : []

  return {
    ...summary,
    failures,
    rawOutput,
    exitCode: result.status ?? 1,
    duration,
  }
}

export function runGeneratedTests(): TestResult {
  return runTests(path.relative(config.app.root, config.playwright.generatedDir))
}

export function runSingleTest(filePath: string): TestResult {
  return runTests(path.relative(config.app.root, filePath))
}
