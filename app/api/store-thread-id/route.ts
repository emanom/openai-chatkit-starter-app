import { NextRequest, NextResponse } from "next/server";
import { storeThreadId } from "@/lib/thread-id-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, threadId } = body;

    if (!sessionId || !threadId) {
      return NextResponse.json(
        { error: "Missing sessionId or threadId" },
        { status: 400 }
      );
    }

    storeThreadId(sessionId, threadId);
    console.log(`[store-thread-id] Stored thread ID mapping: ${sessionId} -> ${threadId}`);

    return NextResponse.json({
      success: true,
      sessionId,
      threadId,
    });
  } catch (error) {
    console.error("[store-thread-id] Error:", error);
    return NextResponse.json(
      { error: "Failed to store thread ID" },
      { status: 500 }
    );
  }
}

