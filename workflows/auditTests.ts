import fs from "fs"
import path from "path"
import { config } from "../config.js"
import { auditTests } from "../llm/client.js"

export interface AuditResult {
  report: string
  filesScanned: number
  errorCount: number
  warningCount: number
}

// ─── CONTEXT BUILDER ──────────────────────────────────────────────────────────

function addFile(sections: string[], label: string, filePath: string, maxLines = 200): void {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.split("\n")
  const body = lines.length > maxLines
    ? lines.slice(0, maxLines).join("\n") + `\n... (truncated at ${maxLines} lines)`
    : content
  sections.push(`=== ${label} ===\n${body}`)
}

function buildFilesContext(): { context: string; fileCount: number } {
  const sections: string[] = []

  // Always include config + gitignore + utils
  addFile(sections, "CONFIG: playwright.config.ts", config.playwright.configPath, 150)
  addFile(sections, "GITIGNORE: .gitignore", path.join(config.app.root, ".gitignore"), 100)

  // Prefer .ts over .js to avoid duplicate content if both exist
  const utilNames = ["consoleGuard", "navigation", "constants", "cookies", "filter-tester", "pagination-tester", "overlay-handler"]
  for (const name of utilNames) {
    const tsPath = path.join(config.playwright.utilsDir, `${name}.ts`)
    const jsPath = path.join(config.playwright.utilsDir, `${name}.js`)
    const [filePath, ext] = fs.existsSync(tsPath) ? [tsPath, "ts"] : fs.existsSync(jsPath) ? [jsPath, "js"] : [null, null]
    if (filePath) addFile(sections, `UTIL: tests/utils/${name}.${ext}`, filePath, 100)
  }

  // Spec files — recursive scan of tests/ directory
  const testsDir = path.join(config.app.root, "tests")
  let specCount = 0

  function scanSpecs(dir: string): void {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanSpecs(fullPath)
      } else if (entry.name.endsWith(".spec.ts") || entry.name.endsWith(".spec.js")) {
        const rel = path.relative(config.app.root, fullPath)
        addFile(sections, `SPEC: ${rel}`, fullPath, 250)
        specCount++
      }
    }
  }

  scanSpecs(testsDir)

  return { context: sections.join("\n\n"), fileCount: specCount }
}

// ─── SUMMARY PARSER ───────────────────────────────────────────────────────────

function parseSummary(report: string): { errors: number; warnings: number } {
  const match = report.match(/SUMMARY:\s*(\d+)\s*error[^,]*,\s*(\d+)\s*warning/i)
  if (match) return { errors: parseInt(match[1], 10), warnings: parseInt(match[2], 10) }

  // Fallback: count severity lines
  const errors = (report.match(/Severity:\s*ERROR/gi) ?? []).length
  const warnings = (report.match(/Severity:\s*WARNING/gi) ?? []).length
  return { errors, warnings }
}

// ─── MAIN WORKFLOW ─────────────────────────────────────────────────────────────

export async function runAuditWorkflow(scope: "all" | "specs" | "manual" = "all"): Promise<AuditResult> {
  console.log(`\n🔍 Playwright Test Suite Audit — scope: ${scope}\n`)

  console.log("📂 Collecting files...")
  const { context, fileCount } = buildFilesContext()

  console.log(`🤖 Sending ${fileCount} spec file(s) + config + utils to Claude for analysis...`)
  process.stdout.write("   Waiting for audit report")

  const ticker = setInterval(() => process.stdout.write("."), 2000)
  let report: string
  try {
    report = await auditTests(context)
  } finally {
    clearInterval(ticker)
    process.stdout.write("\n\n")
  }

  const { errors, warnings } = parseSummary(report)
  const divider = "═".repeat(72)

  console.log(divider)
  console.log(report)
  console.log(divider)

  return { report, filesScanned: fileCount, errorCount: errors, warningCount: warnings }
}
