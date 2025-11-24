import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface SupportRequestBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  description?: string;
  videoLink?: string;
  relatedPageLink?: string;
  otherDetails?: string;
  files?: string[];
  chatSessionId?: string;
  threadId?: string;
  conversationId?: string;
  conversationLink?: string;
  isConversationRequest?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: SupportRequestBody = await request.json();

    // Validate required fields based on form type
    if (body.isConversationRequest) {
      // Conversation form doesn't require name/email
    } else {
      // Full form requires name and email
      if (!body.firstName || !body.lastName || !body.email) {
        return NextResponse.json(
          { error: "Missing required fields: firstName, lastName, email" },
          { status: 400 }
        );
      }
    }

    // Get Zapier webhook URL from environment variable
    // Support separate webhooks for conversation requests vs full form requests
    const zapierWebhookUrl = body.isConversationRequest
      ? (process.env.ZAPIER_CONVERSATION_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL)
      : (process.env.ZAPIER_FULL_FORM_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL);
    
    if (!zapierWebhookUrl) {
      const missingVar = body.isConversationRequest
        ? "ZAPIER_CONVERSATION_WEBHOOK_URL or ZAPIER_WEBHOOK_URL"
        : "ZAPIER_FULL_FORM_WEBHOOK_URL or ZAPIER_WEBHOOK_URL";
      console.error(`[submit-support-request] ${missingVar} not configured`);
      return NextResponse.json(
        { 
          error: "Webhook URL not configured",
          details: `Please set ${missingVar} environment variable in AWS Amplify`
        },
        { status: 500 }
      );
    }

    // Prepare data for Zapier webhook
    // Format it to match what Zapier expects (adjust based on your Zapier table structure)
    const zapierData: Record<string, unknown> = {
      "chat-session-id": body.chatSessionId || "",
      "thread-id": body.threadId || "",
      "openai-conversation-id": body.conversationId || "",
      "conversation-link": body.conversationLink || "",
      "submitted-at": new Date().toISOString(),
      "is-conversation-request": body.isConversationRequest || false,
    };

    if (body.isConversationRequest) {
      // Conversation form fields
      zapierData["video-recording-link"] = body.videoLink || "";
      zapierData["other-details"] = body.otherDetails || "";
      zapierData["screenshots-or-files"] = body.files || [];
    } else {
      // Full form fields
      zapierData["first-name"] = body.firstName || "";
      zapierData["last-name"] = body.lastName || "";
      zapierData["email"] = body.email || "";
      zapierData["description"] = body.description || "";
      zapierData["video-recording-link"] = body.videoLink || "";
      zapierData["related-fyi-page-link"] = body.relatedPageLink || "";
      zapierData["screenshots-or-files"] = body.files || [];
    }

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

