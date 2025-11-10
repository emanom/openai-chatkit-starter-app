export const runtime = "nodejs";

type ResolveTitleRequest = {
  url?: string | null;
};

type CacheEntry = {
  title: string;
  expiresAt: number;
};

const TITLE_TTL_MS = 60 * 60 * 1000; // 1 hour
const titleCache = new Map<string, CacheEntry>();

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await safeParseJson<ResolveTitleRequest>(req)) ?? {};
    const url = String(body.url || "").trim();
    if (!isValidHttpUrl(url)) {
      return json({ error: "Invalid URL" }, 400);
    }
    const title = await resolveTitle(url);
    return json({ url, title }, 200);
  } catch (err) {
    return json({ error: "Unable to resolve title" }, 500);
  }
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const url = String(searchParams.get("url") || "").trim();
  if (!isValidHttpUrl(url)) {
    return json({ error: "Invalid URL" }, 400);
  }
  try {
    const title = await resolveTitle(url);
    return json({ url, title }, 200);
  } catch {
    return json({ error: "Unable to resolve title" }, 500);
  }
}

async function resolveTitle(url: string): Promise<string> {
  const now = Date.now();
  const cached = titleCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.title;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "FYI-Chat/1.0 (+https://fyi.app; title-fetcher bot for link labelling)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html");
    const text = await res.text();
    const slice = text.slice(0, 64 * 1024); // first 64KB
    const match = isHtml
      ? slice.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      : null;
    const raw = match?.[1] || "";
    const clean = sanitizeTitle(raw) || hostFromUrl(url);
    titleCache.set(url, { title: clean, expiresAt: now + TITLE_TTL_MS });
    return clean;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeTitle(t: string): string {
  return t
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


