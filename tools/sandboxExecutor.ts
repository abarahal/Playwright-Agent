import { execSync } from "child_process"
import { randomUUID } from "crypto"
import path from "path"
import { config } from "../config.js"

export interface SandboxJobResult {
  exitCode: number
  jsonReportPath: string
  htmlReportPath: string
}

export function runSandboxJob(specFilter?: string): SandboxJobResult {
  const { monorepoRoot, appDir, dockerImage, baseUrl, configFile, reportsDir, timeout } =
    config.sandbox

  const jsonOutput = path.join(appDir, reportsDir, "test-results.json")
  const playwrightConfig = path.join(appDir, configFile)
  const containerName = `sandbox-${randomUUID().slice(0, 8)}`

  const dockerArgs = [
    "docker run --rm",
    `--name ${containerName}`,
    "--cpus 2.0 --memory 2g --pids-limit 512",
    "--security-opt no-new-privileges:true",
    "--cap-drop ALL --cap-add SYS_ADMIN",
    "--ipc host --read-only",
    "--tmpfs /tmp:rw,noexec,nosuid,size=256m",
    "--tmpfs /home/pwuser:rw,nosuid,size=512m",
    `-v ${monorepoRoot}:/workspace:rw`,
    `-e CI=true`,
    `-e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`,
    `-e BASE_URL=${baseUrl}`,
    // Override the executor default so the JSON lands where result-parser expects it
    `-e PLAYWRIGHT_JSON_OUTPUT_NAME=/workspace/${jsonOutput}`,
    `-e npm_config_cache=/tmp/npm-cache`,
    `--workdir /workspace`,
    dockerImage,
    `npx playwright test --config=/workspace/${playwrightConfig}`,
    `--reporter=json --reporter=list --reporter=html`,
  ]

  if (specFilter) dockerArgs.push(specFilter)

  const cmd = dockerArgs.join(" \\\n  ")

  console.log(`\n[sandbox] container: ${containerName}`)
  console.log(`[sandbox] config:    ${playwrightConfig}`)
  console.log(`[sandbox] base url:  ${baseUrl}\n`)

  let exitCode = 0
  try {
    execSync(cmd, { stdio: "inherit", timeout, cwd: monorepoRoot })
  } catch (e: any) {
    exitCode = e.status ?? 1
  }

  return {
    exitCode,
    jsonReportPath: path.join(monorepoRoot, jsonOutput),
    htmlReportPath: path.join(monorepoRoot, appDir, "playwright-report", "index.html"),
  }
}
