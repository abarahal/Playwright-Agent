import fs from "fs"
import path from "path"
import type { ProjectScan } from "./scanner.js"
import type { TestPlan } from "./planner.js"
import { crawlHomepageLinks } from "./homepageCrawler.js"

export interface TestContext {
	fixture: TestPlan["fixture"]
	route: string
	baseUrl: string
	pageRoutes: string[]
	rawContext: string
}

function summarizeRoutes(scan: ProjectScan): string[] {
	const fsRoutes = scan.pageRoutes
		.filter((r) => !r.isDynamic)
		.map((r) => r.route)
	// Prepend i18n locale root routes (e.g. /fr, /en) so the LLM knows they exist
	const localeRoutes = scan.configuredLocales.map((l) => `/${l}`)
	const merged = [...new Set([...localeRoutes, ...fsRoutes])]
	return merged.slice(0, 30)
}

function scanComponentFiles(appRoot: string): string[] {
	const componentDirs = ["components", "widgets", "modules", "src/components", "src/app", "app", "features", "blocks"]
	const extensions = [".jsx", ".tsx", ".js", ".ts"]
	const results: string[] = []

	for (const dir of componentDirs) {
		const dirPath = path.join(appRoot, dir)
		if (!fs.existsSync(dirPath)) continue
		collectFiles(dirPath, appRoot, extensions, results, 0, 5)
	}

	return results
}

function collectFiles(
	dir: string,
	appRoot: string,
	extensions: string[],
	results: string[],
	depth: number,
	maxDepth: number
): void {
	if (depth > maxDepth) return
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			collectFiles(fullPath, appRoot, extensions, results, depth + 1, maxDepth)
		} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
			results.push(path.relative(appRoot, fullPath))
		}
	}
}

function scanExistingTestIds(appRoot: string): Set<string> {
	const testIds = new Set<string>()
	const dirs = ["components", "widgets", "modules", "pages"]
	const extensions = [".jsx", ".tsx", ".js", ".ts"]
	const testIdPattern = /data-testid=["']([^"']+)["']/g

	function scanDir(dir: string) {
		const dirPath = path.join(appRoot, dir)
		if (!fs.existsSync(dirPath)) return
		const files: string[] = []
		collectFiles(dirPath, appRoot, extensions, files, 0, 8)
		for (const relFile of files) {
			try {
				const content = fs.readFileSync(path.join(appRoot, relFile), "utf-8")
				let match
				while ((match = testIdPattern.exec(content)) !== null) {
					testIds.add(match[1])
				}
			} catch {}
		}
	}

	for (const dir of dirs) scanDir(dir)
	return testIds
}

function scanCookieComponents(appRoot: string, componentFiles: string[]): string {
	const cookieFiles = componentFiles.filter((f) => f.toLowerCase().includes("cookie"))
	const snippets: string[] = []
	for (const relFile of cookieFiles.slice(0, 4)) {
		try {
			const content = fs.readFileSync(path.join(appRoot, relFile), "utf-8")
			const lines = content.split("\n").slice(0, 120).join("\n")
			snippets.push(`--- ${relFile} ---\n${lines}`)
		} catch {}
	}
	return snippets.join("\n\n")
}

export function buildUtilContext(appRoot: string): string {
	const existingTestIds = scanExistingTestIds(appRoot)
	const componentFiles = scanComponentFiles(appRoot)
	const cookieSnippets = scanCookieComponents(appRoot, componentFiles)

	const baseUrl = process.env.NEXT_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000"

	let ctx = `APP BASE URL: ${baseUrl}
BASE URL ENV VARS TO CHECK (in order): NEXT_BASE_URL, BASE_URL

EXISTING data-testid IN CODEBASE — use these, do NOT re-patch them:
${Array.from(existingTestIds).sort().join("\n")}

COMPONENT FILES — use ONLY these real paths when suggesting patches:
${componentFiles.join("\n")}`

	if (cookieSnippets) {
		ctx += `\n\nCOOKIE COMPONENT CODE (use to infer testids and cookie structure for cookies.ts):\n${cookieSnippets}`
	}

	return ctx
}

