import { NextRequest, NextResponse } from "next/server";
import { getConversationId } from "@/lib/conversation-id-store";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter" },
        { status: 400 }
      );
    }

    const conversationId = getConversationId(sessionId);
    
    if (!conversationId) {
      return NextResponse.json(
        { 
          error: "Conversation ID not found",
          sessionId,
          message: "No conversation ID found for this session. The conversation may not have been created yet.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      conversationId,
      conversationUrl: `https://platform.openai.com/logs/${conversationId}`,
    });
  } catch (error) {
    console.error("[get-conversation-id] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve conversation ID" },
      { status: 500 }
    );
  }
}

