import { NextRequest, NextResponse } from "next/server";
import { getAllSessionIds, getTranscript } from "@/lib/transcript-store";

export async function GET(request: NextRequest) {
  try {
    const allSessions = getAllSessionIds();
    const transcripts = allSessions.map(sessionId => {
      const data = getTranscript(sessionId);
      return {
        sessionId,
        transcriptLength: data?.transcript.length || 0,
        timestamp: data?.timestamp || null,
        age: data ? Date.now() - data.timestamp : null,
      };
    });

    return NextResponse.json({
      totalSessions: allSessions.length,
      sessions: transcripts,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[debug-transcripts] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve debug info" },
      { status: 500 }
    );
  }
}

