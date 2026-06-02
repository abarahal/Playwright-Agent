import { config } from "../config.js"
import {
  GENERATION_SYSTEM_PROMPT,
  FIX_SYSTEM_PROMPT,
  UTIL_SYSTEM_PROMPT,
  FIXTURE_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildFixPrompt,
  buildUtilPrompt,
  buildFixtureFromComponentPrompt,
} from "./prompts.js"
import type { Fixture } from "../tools/fileSystem.js"


function assertApiKey(): void {
  if (!config.anthropic.apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it in your environment before running the agent."
    )
  }
}

async function callClaude(systemPrompt: string, userPrompt: string, retries = 5): Promise<string> {
  assertApiKey()

  const response = await fetch(`${config.anthropic.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.anthropic.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (response.status === 429) {
    let body: { error?: { message?: string; metadata?: { retry_after_seconds?: number } } } = {}
    try { body = await response.json() } catch {}

    const msg = body?.error?.message ?? ""
    if (msg.includes("per-day") || msg.includes("per-minute") || msg.includes("Rate limit exceeded")) {
      throw new Error(`Daily rate limit reached. ${msg}`)
    }

    if (retries > 0) {
      const retryAfter = body?.error?.metadata?.retry_after_seconds
      const waitMs = retryAfter ? Math.ceil(retryAfter) * 1000 + 2000 : 30000
      process.stdout.write(` ⏳ rate limited, waiting ${Math.round(waitMs / 1000)}s...`)
      await new Promise((r) => setTimeout(r, waitMs))
      return callClaude(systemPrompt, userPrompt, retries - 1)
    }

    throw new Error(`429 ${JSON.stringify(body)}`)
  }

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`${response.status} ${err}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string | null } }>
  }
  const raw = data.choices?.[0]?.message?.content
  // Strip <think>…</think> blocks that reasoning models (DeepSeek, etc.) emit before the answer
  const text = raw ? stripThinkingBlocks(raw) : null
  if (!text) {
    if (retries > 0) {
      process.stdout.write(` ⏳ empty response, retrying...`)
      await new Promise((r) => setTimeout(r, 5000))
      return callClaude(systemPrompt, userPrompt, retries - 1)
    }
    throw new Error("OpenRouter returned no text content")
  }

  return stripCodeFences(text)
}

export interface ComponentPatch {
  file: string
  search: string
  replace: string
}

export interface GenerateTestResult {
  testCode: string
  patches: ComponentPatch[]
}

function stripThinkingBlocks(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim()
}

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:javascript|js|typescript|ts)?\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim()
}

function parseGenerateOutput(raw: string): GenerateTestResult {
  const testMarker = "===TEST==="
  const patchMarker = "===PATCHES==="

  const testStart = raw.indexOf(testMarker)
  const patchStart = raw.indexOf(patchMarker)

  if (testStart === -1) {
    return { testCode: stripCodeFences(raw), patches: [] }
  }

  const testContent = patchStart === -1
    ? raw.slice(testStart + testMarker.length)
    : raw.slice(testStart + testMarker.length, patchStart)

  let patches: ComponentPatch[] = []
  if (patchStart !== -1) {
    const patchContent = raw.slice(patchStart + patchMarker.length).trim()
    try {
      patches = JSON.parse(patchContent)
    } catch {
      patches = []
    }
  }

  return { testCode: stripCodeFences(testContent.trim()), patches }
}

export async function generateTest(context: string): Promise<GenerateTestResult> {
  const userPrompt = buildGenerationPrompt(context)
  const raw = await callClaude(GENERATION_SYSTEM_PROMPT, userPrompt)
  return parseGenerateOutput(raw)
}

export async function generateUtil(fileName: string, projectContext: string): Promise<string> {
  const userPrompt = buildUtilPrompt(fileName, projectContext)
  return callClaude(UTIL_SYSTEM_PROMPT, userPrompt)
}

export async function fixTest(
  testCode: string,
  errorLog: string,
  context: string
): Promise<string> {
  const userPrompt = buildFixPrompt(testCode, errorLog, context)
  return callClaude(FIX_SYSTEM_PROMPT, userPrompt)
}

export async function generateFixture(
  filePath: string,
  fileContent: string,
  availableRoutes: string[]
): Promise<Fixture> {
  const userPrompt = buildFixtureFromComponentPrompt(filePath, fileContent, availableRoutes)
  const raw = await callClaude(FIXTURE_SYSTEM_PROMPT, userPrompt)
  const cleaned = raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim()
  return JSON.parse(cleaned) as Fixture
}
