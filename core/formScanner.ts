import fs from "fs"
import path from "path"
import { config } from "../config.js"

export type FormType = "webform" | "custom"

export interface FormScanResult {
  componentFile: string
  formType: FormType
  widgetId?: string
  inferredRoutes: string[]
  knownTestIds: {
    form: string
    submit: string
  }
}

const FORM_EXTS = [".jsx", ".tsx", ".js", ".ts"]
const SKIP_DIRS = new Set(["node_modules", ".next", "stories", "tests", "assets", ".git"])

// File names that contain a <form> but are NOT submission forms
const SEARCH_FORM_PATTERNS = /search|overlay|autocomplete|filter|locator|annuaire|forum/i

function collectFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, results)
    else if (FORM_EXTS.some((ext) => entry.name.endsWith(ext))) results.push(full)
  }
  return results
}

function extractWidgetId(content: string): string | undefined {
  // Matches: config = { id: "vactory_contact:contact", ... }
  const match = content.match(/config\s*=\s*\{[^}]*\bid:\s*["']([^"']+)["']/)
  return match?.[1]
}

function classifyWidget(widgetId: string): "webform" | "confirmation" | "other" {
  if (widgetId.includes("webform_confirmation")) return "confirmation"
  if (widgetId.includes("webform") || widgetId.includes("contact")) return "webform"
  return "other"
}

function inferRoutesFromWidgetId(widgetId: string, locales: string[]): string[] {
  // "vactory_contact:contact" → slug = "contact"
  const parts = widgetId.split(":")
  const slug = parts[parts.length - 1].replace(/_/g, "-")
  const routes: string[] = []
  for (const locale of locales) {
    routes.push(`/${locale}/${slug}`)
  }
  routes.push(`/${slug}`)
  return routes
}

function readProjectLocales(appRoot: string): string[] {
  try {
    const configPath = path.join(appRoot, "project.config.js")
    if (!fs.existsSync(configPath)) return ["fr", "en"]
    const raw = fs.readFileSync(configPath, "utf-8")
    const match = raw.match(/enabled:\s*\[([^\]]+)\]/)
    if (!match) return ["fr", "en"]
    const locales = match[1].match(/["']([^"']+)["']/g)?.map((s) => s.replace(/["']/g, ""))
    return locales && locales.length > 0 ? locales : ["fr", "en"]
  } catch {
    return ["fr", "en"]
  }
}

function isCustomForm(content: string): boolean {
  return /<form[\s>]/i.test(content) && /onSubmit|handleSubmit/.test(content)
}

export function scanForms(): FormScanResult[] {
  const appRoot = config.app.root
  const locales = readProjectLocales(appRoot)

  const componentDirs = ["components", "widgets", "modules"].map((d) => path.join(appRoot, d))
  const allFiles = componentDirs.flatMap((d) => collectFiles(d))

  const results: FormScanResult[] = []
  const seenKeys = new Set<string>()

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8")
      const relPath = path.relative(appRoot, filePath)
      const widgetId = extractWidgetId(content)

      if (widgetId) {
        const kind = classifyWidget(widgetId)
        if (kind !== "webform") continue

        // Deduplicate by widget ID
        if (seenKeys.has(widgetId)) continue
        seenKeys.add(widgetId)

        results.push({
          componentFile: relPath,
          formType: "webform",
          widgetId,
          inferredRoutes: inferRoutesFromWidgetId(widgetId, locales),
          knownTestIds: { form: "form", submit: "webform-submit-button" },
        })
      } else if (isCustomForm(content)) {
        // Skip search bars, filters, overlays — they have <form> but are not submission forms
        if (SEARCH_FORM_PATTERNS.test(relPath)) continue
        if (seenKeys.has(relPath)) continue
        seenKeys.add(relPath)

        results.push({
          componentFile: relPath,
          formType: "custom",
          inferredRoutes: [],
          knownTestIds: { form: "form", submit: "submit-button" },
        })
      }
    } catch {
      // skip unreadable files
    }
  }

  return results
}
