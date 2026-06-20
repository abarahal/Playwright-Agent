import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { config } from "../config.js"
import { ensureDirs } from "../tools/fileSystem.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatesDir = path.join(__dirname, "..", "templates")

function copyIfMissing(src: string, dest: string, label: string): "created" | "skipped" {
  if (fs.existsSync(dest)) {
    console.log(`  ⏭  ${label} — already exists, skipped`)
    return "skipped"
  }
  fs.copyFileSync(src, dest)
  console.log(`  ✅ ${label}`)
  return "created"
}

export function runInitWorkflow(): void {
  console.log("\n🚀 Initializing ai-agent in this project...\n")

  // 1. Create required directories
  ensureDirs()
  console.log("  ✅ tests/fixtures/")
  console.log("  ✅ tests/specs/")
  console.log("  ✅ tests/manual/")
  console.log("")

  // 2. Copy fixture files
  console.log("📋 Copying fixture files:\n")
  const fixturesSrc = path.join(templatesDir, "fixtures")
  const fixtureFiles = fs.readdirSync(fixturesSrc).filter((f) => f.endsWith(".json"))

  let created = 0
  let skipped = 0
  for (const file of fixtureFiles) {
    const result = copyIfMissing(
      path.join(fixturesSrc, file),
      path.join(config.playwright.fixturesDir, file),
      `tests/fixtures/${file}`
    )
    result === "created" ? created++ : skipped++
  }

  console.log("")

  // 3. Copy ai-agent.config.json
  console.log("⚙️  Config:\n")
  copyIfMissing(
    path.join(templatesDir, "ai-agent.config.json"),
    path.join(config.app.root, "ai-agent.config.json"),
    "ai-agent.config.json"
  )

  console.log("")
  console.log(`✨ Done! ${created} file(s) created, ${skipped} skipped.`)
  console.log("")
  console.log("Next steps:")
  console.log("")
  console.log("  1. Add to your .env.local:")
  console.log("       LLM_API_KEY=<your-api-key>")
  console.log("       LLM_BASE_URL=https://openrouter.ai/api/v1")
  console.log("       LLM_MODEL=Qwen/Qwen3.6-35B-A3B")
  console.log("")
  console.log("  2. Run: npx @abarahal/playwright-ai-agent generate")
  console.log("")
}
