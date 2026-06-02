import { scanForms } from "../core/formScanner.js"
import { discoverFormRoutes, detectFormsAtRuntime, type DetectedForm } from "../core/formDetector.js"
import { scanProject } from "../core/scanner.js"
import { ensureDirs, writeFixture, readFixture } from "../tools/fileSystem.js"
import { generateOne } from "./generateTests.js"
import { config } from "../config.js"
import type { Fixture } from "../tools/fileSystem.js"

function buildFormFixture(detected: DetectedForm): Fixture {
  const locale = detected.route.split("/")[1] ?? "default"
  const slug = detected.route.replace(/^\//, "").replace(/\//g, "-") || "form"
  const name = `form-${slug}`

  return {
    name,
    route: detected.route,
    description: `Webform functional tests — confirmed form at ${detected.route}`,
    priority: "high",
    features: ["form", "form-submission", "form-validation"],
    formType: "webform",
    formTestIds: { form: "form", submit: "webform-submit-button" },
    locale: /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : undefined,
    testCases: [
      {
        name: "form renders after navigation",
        steps: [
          `Navigate to ${detected.route}`,
          "Accept cookies",
          `Wait for the webform to render (next/dynamic — timeout: 15000): expect(page.getByTestId("form")).toBeVisible({ timeout: 15000 })`,
        ],
        assertions: [
          `data-testid="form" is visible`,
          detected.hasSubmitButton ? `data-testid="webform-submit-button" is visible` : "submit button is visible",
        ],
      },
      {
        name: "empty submission triggers validation errors",
        steps: [
          `Navigate to ${detected.route}`,
          "Accept cookies",
          `Wait for form: expect(page.getByTestId("form")).toBeVisible({ timeout: 15000 })`,
          `Click submit without filling fields: page.getByTestId("webform-submit-button").click()`,
        ],
        assertions: [
          "At least one required field shows error: expect(page.locator('[aria-invalid=\"true\"]').first()).toBeVisible()",
          "The form element remains visible (not submitted)",
        ],
      },
      {
        name: "successful submission shows confirmation",
        steps: [
          `Navigate to ${detected.route}`,
          "Accept cookies",
          `Wait for form: expect(page.getByTestId("form")).toBeVisible({ timeout: 15000 })`,
          `Add at top of test body: test.skip(!process.env.ALLOW_FORM_SUBMIT, "Set ALLOW_FORM_SUBMIT=1 to enable")`,
          `Fill the ${detected.fieldCount} visible fields using getByLabel() or getByRole('textbox') — use testData values`,
          `Click submit: page.getByTestId("webform-submit-button").click()`,
        ],
        assertions: [
          "Inline confirmation appears: expect(page.locator('.bg-success-100')).toBeVisible({ timeout: 15000 })",
          "OR redirect with query param: expect(page).toHaveURL(/isSubmitted=true/, { timeout: 15000 })",
        ],
        testData: {
          name: "Playwright Test",
          email: "playwright-test@example.com",
          message: "This is an automated test submission — please ignore.",
          phone: "+212600000000",
        },
      },
    ],
  }
}

export interface FormTestsResult {
  generated: string[]
  skipped: string[]
  failed: string[]
}

export async function runFormTestsWorkflow(force = false, extraRoutes: string[] = []): Promise<FormTestsResult> {
  ensureDirs()

  // Step 1: static scan → widget-inferred routes
  const formComponents = scanForms()
  const staticRoutes = formComponents.flatMap((f) => f.inferredRoutes)

  // Step 2: sitemap discovery → routes matching keywords (e.g. "contact", "reclamation")
  const baseUrl = (process.env.NEXT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")
  console.log(`\n🗺  Scanning sitemap for form keywords: [${config.agent.formKeywords.join(", ")}]...`)
  const sitemapRoutes = await discoverFormRoutes(baseUrl, config.agent.formKeywords, extraRoutes)

  const candidateRoutes = [...new Set([...staticRoutes, ...sitemapRoutes, ...config.agent.formRoutes])]

  if (candidateRoutes.length === 0) {
    console.log("⚠️  No candidate routes found — add keywords to ai-agent.config.json or use --url.")
    return { generated: [], skipped: [], failed: [] }
  }

  console.log(`\n🔍 Candidates: ${candidateRoutes.length} route(s)`)
  console.log(candidateRoutes.map((r) => `  • ${r}`).join("\n"))
  console.log(`\n🌐 Runtime detection (Playwright)...`)

  // Step 2: runtime detection → only confirmed functional forms
  let detected: DetectedForm[]
  try {
    detected = await detectFormsAtRuntime(candidateRoutes)
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  if (detected.length === 0) {
    console.log("\n⚠️  No functional forms found at the candidate routes.")
    console.log("    Make sure the dev server is running and the pages have webform content.")
    return { generated: [], skipped: [], failed: [] }
  }

  console.log(`\n✅ ${detected.length} functional form(s) confirmed\n`)

  const scan = scanProject()
  const result: FormTestsResult = { generated: [], skipped: [], failed: [] }

  for (const form of detected) {
    const fixtureName = `form-${form.route.replace(/^\//, "").replace(/\//g, "-")}`

    // Persist fixture so ai-agent generate/fix can reference it later
    let fixture = readFixture(fixtureName)
    if (!fixture || force) {
      fixture = buildFormFixture(form)
      fixture.name = fixtureName
      const fixturePath = writeFixture(fixture)
      console.log(`📝 Fixture: ${fixturePath}`)
    } else {
      console.log(`📋 Fixture "${fixtureName}" already exists — reusing`)
    }

    process.stdout.write(`🤖 Generating test for "${fixtureName}"...`)
    try {
      const filePath = await generateOne(fixture, scan, force)
      console.log(` ✅ ${filePath}`)
      result.generated.push(filePath)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("already exists:")) {
        console.log(` ⏭  already exists (use --force to regenerate)`)
        result.skipped.push(fixtureName)
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(` ❌ ${msg}`)
        result.failed.push(fixtureName)
      }
    }
  }

  console.log(
    `\n📊 Forms complete: ${result.generated.length} generated, ${result.skipped.length} skipped, ${result.failed.length} failed`
  )
  return result
}
