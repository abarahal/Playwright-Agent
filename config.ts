import dotenv from "dotenv"
import fs from "fs"
import path from "path"

// When installed as a package, process.cwd() is the target project root
const appRoot = process.cwd()

dotenv.config({ path: path.join(appRoot, ".env.local") })
dotenv.config({ path: path.join(appRoot, ".env") })

const testsDir = path.join(appRoot, "tests")

function detectPagesDir(): string {
  const candidates = [
    path.join(appRoot, "src", "pages"),
    path.join(appRoot, "pages"),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return path.join(appRoot, "pages")
}

function readAgentConfig(): {
  forms?: { routes?: string[]; keywords?: string[] }
  sandbox?: {
    baseUrl?: string
    playwrightConfig?: string
    reportsDir?: string
    dockerImage?: string
    timeout?: number
  }
} {
  const configPath = path.join(appRoot, "ai-agent.config.json")
  if (!fs.existsSync(configPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"))
  } catch {
    return {}
  }
}

// Walk up from startDir to find the monorepo root (package.json with "workspaces")
function findMonorepoRoot(startDir: string): string {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, "package.json")
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
        if (pkg.workspaces) return dir
      } catch {}
    }
    dir = path.dirname(dir)
  }
  return startDir
}

const agentConfig = readAgentConfig()
const monorepoRoot = findMonorepoRoot(appRoot)
const appDir = path.relative(monorepoRoot, appRoot)

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.ANTHROPIC_MODEL ?? "anthropic/claude-sonnet-4-5",
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? "8192"),
  },
  app: {
    root: appRoot,
    pagesDir: detectPagesDir(),
  },
  playwright: {
    configPath: path.join(appRoot, "playwright.config.ts"),
    fixturesDir: path.join(testsDir, "fixtures"),
    generatedDir: path.join(testsDir, "generated"),
    manualDir: path.join(testsDir, "manual"),
    utilsDir: path.join(testsDir, "utils"),
  },
  agent: {
    maxFixIterations: 3,
    formRoutes: agentConfig.forms?.routes ?? [],
    formKeywords: agentConfig.forms?.keywords ?? ["contact", "form", "formulaire", "reclamation"],
  },
  sandbox: {
    monorepoRoot,
    appDir,
    dockerImage: agentConfig.sandbox?.dockerImage ?? "playwright-sandbox:1.60.0",
    baseUrl: agentConfig.sandbox?.baseUrl ?? process.env.BASE_URL ?? "http://host.docker.internal:3000",
    configFile: agentConfig.sandbox?.playwrightConfig ?? "playwright.sandbox.config.js",
    reportsDir: agentConfig.sandbox?.reportsDir ?? "tests/reports",
    timeout: agentConfig.sandbox?.timeout ?? 1_800_000,
  },
}
