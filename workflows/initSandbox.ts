import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { config } from "../config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatesDir = path.join(__dirname, "..", "templates")

function writeIfMissing(dest: string, content: string, label: string): "created" | "skipped" {
  if (fs.existsSync(dest)) {
    console.log(`  ⏭  ${label} — already exists, skipped`)
    return "skipped"
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, content, "utf-8")
  console.log(`  ✅ ${label}`)
  return "created"
}

function copyIfMissing(src: string, dest: string, label: string): "created" | "skipped" {
  return writeIfMissing(dest, fs.readFileSync(src, "utf-8"), label)
}

function addSandboxToAgentConfig(configPath: string): "created" | "updated" | "skipped" {
  const sandboxBlock = {
    baseUrl: "http://host.docker.internal:3000",
    playwrightConfig: "playwright.sandbox.config.js",
    reportsDir: "tests/reports",
    dockerImage: "playwright-sandbox:1.60.0",
    timeout: 300000,
  }

  if (!fs.existsSync(configPath)) {
    const template = JSON.parse(
      fs.readFileSync(path.join(templatesDir, "ai-agent.config.json"), "utf-8")
    )
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n", "utf-8")
    console.log("  ✅ ai-agent.config.json — created")
    return "created"
  }

  const existing = JSON.parse(fs.readFileSync(configPath, "utf-8"))
  if (existing.sandbox) {
    console.log("  ⏭  ai-agent.config.json — sandbox key already present, skipped")
    return "skipped"
  }

  existing.sandbox = sandboxBlock
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
  console.log("  ✅ ai-agent.config.json — sandbox key added")
  return "updated"
}

function addSandboxScript(pkgPath: string): "added" | "skipped" {
  if (!fs.existsSync(pkgPath)) return "skipped"

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
  if (pkg.scripts?.["test:sandbox"]) {
    console.log('  ⏭  package.json — "test:sandbox" script already present, skipped')
    return "skipped"
  }

  pkg.scripts = pkg.scripts ?? {}
  pkg.scripts["test:sandbox"] = "run-sandbox"
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8")
  console.log('  ✅ package.json — "test:sandbox" script added')
  return "added"
}

export function runInitSandboxWorkflow(): void {
  const { root: appRoot, } = config.app
  const { monorepoRoot, appDir } = config.sandbox

  console.log("\n🐳 Initializing sandbox for this project...\n")

  // 1. playwright.sandbox.config.js
  console.log("📋 Project files:\n")
  copyIfMissing(
    path.join(templatesDir, "playwright.sandbox.config.js"),
    path.join(appRoot, "playwright.sandbox.config.js"),
    "playwright.sandbox.config.js"
  )

  // 2. ai-agent.config.json (create or patch)
  addSandboxToAgentConfig(path.join(appRoot, "ai-agent.config.json"))

  // 3. package.json script
  addSandboxScript(path.join(appRoot, "package.json"))

  // 4. .docker/Dockerfile.sandbox at monorepo root
  console.log("\n🐋 Docker:\n")
  const dockerfileDest = path.join(monorepoRoot, ".docker", "Dockerfile.sandbox")
  copyIfMissing(
    path.join(templatesDir, "Dockerfile.sandbox"),
    dockerfileDest,
    ".docker/Dockerfile.sandbox"
  )

  // 5. tests/reports/ dir
  const reportsDir = path.join(appRoot, "tests", "reports")
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
    console.log("  ✅ tests/reports/")
  }

  console.log("\n✨ Done!\n")
  console.log("Next steps:\n")

  console.log("  1. Build the Docker image (one-time, from monorepo root):")
  console.log(`       cd ${monorepoRoot}`)
  console.log(
    "       docker build -f .docker/Dockerfile.sandbox -t playwright-sandbox:1.60.0 ."
  )
  console.log("")
  console.log(`  2. Update baseUrl in ai-agent.config.json if your app runs on a different port`)
  console.log("")
  console.log("  3. Start your app:")
  console.log("       yarn dev")
  console.log("")
  console.log("  4. Run the sandbox (from this app directory):")
  console.log("       yarn test:sandbox")
  console.log("")
  console.log("  5. Open the HTML report:")
  console.log(`       npx playwright show-report ${path.join(appDir, "tests/reports/html-report")}`)
  console.log("")
}
