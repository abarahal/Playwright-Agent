#!/usr/bin/env node
import { program } from "commander"
import { runInitWorkflow } from "./workflows/init.js"
import { runInitSandboxWorkflow } from "./workflows/initSandbox.js"
import { runScanWorkflow } from "./workflows/scanProject.js"
import { runGenerateWorkflow } from "./workflows/generateTests.js"
import { runFixWorkflow } from "./workflows/fixTests.js"

import { runFormTestsWorkflow } from "./workflows/generateFormTests.js"
import { runAuditWorkflow } from "./workflows/auditTests.js"

program
  .name("ai-agent")
  .description("AI Testing Agent — generates, runs, and fixes Playwright tests using Claude")
  .version("1.0.0")

program
  .command("init")
  .description("Scaffold fixtures/, generated/, manual/ directories and example fixture files")
  .action(() => {
    try {
      runInitWorkflow()
    } catch (err) {
      console.error("❌ Init failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("init-sandbox")
  .description("Scaffold playwright.sandbox.config.js, sandbox config, package.json script, and Dockerfile")
  .action(() => {
    try {
      runInitSandboxWorkflow()
    } catch (err) {
      console.error("❌ Init sandbox failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("scan")
  .description("Scan the Next.js project and report all routes")
  .action(async () => {
    try {
      runScanWorkflow()
    } catch (err) {
      console.error("❌ Scan failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("generate")
  .description("Generate Playwright tests from fixtures using Claude")
  .option("-f, --fixture <name>", "Generate only for a specific fixture (omit .json)")
  .option("--force", "Overwrite already-generated tests instead of skipping them")
  .action(async (opts: { fixture?: string; force?: boolean }) => {
    try {
      const result = await runGenerateWorkflow(opts.fixture, opts.force ?? false)
      if (result.failed.length > 0) process.exit(1)
    } catch (err) {
      console.error("❌ Generate failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("fix")
  .description("Run generated tests and auto-fix failures using Claude (max 3 iterations)")
  .action(async () => {
    try {
      await runFixWorkflow()
    } catch (err) {
      console.error("❌ Fix failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("auto")
  .description("[DISABLED] Auto-generate from diff — temporarily disabled")
  .action(async () => {
    console.warn("⚠️  The 'auto' command is temporarily disabled.")
    process.exit(0)
  })

program
  .command("forms")
  .description("Detect form components, generate fixtures, and create Playwright tests for them")
  .option("--force", "Overwrite existing fixtures and tests")
  .option("--url <routes...>", "Additional routes to probe for forms (e.g. --url /fr/reclamation /en/contact)")
  .action(async (opts: { force?: boolean; url?: string[] }) => {
    try {
      const result = await runFormTestsWorkflow(opts.force ?? false, opts.url ?? [])
      if (result.failed.length > 0) process.exit(1)
    } catch (err) {
      console.error("❌ Forms workflow failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program
  .command("audit")
  .description("Audit all Playwright tests for bad practices, config issues, and structural problems")
  .option("--scope <scope>", "Scope to scan: all | specs | manual (default: all)", "all")
  .action(async (opts: { scope?: string }) => {
    const scope = (opts.scope ?? "all") as "all" | "specs" | "manual"
    if (!["all", "specs", "manual"].includes(scope)) {
      console.error(`❌ Invalid scope "${scope}". Use: all | specs | manual`)
      process.exit(1)
    }
    try {
      const result = await runAuditWorkflow(scope)
      if (result.errorCount > 0) process.exit(1)
    } catch (err) {
      console.error("❌ Audit failed:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err)
  process.exit(1)
})
