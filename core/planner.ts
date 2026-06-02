import type { ProjectScan, Route } from "./scanner.js"
import type { Fixture } from "../tools/fileSystem.js"

export interface TestPlan {
  fixture: Fixture
  targetRoute: Route | null
  outputFileName: string
  priority: "high" | "medium" | "low"
}

export interface Plan {
  items: TestPlan[]
  generatedAt: string
}

function resolveRoute(fixture: Fixture, scan: ProjectScan): Route | null {
  if (!fixture.route) return null
  const normalized = fixture.route.replace(/\/$/, "") || "/"
  return (
    scan.pageRoutes.find((r) => {
      const rNorm = r.route.replace(/\/$/, "") || "/"
      return rNorm === normalized || r.route === fixture.route
    }) ?? null
  )
}

function prioritize(fixture: Fixture): "high" | "medium" | "low" {
  if (fixture.priority) return fixture.priority as "high" | "medium" | "low"
  if (fixture.route === "/" || fixture.route === "") return "high"
  return "medium"
}

function toFileName(fixtureName: string): string {
  return `${fixtureName.replace(/[^a-z0-9-_]/gi, "-").toLowerCase()}.spec.ts`
}

export function planTests(fixtures: Fixture[], scan: ProjectScan): Plan {
  const items: TestPlan[] = fixtures.map((fixture) => ({
    fixture,
    targetRoute: resolveRoute(fixture, scan),
    outputFileName: toFileName(fixture.name),
    priority: prioritize(fixture),
  }))

  items.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.priority] - order[b.priority]
  })

  return { items, generatedAt: new Date().toISOString() }
}
