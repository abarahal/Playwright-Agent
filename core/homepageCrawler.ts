const HREF_RE = /href=["']([^"']+)["']/g

function isInternal(href: string): boolean {
  const trimmed = href.trim()
  return (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("#") &&
    !trimmed.startsWith("/api/") &&
    !trimmed.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf)$/i)
  )
}

function normalize(href: string): string {
  const clean = href.split("?")[0].trim()
  return clean === "/" ? clean : clean.replace(/\/$/, "")
}

export async function crawlHomepageLinks(baseUrl: string): Promise<string[] | null> {
  try {
    const res = await fetch(baseUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "playwright-ai-agent/crawler" },
    })
    if (!res.ok) return null

    const html = await res.text()
    const links = new Set<string>()
    const re = new RegExp(HREF_RE.source, "g")
    let match

    while ((match = re.exec(html)) !== null) {
      const href = match[1]
      if (isInternal(href)) links.add(normalize(href))
    }

    return Array.from(links).slice(0, 60)
  } catch {
    return null
  }
}
