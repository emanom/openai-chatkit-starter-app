import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface SupportRequestBody {
  firstName: string;
  lastName: string;
  email: string;
  description?: string;
  videoLink?: string;
  relatedPageLink?: string;
  files?: string[];
  chatSessionId?: string;
  threadId?: string;
  conversationId?: string;
  conversationLink?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SupportRequestBody = await request.json();

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.email) {
      return NextResponse.json(
        { error: "Missing required fields: firstName, lastName, email" },
        { status: 400 }
      );
    }

    // Get Zapier webhook URL from environment variable
    const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (!zapierWebhookUrl) {
      console.error("[submit-support-request] ZAPIER_WEBHOOK_URL not configured");
      return NextResponse.json(
        { error: "Webhook URL not configured" },
        { status: 500 }
      );
    }

    // Prepare data for Zapier webhook
    // Format it to match what Zapier expects (adjust based on your Zapier table structure)
    const zapierData = {
      "first-name": body.firstName,
      "last-name": body.lastName,
      "email": body.email,
      "description": body.description || "",
      "video-recording-link": body.videoLink || "",
      "related-fyi-page-link": body.relatedPageLink || "",
      "screenshots-or-files": body.files || [],
      "chat-session-id": body.chatSessionId || "",
      "thread-id": body.threadId || "",
      "openai-conversation-id": body.conversationId || "",
      "conversation-link": body.conversationLink || "",
      "submitted-at": new Date().toISOString(),
    };

    // Send to Zapier webhook
    const response = await fetch(zapierWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(zapierData),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[submit-support-request] Zapier webhook error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to submit to Zapier: ${response.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[submit-support-request] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

