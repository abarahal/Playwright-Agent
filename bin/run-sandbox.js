#!/usr/bin/env node
// CLI entry point for the sandbox runner — no build step required (tsx handles TypeScript).
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const entry = join(__dirname, "..", "tools", "runSandboxCli.ts")

const _require = createRequire(import.meta.url)
const tsxEsmPath = _require.resolve("tsx/esm")

const result = spawnSync(
  process.execPath,
  ["--import", tsxEsmPath, entry, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
)

process.exit(result.status ?? 0)
