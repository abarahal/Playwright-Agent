import path from "path"
import { runSandboxJob } from "./sandboxExecutor.js"
import { parseSandboxResults } from "./sandboxResultParser.js"
import { config } from "../config.js"

const specFilter = process.argv[2]

const { exitCode, jsonReportPath, htmlReportPath } = runSandboxJob(specFilter)
const summary = parseSandboxResults(jsonReportPath)

const { passed, failed, skipped, total } = summary
console.log(`\n[sandbox] ${passed} passed, ${failed} failed, ${skipped} skipped / ${total} total`)

if (summary.suites.length > 0) {
  for (const suite of summary.suites) {
    const failedTests = suite.tests.filter((t) => t.status !== "passed" && t.status !== "skipped")
    if (failedTests.length > 0) {
      console.log(`\n  ${suite.file}`)
      for (const t of failedTests) {
        console.log(`    ✗ ${t.title}`)
      }
    }
  }
}

const reportDir = path.join(config.sandbox.monorepoRoot, config.sandbox.appDir, "playwright-report")
console.log(`\n[sandbox] HTML report: ${htmlReportPath}`)
console.log(`[sandbox] Open with:   npx playwright show-report ${reportDir}\n`)

process.exit(exitCode)
