import { WORKFLOW_ID } from "@/lib/config";
import {
  getCompiledPrompt,
  getPromptByKey,
  normalizePromptParameters,
  type PromptParameters,
} from "@/lib/prompt";

export const runtime = "nodejs";

interface CreateSessionRequestBody {
  workflow?: { id?: string | null } | null;
  // Arbitrary key/values you want your agent to receive (e.g., user profile)
  scope?: Record<string, unknown> | null;
  workflowId?: string | null;
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean;
    };
  };
  prompt_parameters?: Record<string, unknown> | null;
  prompt_metadata?: {
    key?: string | null;
    expiresAt?: number | null;
  } | null;
}

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";
const SESSION_COOKIE_NAME = "chatkit_session_id";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse();
  }
  let sessionCookie: string | null = null;
  
  // Log immediately to verify logging works
  console.log("[create-session] ===== REQUEST START =====");
  console.log("[create-session] Timestamp:", new Date().toISOString());
  
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error("[create-session] ERROR: Missing OPENAI_API_KEY");
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY environment variable",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    console.log("[create-session] API key found:", openaiApiKey.slice(0, 7) + "...");

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    const { userId, sessionCookie: resolvedSessionCookie } =
      await resolveUserId(request);
    sessionCookie = resolvedSessionCookie;
    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (process.env.NODE_ENV !== "production") {
      const keyType = openaiApiKey.startsWith("sk-proj-") ? "project" : "org/global";
      const keyPrefix = `${openaiApiKey.slice(0, 7)}...`;
      console.info("[create-session] handling request", {
        resolvedWorkflowId,
        body: JSON.stringify(parsedBody),
        hasOrgId: !!process.env.OPENAI_ORG_ID,
        orgId: process.env.OPENAI_ORG_ID || "(not set)",
        hasProjectId: !!process.env.OPENAI_PROJECT_ID,
        projectId: process.env.OPENAI_PROJECT_ID || "(not set)",
        keyType,
        keyPrefix,
      });
    }

    if (!resolvedWorkflowId) {
      return buildJsonResponse(
        { error: "Missing workflow id" },
        400,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const url = `${apiBase}/v1/chatkit/sessions`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
      "OpenAI-Beta": "chatkit_beta=v1",
    };
    
    // Add organization ID if provided
    const orgId = process.env.OPENAI_ORG_ID;
    if (orgId) {
      headers["OpenAI-Organization"] = orgId;
    }
    
    // Add project ID if provided (for project-scoped workflows)
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (projectId) {
      headers["OpenAI-Project"] = projectId;
    }
    
    // Add domain key for domain verification in production
    // Support both OPENAI_DOMAIN_KEY and CHATKIT_DOMAIN_KEY for compatibility
    const domainKey = process.env.OPENAI_DOMAIN_KEY || process.env.CHATKIT_DOMAIN_KEY;
    
    // Use console.log instead of console.info/warn for better CloudWatch visibility
    console.log("[create-session] Checking domain key...");
    console.log("[create-session] OPENAI_DOMAIN_KEY exists:", !!process.env.OPENAI_DOMAIN_KEY);
    console.log("[create-session] CHATKIT_DOMAIN_KEY exists:", !!process.env.CHATKIT_DOMAIN_KEY);
    console.log("[create-session] Domain key value:", domainKey ? domainKey.slice(0, 8) + "..." : "NOT FOUND");
    
    if (domainKey) {
      headers["ChatKit-Domain-Key"] = domainKey;
      console.log("[create-session] ✅ Domain key found and added to headers");
      console.log("[create-session] Header ChatKit-Domain-Key set:", !!headers["ChatKit-Domain-Key"]);
    } else {
      console.log("[create-session] ⚠️ WARNING: No domain key found - file citations may not render properly");
      console.log("[create-session] Checked vars: OPENAI_DOMAIN_KEY, CHATKIT_DOMAIN_KEY");
      console.log("[create-session] Node env:", process.env.NODE_ENV);
    }
    
    const normalizedParameters: PromptParameters = normalizePromptParameters(
      parsedBody?.prompt_parameters
    );

    const requestedPromptKey = parsedBody?.prompt_metadata?.key ?? undefined;
    let promptEntry =
      (requestedPromptKey &&
        getPromptByKey(resolvedWorkflowId, requestedPromptKey, normalizedParameters)) ||
      null;

    if (!promptEntry) {
      promptEntry = await getCompiledPrompt({
        workflowId: resolvedWorkflowId,
        parameters: normalizedParameters,
      });
    }

    // Build payloads. Some API versions may not support workflow.input yet.
    // Use env flag to opt-in to sending input to avoid an upstream 400 + retry.
    const allowWorkflowInput =
      (process.env.CHATKIT_WORKFLOW_INPUT_ENABLED || "").trim() === "1";

    const payloadWithPrompt: Record<string, unknown> = allowWorkflowInput
      ? {
          workflow: {
            id: resolvedWorkflowId,
            input: {
              system_prompt: promptEntry.prompt,
              prompt_key: promptEntry.key,
              metadata: normalizedParameters,
            },
          },
          user: userId,
        }
      : {
          workflow: { id: resolvedWorkflowId },
          user: userId,
        };

    // Include file_upload configuration if provided
    const finalPayload: Record<string, unknown> = { ...payloadWithPrompt };
    if (parsedBody?.chatkit_configuration?.file_upload !== undefined || domainKey) {
      finalPayload.chatkit_configuration = {
        ...(parsedBody?.chatkit_configuration?.file_upload !== undefined
          ? {
              file_upload: {
                enabled: parsedBody.chatkit_configuration.file_upload?.enabled ?? false,
              },
            }
          : {}),
        // Include domain key in configuration for file citation rendering
        ...(domainKey ? { domain_key: domainKey } : {}),
      };
    }

    // Fallback payload without prompt input (for legacy workflow compatibility)
    const fallbackPayload: Record<string, unknown> = {
      workflow: { id: resolvedWorkflowId },
      user: userId,
      ...(finalPayload.chatkit_configuration
        ? { chatkit_configuration: finalPayload.chatkit_configuration }
        : {}),
    };
    
    // Ensure domain key is included in both payloads if present
    if (domainKey && !finalPayload.chatkit_configuration) {
      finalPayload.chatkit_configuration = { domain_key: domainKey };
    }
    if (domainKey && !fallbackPayload.chatkit_configuration) {
      fallbackPayload.chatkit_configuration = { domain_key: domainKey };
    }

    // If input is disabled, call upstream once with fallback payload to avoid a 400 + retry.
    const requestPayload = allowWorkflowInput ? finalPayload : fallbackPayload;
    
    // Log request details including domain key for debugging
    console.log("[create-session] ===== SENDING REQUEST =====");
    console.log("[create-session] URL:", url);
    console.log("[create-session] Has domain key:", !!domainKey);
    console.log("[create-session] Domain key in header:", !!headers["ChatKit-Domain-Key"]);
    console.log("[create-session] Domain key in body:", !!(requestPayload.chatkit_configuration as Record<string, unknown>)?.domain_key);
    console.log("[create-session] Payload keys:", Object.keys(requestPayload));
    console.log("[create-session] ChatKit config:", JSON.stringify(requestPayload.chatkit_configuration));
    
    let upstreamResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
    });

    let upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
      | Record<string, unknown>
      | undefined;

    if (
      allowWorkflowInput &&
      !upstreamResponse.ok &&
      shouldRetryWithoutPrompt(upstreamResponse.status, upstreamJson)
    ) {
      console.warn(
        "[create-session] Retrying without prompt input due to upstream failure",
        {
          status: upstreamResponse.status,
          body: upstreamJson,
        }
      );
      upstreamResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(fallbackPayload),
      });
      upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
        | Record<string, unknown>
        | undefined;
    }

    // Always log response for debugging
    console.log("[create-session] ===== RESPONSE RECEIVED =====");
    console.log("[create-session] Status:", upstreamResponse.status);
    console.log("[create-session] Status text:", upstreamResponse.statusText);

    if (!upstreamResponse.ok) {
      const upstreamError = extractUpstreamError(upstreamJson);
      console.error("OpenAI ChatKit session creation failed", {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        body: upstreamJson,
      });
      return buildJsonResponse(
        {
          error:
            upstreamError ??
            `Failed to create session: ${upstreamResponse.statusText}`,
          details: upstreamJson,
        },
        upstreamResponse.status,
        { "Content-Type": "application/json" },
        sessionCookie
      );
    }

    // Augment upstream response with a client-side app_session_id for S3 namespacing
    const appSessionId = (typeof crypto.randomUUID === "function"
      ? `sess_${crypto.randomUUID()}`
      : `sess_${Math.random().toString(36).slice(2)}`);

    const merged: Record<string, unknown> = {
      ...(upstreamJson ?? {}),
      app_session_id: appSessionId,
    };
    if (promptEntry) {
      merged["prompt_key"] = promptEntry.key;
      merged["prompt_expires_at"] = Math.floor(promptEntry.expiresAt / 1000);
    }

    return buildJsonResponse(
      merged,
      200,
      { "Content-Type": "application/json" },
      sessionCookie
    );
  } catch (error) {
    console.error("Create session error", error);
    return buildJsonResponse(
      { error: "Unexpected error" },
      500,
      { "Content-Type": "application/json" },
      sessionCookie
    );
  }
}

