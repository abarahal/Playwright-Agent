import { scanProject } from "../core/scanner.js"
import type { ProjectScan } from "../core/scanner.js"

export interface ScanReport {
  scan: ProjectScan
  summary: string
}

export function runScanWorkflow(): ScanReport {
  console.log("🔍 Scanning Next.js project routes...")
  const scan = scanProject()

  const lines = [
    `\n📦 Project Scan — ${scan.scannedAt}`,
    ``,
    `📄 Page routes (${scan.pageRoutes.length}):`,
    ...scan.pageRoutes.map((r) => `   ${r.isDynamic ? "⚡" : "  "} ${r.route}`),
    ``,
    `🔌 API routes (${scan.apiRoutes.length}):`,
    ...scan.apiRoutes.slice(0, 10).map((r) => `     ${r.route}`),
    scan.apiRoutes.length > 10 ? `   ... and ${scan.apiRoutes.length - 10} more` : "",
    ``,
    `📊 Total pages: ${scan.totalPages}`,
  ]

  const summary = lines.filter((l) => l !== undefined).join("\n")
  console.log(summary)

  return { scan, summary }
}
