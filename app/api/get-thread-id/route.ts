import { NextRequest, NextResponse } from "next/server";
import { getThreadId } from "@/lib/thread-id-store";

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

    const threadId = getThreadId(sessionId);
    
    if (!threadId) {
      return NextResponse.json(
        { 
          error: "Thread ID not found",
          sessionId,
          message: "No thread ID found for this session. The thread may not have been created yet.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      threadId,
    });
  } catch (error) {
    console.error("[get-thread-id] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve thread ID" },
      { status: 500 }
    );
  }
}

