import fs from "fs"

export interface SandboxTestResult {
  title: string
  status: "passed" | "failed" | "skipped" | "timedOut" | string
}

export interface SandboxSuite {
  file: string
  tests: SandboxTestResult[]
}

export interface SandboxSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  suites: SandboxSuite[]
}

export function parseSandboxResults(jsonPath: string): SandboxSummary {
  if (!fs.existsSync(jsonPath)) {
    console.warn(`[sandbox] No JSON report found at ${jsonPath}`)
    return { total: 0, passed: 0, failed: 0, skipped: 0, suites: [] }
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
  let passed = 0, failed = 0, skipped = 0

  const suites: SandboxSuite[] = (report.suites ?? []).map((suite: any) => {
    const tests: SandboxTestResult[] = (suite.specs ?? []).flatMap((spec: any) =>
      (spec.tests ?? []).map((t: any) => {
        const status = t.results?.[0]?.status ?? "unknown"
        if (status === "passed") passed++
        else if (status === "failed" || status === "timedOut") failed++
        else skipped++
        return { title: spec.title, status }
      })
    )
    return { file: suite.file ?? suite.title ?? "unknown", tests }
  })

  return { total: passed + failed + skipped, passed, failed, skipped, suites }
}
