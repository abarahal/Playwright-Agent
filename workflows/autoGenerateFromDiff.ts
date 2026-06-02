import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { config } from "../config.js"
import { generateFixture } from "../llm/client.js"
import { writeFixture } from "../tools/fileSystem.js"
import { runGenerateWorkflow, type GenerateResult } from "./generateTests.js"
import { scanProject } from "../core/scanner.js"

const FEATURE_DIRS = ["components", "widgets", "modules", "pages", "app", "src/pages", "src/app"]
const FEATURE_EXTENSIONS = [".jsx", ".tsx", ".js", ".ts"]
const SKIP_PATTERNS = [
  /\.(test|spec)\./,
  /\.config\./,
  /\.stories\./,
  /\/utils\//,
  /\/hooks\//,
  /\/types\//,
  /\/constants\//,
  /\/context\//,
  /\/ai-agent\//,
]

function getAddedFiles(): string[] {
  try {
    const output = execSync("git diff HEAD~1 HEAD --name-only --diff-filter=A", {
      encoding: "utf-8",
      cwd: config.app.root,
    })
    return output.trim().split("\n").filter(Boolean)
  } catch {
    return []
  }
}

function isFeatureFile(filePath: string): boolean {
  if (!FEATURE_DIRS.some((dir) => filePath.startsWith(dir + "/"))) return false
  if (!FEATURE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return false
  if (SKIP_PATTERNS.some((p) => p.test(filePath))) return false
  return true
}

export async function runAutoGenerateWorkflow(): Promise<GenerateResult> {
  const addedFiles = getAddedFiles()
  const featureFiles = addedFiles.filter(isFeatureFile)

  if (featureFiles.length === 0) {
    console.log("📭 No new feature files detected in this commit.")
    return { generated: [], skipped: [], failed: [] }
  }

  console.log(`🔍 Detected ${featureFiles.length} new feature file(s):`)
  featureFiles.forEach((f) => console.log(`  - ${f}`))

  const scan = scanProject()
  const availableRoutes = scan.pageRoutes.map((r) => r.route)
  const generatedFixtures: string[] = []

  for (const relFromRepo of featureFiles) {
    const absPath = path.resolve(config.app.root, relFromRepo)
    if (!fs.existsSync(absPath)) continue

    const content = fs.readFileSync(absPath, "utf-8")

    process.stdout.write(`📋 Generating fixture for "${relFromRepo}"...`)

    try {
      const fixture = await generateFixture(relFromRepo, content, availableRoutes)

      const existing = path.join(config.playwright.fixturesDir, `${fixture.name}.json`)
      if (fs.existsSync(existing)) {
        console.log(` ⏭️  fixture "${fixture.name}" already exists, skipping`)
        continue
      }

      const fixturePath = writeFixture(fixture)
      console.log(` ✅ ${fixturePath}`)
      generatedFixtures.push(fixture.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(` ❌ ${msg}`)
    }
  }

  if (generatedFixtures.length === 0) {
    return { generated: [], skipped: [], failed: [] }
  }

  console.log(`\n🧪 Generating tests for ${generatedFixtures.length} new fixture(s)...`)

  const allResults: GenerateResult = { generated: [], skipped: [], failed: [] }
  for (const fixtureName of generatedFixtures) {
    const result = await runGenerateWorkflow(fixtureName)
    allResults.generated.push(...result.generated)
    allResults.skipped.push(...result.skipped)
    allResults.failed.push(...result.failed)
  }

  return allResults
}
