import path from "path"
import { runGeneratedTests, runSingleTest } from "../tools/playwrightRunner.js"
import { readGeneratedTest, writeGeneratedTest, listGeneratedTests } from "../tools/fileSystem.js"
import { fixTest } from "../llm/client.js"
import { config } from "../config.js"
import type { TestFailure, TestResult } from "../tools/playwrightRunner.js"

export interface FixResult {
  fixedFiles: string[]
  unresolvedFiles: string[]
  iterations: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findGeneratedFileForFailure(failure: TestFailure): string | null {
  const all = listGeneratedTests()
  const match = all.find(
    (f) =>
      f.name === failure.file ||
      f.filePath.endsWith(failure.file) ||
      path.basename(f.filePath) === failure.file
  )
  return match ? match.name : null
}

async function fixSingleFailure(failure: TestFailure, context: string): Promise<boolean> {
  const fileName = findGeneratedFileForFailure(failure)
  if (!fileName) {
    console.warn(`  ⚠️  Cannot locate generated file for failure: ${failure.file}`)
    return false
  }

  const testCode = readGeneratedTest(fileName)
  if (!testCode) {
    console.warn(`  ⚠️  Cannot read generated test: ${fileName}`)
    return false
  }

  process.stdout.write(`  🔧 Fixing "${failure.testName}" in ${fileName}...`)
  try {
    const fixed = await fixTest(testCode, failure.errorStack, context)
    const fixtureName = testCode.match(/\/\/ fixture: (.+)/)?.[1]?.trim() ?? "unknown"
    writeGeneratedTest(fileName, fixed, fixtureName)
    console.log(" ✅ patched")
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(` ❌ ${msg}`)
    return false
  }
}

export async function runFixWorkflow(): Promise<FixResult> {
  const maxIterations = config.agent.maxFixIterations
  const result: FixResult = { fixedFiles: [], unresolvedFiles: [], iterations: 0 }

  let testResult: TestResult = runGeneratedTests()

  if (testResult.failures.length === 0) {
    console.log("✅ All generated tests are passing — nothing to fix.")
    return result
  }

  const baseUrl = process.env.NEXT_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3000"
  const context = `Base URL: ${baseUrl}\nMax fix iterations: ${maxIterations}`

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    result.iterations = iteration
    console.log(
      `\n🔁 Fix iteration ${iteration}/${maxIterations} — ${testResult.failures.length} failure(s)`
    )

    const fixedThisRound: string[] = []
    for (const failure of testResult.failures) {
      const fixed = await fixSingleFailure(failure, context)
      if (fixed && failure.file) fixedThisRound.push(failure.file)
    }

    if (fixedThisRound.length === 0) {
      console.log("  ⛔ No files could be patched this iteration — stopping.")
      break
    }

    if (iteration < maxIterations) {
      await sleep(0)
      console.log("  ▶️  Re-running tests after fixes...")
      testResult = runGeneratedTests()

      if (testResult.failures.length === 0) {
        console.log("  🎉 All tests passing after fixes!")
        result.fixedFiles.push(...fixedThisRound)
        break
      }
      result.fixedFiles.push(...fixedThisRound)
    } else {
      result.unresolvedFiles.push(...testResult.failures.map((f) => f.file))
    }
  }

  const stillFailing = testResult.failures.length
  console.log(
    `\n📊 Fix complete: ${result.fixedFiles.length} fixed, ${result.unresolvedFiles.length} unresolved after ${result.iterations} iteration(s)`
  )
  if (stillFailing > 0) {
    console.log(`⚠️  ${stillFailing} test(s) still failing — manual review needed.`)
  }

  return result
}
