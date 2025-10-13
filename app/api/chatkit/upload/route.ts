export const runtime = "nodejs";

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";

export async function POST(request: Request): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data with a 'file' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", file, file.name || "upload.bin");

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const url = `${apiBase}/v1/chatkit/files`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${openaiApiKey}`,
      "OpenAI-Beta": "chatkit_beta=v1",
    };

    const orgId = process.env.OPENAI_ORG_ID;
    if (orgId) headers["OpenAI-Organization"] = orgId;
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (projectId) headers["OpenAI-Project"] = projectId;

    const upstream = await fetch(url, { method: "POST", headers, body: upstreamForm });
    const text = await upstream.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: "Upload failed", details: payload }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}