export async function GET(): Promise<Response> {
  // Provide helpful info for debugging
  return new Response(
    JSON.stringify({
      error: "Method Not Allowed",
      message: "This endpoint only accepts POST requests. ChatKit will call it automatically when creating a session.",
      method: "Use POST to create a ChatKit session",
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function methodNotAllowedResponse(): Response {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveUserId(request: Request): Promise<{
  userId: string;
  sessionCookie: string | null;
}> {
  const existing = getCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME
  );
  if (existing) {
    return { userId: existing, sessionCookie: null };
  }

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return {
    userId: generated,
    sessionCookie: serializeSessionCookie(generated),
  };
}

function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }
    if (rawName.trim() === name) {
      return rest.join("=").trim();
    }
  }
  return null;
}

function serializeSessionCookie(value: string): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function buildJsonResponse(
  payload: unknown,
  status: number,
  headers: Record<string, string>,
  sessionCookie: string | null
): Response {
  const responseHeaders = new Headers(headers);

  if (sessionCookie) {
    responseHeaders.append("Set-Cookie", sessionCookie);
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractUpstreamError(
  payload: Record<string, unknown> | undefined
): string | null {
  if (!payload) {
    return null;
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") {
    return details;
  }

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") {
      return nestedError;
    }
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }
  return null;
}

function shouldRetryWithoutPrompt(
  status: number,
  payload: Record<string, unknown> | undefined
): boolean {
  if (status < 400 || status >= 500) {
    return false;
  }
  if (!payload) {
    return true;
  }
  const message = extractUpstreamError(payload);
  if (!message) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes("input") ||
    lower.includes("system_prompt") ||
    lower.includes("prompt_key") ||
    lower.includes("metadata") ||
    lower.includes("additional property")
  );
}
