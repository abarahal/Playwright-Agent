import { chromium } from "@playwright/test"

export interface DetectedForm {
  route: string
  url: string
  hasSubmitButton: boolean
  fieldCount: number
}

const FORM_TESTID = "form"
const SUBMIT_TESTID = "webform-submit-button"
const DYNAMIC_LOAD_TIMEOUT = 12000


async function fetchSitemapUrls(base: string): Promise<string[]> {
  const urls: string[] = []

  async function parseSitemap(url: string) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return
      const xml = await res.text()

      // Nested sitemap index → recurse
      const sitemapLocs = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1].trim()
      )
      for (const loc of sitemapLocs) await parseSitemap(loc)

      // Page URLs
      const pageLocs = [...xml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>/g)].map(
        (m) => m[1].trim()
      )
      urls.push(...pageLocs)
    } catch {
      // silently skip unreachable sitemaps
    }
  }

  await parseSitemap(`${base}/sitemap.xml`)
  return urls
}

function urlToRoute(url: string, base: string): string {
  return url.replace(base, "") || "/"
}

export async function discoverFormRoutes(
  base: string,
  keywords: string[],
  extraRoutes: string[] = []
): Promise<string[]> {
  const sitemapUrls = await fetchSitemapUrls(base)

  const matchedRoutes = sitemapUrls
    .map((url) => urlToRoute(url, base))
    .filter((route) => keywords.some((kw) => route.toLowerCase().includes(kw.toLowerCase())))

  // Merge with explicit extra routes, deduplicate
  return [...new Set([...matchedRoutes, ...extraRoutes])]
}

// ─── Playwright form detection ────────────────────────────────────────────────

async function checkRouteForForm(url: string, route: string): Promise<DetectedForm | null> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 })
    } catch {
      // networkidle timeout — page may still have loaded enough
    }

    // Dismiss cookie banner if present — try common testid patterns across projects
    const cookieSelectors = [
      '[data-testid="cookie-accept-button"]',
      '[data-testid="cookie-accept"]',
      '[data-testid="accept-all-cookies"]',
      '[data-testid="cookies-accept"]',
      '[data-testid="consent-accept"]',
    ]
    for (const selector of cookieSelectors) {
      try {
        const btn = page.locator(selector)
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click()
          break
        }
      } catch {
        // selector not found, try next
      }
    }

    // Wait for form — webforms load via next/dynamic
    const formLocator = page.getByTestId(FORM_TESTID)
    try {
      await formLocator.waitFor({ state: "visible", timeout: DYNAMIC_LOAD_TIMEOUT })
    } catch {
      return null
    }

    const hasSubmitButton = await page.getByTestId(SUBMIT_TESTID).isVisible()
    const fieldCount = await page
      .locator("input:not([type=hidden]), textarea, select")
      .count()

    return { route, url, hasSubmitButton, fieldCount }
  } finally {
    await browser.close()
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function detectFormsAtRuntime(
  candidateRoutes: string[]
): Promise<DetectedForm[]> {
  const baseUrl = (process.env.NEXT_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000")
    .replace(/\/$/, "")

  // Verify server is reachable
  try {
    const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Cannot reach ${baseUrl} — make sure the dev server is running.\n  ${msg}`
    )
  }

  const detected: DetectedForm[] = []

  for (const route of candidateRoutes) {
    const url = `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`
    process.stdout.write(`  🔎 ${route} ...`)

    try {
      const result = await checkRouteForForm(url, route)
      if (result) {
        console.log(` ✅ form found (${result.fieldCount} fields)`)
        detected.push(result)
      } else {
        console.log(` — no form`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(` ⚠️  ${msg}`)
    }
  }

  return detected
}

export { fetchSitemapUrls, urlToRoute }
