import fs from "fs"
import path from "path"
import { config } from "../config.js"

export interface Route {
  filePath: string
  route: string
  isDynamic: boolean
  isApiRoute: boolean
}

export interface ProjectScan {
  routes: Route[]
  apiRoutes: Route[]
  pageRoutes: Route[]
  totalPages: number
  scannedAt: string
  configuredLocales: string[]
}

function fileToRoute(filePath: string, pagesDir: string): string {
  const relative = filePath.replace(pagesDir, "").replace(/\\/g, "/")
  return relative
    .replace(/\.(jsx?|tsx?)$/, "")
    .replace(/\/index$/, "/")
    .replace(/^\//, "/")
    || "/"
}

function isDynamicRoute(filePath: string): boolean {
  return /\[.*\]/.test(filePath)
}

function readProjectLocales(appRoot: string): string[] {
  const configPath = path.join(appRoot, "project.config.js")
  if (!fs.existsSync(configPath)) return []
  try {
    const mod = { exports: {} as Record<string, unknown> }
    new Function("module", "exports", fs.readFileSync(configPath, "utf-8"))(mod, mod.exports)
    const enabled = (mod.exports as { languages?: { enabled?: string[] } })?.languages?.enabled
    return Array.isArray(enabled) ? enabled : []
  } catch {
    return []
  }
}

function collectFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      collectFiles(full, results)
    } else if (/\.(jsx?|tsx?)$/.test(entry) && !entry.startsWith("_")) {
      results.push(full)
    }
  }
  return results
}

export function scanProject(): ProjectScan {
  const pagesDir = config.app.pagesDir
  const appRoot = config.app.root
  const files = collectFiles(pagesDir)

  const routes: Route[] = files.map((filePath) => {
    const route = fileToRoute(filePath, pagesDir)
    const isApiRoute = route.startsWith("/api/")
    return {
      filePath,
      route,
      isDynamic: isDynamicRoute(filePath),
      isApiRoute,
    }
  })

  return {
    routes,
    apiRoutes: routes.filter((r) => r.isApiRoute),
    pageRoutes: routes.filter((r) => !r.isApiRoute),
    totalPages: routes.filter((r) => !r.isApiRoute).length,
    scannedAt: new Date().toISOString(),
    configuredLocales: readProjectLocales(appRoot),
  }
}
