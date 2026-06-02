#!/usr/bin/env node
// Entry point for the ai-agent CLI when installed as an npm package.
// Resolves tsx from this package's own dependencies and uses it to run
// the TypeScript CLI directly — no build step required.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const cli = join(__dirname, "..", "cli.ts")

// Resolve tsx from this package's node_modules (tsx is a declared dependency)
const _require = createRequire(import.meta.url)
const tsxEsmPath = _require.resolve("tsx/esm")

const result = spawnSync(
  process.execPath,
  ["--import", tsxEsmPath, cli, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
)

process.exit(result.status ?? 0)
