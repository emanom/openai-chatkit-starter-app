import { NextRequest, NextResponse } from "next/server";
import { storeTranscript, getTranscript } from "@/lib/transcript-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, transcript } = body;

    if (!sessionId || !transcript) {
      return NextResponse.json(
        { error: "Missing sessionId or transcript" },
        { status: 400 }
      );
    }

    // Store transcript
    storeTranscript(sessionId, transcript);

    console.log(`[store-transcript] Stored transcript for session: ${sessionId}`);

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error("[store-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to store transcript" },
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

    const data = getTranscript(sessionId);
    if (!data) {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionId,
      transcript: data.transcript,
      timestamp: data.timestamp,
    });
  } catch (error) {
    console.error("[store-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve transcript" },
      { status: 500 }
    );
  }
}

