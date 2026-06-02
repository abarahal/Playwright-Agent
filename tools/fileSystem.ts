import fs from "fs"
import path from "path"
import { config } from "../config.js"

export interface TestCase {
  name: string
  steps?: string[]
  assertions?: string[]
  testData?: Record<string, unknown>
}

export interface Fixture {
  name: string
  route?: string
  description?: string
  features?: string[]
  priority?: string
  testCases?: TestCase[]
  [key: string]: unknown
}

export interface GeneratedFile {
  name: string
  filePath: string
  content: string
  fixtureName: string
}

export function readFixtures(): Fixture[] {
  const dir = config.playwright.fixturesDir
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8")
      return JSON.parse(raw) as Fixture
    })
}

export function readFixture(name: string): Fixture | null {
  const candidates = [
    path.join(config.playwright.fixturesDir, `${name}.json`),
    path.join(config.playwright.fixturesDir, name),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Fixture
    }
  }
  return null
}

export function writeGeneratedTest(fileName: string, content: string, fixtureName: string): string {
  const dir = config.playwright.generatedDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  const header = `// @generated — do not edit manually\n// fixture: ${fixtureName}\n// generated: ${new Date().toISOString()}\n\n`
  fs.writeFileSync(filePath, header + content, "utf-8")
  return filePath
}

export function writeUtil(fileName: string, content: string): string {
  const dir = config.playwright.utilsDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8")
  }
  return filePath
}

export function readGeneratedTest(fileName: string): string | null {
  const filePath = path.join(config.playwright.generatedDir, fileName)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, "utf-8")
}

export function listGeneratedTests(): GeneratedFile[] {
  const dir = config.playwright.generatedDir
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".spec.js") || f.endsWith(".spec.ts"))
    .map((f) => {
      const filePath = path.join(dir, f)
      const content = fs.readFileSync(filePath, "utf-8")
      const fixtureMatch = content.match(/\/\/ fixture: (.+)/)
      return {
        name: f,
        filePath,
        content,
        fixtureName: fixtureMatch?.[1]?.trim() ?? "unknown",
      }
    })
}

export function deleteGeneratedTest(fileName: string): boolean {
  const filePath = path.join(config.playwright.generatedDir, fileName)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

export function applyPatch(relativeFile: string, search: string, replace: string): boolean {
  const filePath = path.resolve(config.app.root, relativeFile)
  if (!fs.existsSync(filePath)) return false
  const content = fs.readFileSync(filePath, "utf-8")
  if (!content.includes(search)) return false
  fs.writeFileSync(filePath, content.replace(search, replace), "utf-8")
  return true
}

export function writeFixture(fixture: Fixture): string {
  const dir = config.playwright.fixturesDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${fixture.name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2), "utf-8")
  return filePath
}

export function ensureDirs(): void {
  for (const dir of [
    config.playwright.generatedDir,
    config.playwright.fixturesDir,
    config.playwright.manualDir,
    config.playwright.utilsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
