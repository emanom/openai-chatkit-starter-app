import { NextRequest, NextResponse } from "next/server";
import { storeConversationId, getConversationId } from "@/lib/conversation-id-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, conversationId } = body;

    if (!sessionId || !conversationId) {
      return NextResponse.json(
        { error: "Missing sessionId or conversationId" },
        { status: 400 }
      );
    }

    storeConversationId(sessionId, conversationId);
    console.log(`[store-conversation-id] Stored conversation ID for session: ${sessionId} -> ${conversationId}`);

    return NextResponse.json({ success: true, sessionId, conversationId });
  } catch (error) {
    console.error("[store-conversation-id] Error:", error);
    return NextResponse.json(
      { error: "Failed to store conversation ID" },
      { status: 500 }
    );
  }
}

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
        { error: "Conversation ID not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionId,
      conversationId,
      conversationUrl: `https://platform.openai.com/logs/${conversationId}`,
    });
  } catch (error) {
    console.error("[store-conversation-id] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve conversation ID" },
      { status: 500 }
    );
  }
}

