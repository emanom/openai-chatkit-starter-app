const FALLBACK_SUBJECT = "any particular topic";
const DEFAULT_BASE = "https://go.fyi.app";
const FYI_HOST_SUFFIX = "fyi.app";

function sanitizeLinkTarget(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.includes("{{") || value.includes("}}")) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    try {
      if (value.startsWith("/")) {
        return new URL(value, DEFAULT_BASE);
      }
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function inferViewSubject(url: URL | null): string | null {
  if (!url) {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith(FYI_HOST_SUFFIX)) {
    return null;
  }
  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const [first, second] = segments;
  if (first === "tasks") {
    return "tasks";
  }
  if (first === "documents") {
    return "documents";
  }
  if (first === "automations") {
    return "automations";
  }
  if (first === "workspace") {
    if (second === "my-recent") {
      return "your My Recent workspace";
    }
    if (second === "my-tasks") {
      return "your My Tasks workspace";
    }
  }
  return null;
}

type BuildGreetingOptions = {
  link?: unknown;
  salutation?: string | null;
  fallbackSubject?: string;
};

export function buildLinkAwareGreeting(options?: BuildGreetingOptions): string {
  const fallbackSubject = options?.fallbackSubject ?? FALLBACK_SUBJECT;
  const sanitizedTarget = sanitizeLinkTarget(options?.link ?? null);
  const inferredSubject = inferViewSubject(toUrl(sanitizedTarget));
  const base = inferredSubject
    ? `Do you need help with ${inferredSubject}, or something else?`
    : `Do you need help with ${fallbackSubject}?`;
  const prefix = options?.salutation?.trim();
  if (prefix) {
    return `${prefix} ${base}`.replace(/\s+/g, " ").trim();
  }
  return base;
}

export function inferLinkContextValue(link?: unknown): string | null {
  const sanitized = sanitizeLinkTarget(link ?? null);
  return inferViewSubject(toUrl(sanitized));
}