function buildLocaleStatus(
	locale: string | undefined,
	route: string,
	scan: ProjectScan
): string {
	if (!locale) return ""
	const exists =
		scan.configuredLocales.includes(locale) ||
		scan.pageRoutes.some((r) => r.route === route || r.route.startsWith(`/${locale}/`))
	return exists
		? `LOCALE ROUTE STATUS: ${route} → FOUND IN PROJECT`
		: `LOCALE ROUTE STATUS: ${route} → NOT FOUND IN PROJECT (skip all tests)`
}

function buildFormContext(fixture: TestPlan["fixture"], appRoot: string): string {
	const formType = fixture["formType"] as string | undefined
	const componentFile = fixture["componentFile"] as string | undefined
	const widgetId = fixture["widgetId"] as string | undefined
	const formTestIds = fixture["formTestIds"] as Record<string, string> | undefined

	if (!formType) return ""

	const parts: string[] = [
		`\nFORM CONTEXT:`,
		`  formType: ${formType}`,
		widgetId ? `  widgetId: ${widgetId}` : "",
		formTestIds
			? `  knownTestIds: form="${formTestIds.form}", submit="${formTestIds.submit}"`
			: "",
	].filter(Boolean)

	if (componentFile) {
		try {
			const content = fs.readFileSync(path.join(appRoot, componentFile), "utf-8")
			parts.push(`\nFORM COMPONENT SOURCE (${componentFile}):\n${content.slice(0, 3000)}`)
		} catch {}
	}

	return parts.join("\n")
}

function isInternalLinksFixture(fixture: TestPlan["fixture"]): boolean {
	const features = (fixture.features ?? []) as string[]
	return features.includes("internal-links") || fixture.name === "internal-links"
}

export async function buildContext(
	plan: TestPlan,
	scan: ProjectScan,
	baseUrl: string,
	appRoot: string
): Promise<TestContext> {
	const route = plan.fixture.route ?? plan.targetRoute?.route ?? "/"
	const pageRoutes = summarizeRoutes(scan)
	const componentFiles = scanComponentFiles(appRoot)
	const existingTestIds = scanExistingTestIds(appRoot)

	const localeStatus = buildLocaleStatus(plan.fixture.locale as string | undefined, route, scan)
	const formContext = buildFormContext(plan.fixture, appRoot)

	let routesSection: string
	if (isInternalLinksFixture(plan.fixture)) {
		process.stdout.write(" [crawling homepage links...]")
		const homepageLinks = await crawlHomepageLinks(baseUrl)
		if (homepageLinks && homepageLinks.length > 0) {
			routesSection = `HOMEPAGE INTERNAL LINKS (crawled from ${baseUrl} — use these as the routes to test):
${homepageLinks.join("\n")}`
		} else {
			process.stdout.write(" [crawler unavailable, falling back to filesystem routes]")
			routesSection = `AVAILABLE PAGE ROUTES (non-dynamic):
${pageRoutes.join("\n")}`
		}
	} else {
		routesSection = `AVAILABLE PAGE ROUTES (non-dynamic):
${pageRoutes.join("\n")}`
	}

	const rawContext = `
APP BASE URL (env): ${baseUrl}
TARGET ROUTE: ${route}
NOTE: In generated tests, use relative routes only — page.goto("${route}"), NOT page.goto("${baseUrl}${route}")

FIXTURE NAME: ${plan.fixture.name}
FIXTURE DESCRIPTION: ${plan.fixture.description ?? ""}
${localeStatus ? `\n${localeStatus}\n` : ""}
FEATURES TO TEST: ${JSON.stringify(plan.fixture.features ?? [], null, 2)}

TEST CASES REQUESTED:
${JSON.stringify(plan.fixture.testCases ?? [], null, 2)}
${formContext}
${routesSection}

EXISTING data-testid IN CODEBASE — do NOT patch these, they already exist:
${Array.from(existingTestIds).sort().join("\n")}

COMPONENT FILES — use ONLY these real paths when suggesting patches:
${componentFiles.join("\n")}
`.trim()

	return {
		fixture: plan.fixture,
		route,
		baseUrl,
		pageRoutes,
		rawContext,
	}
}
