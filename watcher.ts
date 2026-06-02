#!/usr/bin/env node
import chokidar from "chokidar"
import path from "path"
import { config } from "./config.js"
import { readFixture } from "./tools/fileSystem.js"
import { scanProject } from "./core/scanner.js"
import { generateOne } from "./workflows/generateTests.js"
import { planTests } from "./core/planner.js"

const fixturesDir = config.playwright.fixturesDir

console.log(`👀 Watching fixtures directory: ${fixturesDir}`)
console.log("   Any change to a fixture file will regenerate its corresponding test.\n")

async function handleChange(filePath: string, event: string): Promise<void> {
  if (!filePath.endsWith(".json")) return

  const fixtureName = path.basename(filePath, ".json")
  console.log(`\n⚡ [${event.toUpperCase()}] ${path.basename(filePath)} — regenerating test...`)

  const fixture = readFixture(fixtureName)
  if (!fixture) {
    console.warn(`  ⚠️  Cannot read fixture "${fixtureName}" — skipping.`)
    return
  }

  const scan = scanProject()
  try {
    const filePath = await generateOne(fixture, scan)
    console.log(`  ✅ Regenerated: ${filePath}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Failed to regenerate: ${msg}`)
  }
}

const watcher = chokidar.watch(fixturesDir, {
  ignoreInitial: true,
  persistent: true,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
})

watcher
  .on("add", (p) => handleChange(p, "add"))
  .on("change", (p) => handleChange(p, "change"))
  .on("unlink", (p) => {
    if (!p.endsWith(".json")) return
    const fixtureName = path.basename(p, ".json")
    console.log(`\n🗑️  Fixture removed: ${fixtureName}`)
    console.log("   Run `node ai-agent/cli.ts generate` to clean up generated tests.")
  })
  .on("error", (err) => console.error("Watcher error:", err))

process.on("SIGINT", () => {
  console.log("\n👋 Watcher stopped.")
  watcher.close()
  process.exit(0)
})
