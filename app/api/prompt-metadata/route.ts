import { WORKFLOW_ID } from "@/lib/config";
import {
  getCompiledPrompt,
  normalizePromptParameters,
} from "@/lib/prompt";

export const runtime = "nodejs";

interface PromptMetadataRequestBody {
  workflowId?: string | null;
  parameters?: Record<string, unknown> | null;
  ttlMs?: number | null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = await safeParseJson<PromptMetadataRequestBody>(request);
    const workflowId =
      parsed?.workflowId?.trim() || WORKFLOW_ID;

    if (!workflowId) {
      return json(
        { error: "Missing workflow id" },
        400
      );
    }

    const parameters = normalizePromptParameters(parsed?.parameters);
    const entry = await getCompiledPrompt({
      workflowId,
      parameters,
      ttlMs: parsed?.ttlMs ?? undefined,
    });

    return json(
      {
        promptKey: entry.key,
        expiresAt: entry.expiresAt,
        workflowId,
      },
      200
    );
  } catch (error) {
    console.error("[prompt-metadata] error", error);
    return json({ error: "Unable to resolve prompt metadata" }, 500);
  }
}

export async function GET(): Promise<Response> {
  return json({ error: "Method Not Allowed" }, 405);
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

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

