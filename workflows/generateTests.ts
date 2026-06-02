import { scanProject } from "../core/scanner.js"
import { planTests } from "../core/planner.js"
import { buildContext, buildUtilContext } from "../core/contextBuilder.js"
import { readFixtures, readFixture, writeGeneratedTest, writeUtil, applyPatch, ensureDirs } from "../tools/fileSystem.js"
import { generateTest, generateUtil } from "../llm/client.js"
import { UTIL_SPECS_KEYS } from "../llm/prompts.js"
import fs from "fs"
import path from "path"
import { config } from "../config.js"
import type { Fixture } from "../tools/fileSystem.js"

class AlreadyExistsError extends Error {
  constructor(public filePath: string) {
    super(`already exists: ${filePath}`)
    this.name = "AlreadyExistsError"
  }
}

function buildLocaleSkipStub(fixtureName: string, route: string): string {
  const title = fixtureName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  return [
    `import { test } from "../utils/consoleGuard.js"`,
    ``,
    `test.describe("${title}", () => {`,
    `  test.skip(true, "Locale ${route} is not configured in this project")`,
    `})`,
  ].join("\n")
}

export interface GenerateResult {
  generated: string[]
  skipped: string[]
  failed: string[]
}

async function generateMissingUtils(): Promise<void> {
  const utilsDir = config.playwright.utilsDir
  const utilContext = buildUtilContext(config.app.root)

  for (const fileName of UTIL_SPECS_KEYS) {
    const filePath = path.join(utilsDir, fileName)
    if (fs.existsSync(filePath)) continue

    process.stdout.write(`🔧 Generating missing util "${fileName}"...`)
    try {
      const content = await generateUtil(fileName, utilContext)
      writeUtil(fileName, content)
      console.log(` ✅`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(` ❌ ${msg}`)
    }
  }
}

async function generateOne(
  fixture: Fixture,
  scan: ReturnType<typeof scanProject>,
  force = false,
): Promise<string> {
  const { items } = planTests([fixture], scan)
  const planItem = items[0]
  if (!planItem) throw new Error(`No plan item for fixture "${fixture.name}"`)

  const existingPath = path.join(config.playwright.generatedDir, planItem.outputFileName)
  if (!force && fs.existsSync(existingPath)) {
    throw new AlreadyExistsError(existingPath)
  }

  const locale = fixture.locale as string | undefined
  if (locale) {
    const route = fixture.route ?? `/${locale}`
    const localeExists =
      scan.configuredLocales.includes(locale) ||
      scan.pageRoutes.some((r) => r.route === route || r.route.startsWith(`/${locale}/`))
    if (!localeExists) {
      const stub = buildLocaleSkipStub(fixture.name, route)
      const filePath = writeGeneratedTest(planItem.outputFileName, stub, fixture.name)
      console.log(` ⏭  locale ${route} not in project — skip stub written`)
      return filePath
    }
  }

  const baseUrl = process.env.NEXT_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000"
  const ctx = await buildContext(planItem, scan, baseUrl, config.app.root)
  const { testCode, patches } = await generateTest(ctx.rawContext)
  const filePath = writeGeneratedTest(planItem.outputFileName, testCode, fixture.name)

  for (const patch of patches) {
    const applied = applyPatch(patch.file, patch.search, patch.replace)
    if (applied) {
      console.log(`  🩹 Patched ${patch.file}`)
    } else {
      console.log(`  ⚠️  Patch skipped (not found): ${patch.file}`)
    }
  }

  return filePath
}

export async function runGenerateWorkflow(fixtureName?: string, force = false): Promise<GenerateResult> {
  ensureDirs()
  await generateMissingUtils()
  const scan = scanProject()
  const fixtures = fixtureName ? ([readFixture(fixtureName)].filter(Boolean) as Fixture[]) : readFixtures()

  if (fixtures.length === 0) {
    console.warn("⚠️  No fixtures found. Add JSON files to tests/fixtures/ first.")
    return { generated: [], skipped: [], failed: [] }
  }

  const result: GenerateResult = { generated: [], skipped: [], failed: [] }

  for (const fixture of fixtures) {
    process.stdout.write(`🤖 Generating test for "${fixture.name}"...`)
    try {
      const filePath = await generateOne(fixture, scan, force)
      console.log(` ✅ ${filePath}`)
      result.generated.push(filePath)
    } catch (err) {
      if (err instanceof AlreadyExistsError) {
        console.log(` ⏭  already exists, skipping (use --force to regenerate)`)
        result.skipped.push(fixture.name)
        continue
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.log(` ❌ ${msg}`)
      result.failed.push(fixture.name)
    }
  }

  console.log(
    `\n📊 Generate complete: ${result.generated.length} generated, ${result.skipped.length} skipped, ${result.failed.length} failed`
  )
  return result
}

export { generateOne }
