import { NextRequest, NextResponse } from "next/server";
import { getTranscript, getAllSessionIds } from "@/lib/transcript-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, ticketId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter" },
        { status: 400 }
      );
    }

    // Retrieve transcript from store
    // In production, this would query Redis or a database
    const data = getTranscript(sessionId);
    
    if (!data) {
      const allSessions = getAllSessionIds();
      console.warn(`[get-transcript] Transcript not found for session: ${sessionId}, ticketId: ${ticketId || 'N/A'}`);
      console.log(`[get-transcript] Available sessions (${allSessions.length}):`, allSessions.slice(0, 10));
      return NextResponse.json(
        { 
          error: "Transcript not found",
          sessionId,
          transcript: "",
          message: `No transcript found for session ID: ${sessionId}. Make sure the transcript was stored before the form was submitted.`,
          availableSessions: allSessions.length,
          debug: {
            requestedSession: sessionId,
            availableSessions: allSessions.slice(0, 5),
          },
        },
        { status: 404 }
      );
    }
    
    console.log(`[get-transcript] Successfully retrieved transcript for session: ${sessionId}, length: ${data.transcript.length} characters`);

    console.log(`[get-transcript] Retrieved transcript for session: ${sessionId}, ticket: ${ticketId || 'N/A'}`);

    // Return transcript in a format Zapier can use
    return NextResponse.json({
      success: true,
      sessionId,
      ticketId: ticketId || null,
      transcript: data.transcript,
      timestamp: data.timestamp,
      // Format transcript for easy use in Zapier
      formattedTranscript: `Chat Conversation Transcript (Session: ${sessionId})\n\n${data.transcript}`,
    });
  } catch (error) {
    console.error("[get-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve transcript" },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");
    const ticketId = searchParams.get("ticketId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter" },
        { status: 400 }
      );
    }

    const data = getTranscript(sessionId);
    
    if (!data) {
      return NextResponse.json(
        { 
          error: "Transcript not found",
          sessionId,
          transcript: "",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      ticketId: ticketId || null,
      transcript: data.transcript,
      timestamp: data.timestamp,
      formattedTranscript: `Chat Conversation Transcript (Session: ${sessionId})\n\n${data.transcript}`,
    });
  } catch (error) {
    console.error("[get-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve transcript" },
      { status: 500 }
    );
  }
}

