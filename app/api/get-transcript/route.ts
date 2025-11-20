import { NextRequest, NextResponse } from "next/server";
import { getTranscript, getAllSessionIds } from "@/lib/transcript-store";
import { getConversationId } from "@/lib/conversation-id-store";
import { getThreadId } from "@/lib/thread-id-store";

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

    // Try to get thread ID first - this gives us the best transcript source
    const threadId = getThreadId(sessionId);
    let transcript = "";
    let formattedTranscript = "";
    let openaiConversationId: string | null = null;
    let conversationUrl: string;
    let conversationLink: string;
    
    // If we have a thread ID, fetch the transcript from ChatKit API (best quality)
    if (threadId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                        'https://main.d2xcz3k9ugtvab.amplifyapp.com';
        const threadApiUrl = `${baseUrl}/api/get-thread-transcript?sessionId=${encodeURIComponent(sessionId)}&threadId=${encodeURIComponent(threadId)}`;
        
        console.log(`[get-transcript] Fetching transcript from thread API: ${threadApiUrl}`);
        const threadResponse = await fetch(threadApiUrl);
        
        if (threadResponse.ok) {
          const threadData = await threadResponse.json();
          transcript = threadData.transcript || "";
          formattedTranscript = threadData.formattedTranscript || threadData.transcript || "";
          openaiConversationId = threadData.conversationId || null;
          
          console.log(`[get-transcript] Successfully retrieved transcript from thread API, length: ${transcript.length} characters`);
        } else {
          console.warn(`[get-transcript] Thread API returned ${threadResponse.status}, falling back to stored transcript`);
        }
      } catch (error) {
        console.error(`[get-transcript] Error fetching from thread API:`, error);
      }
    }
    
    // Fallback to stored transcript if thread API didn't work
    if (!transcript) {
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
      
      transcript = data.transcript;
      formattedTranscript = `Chat Conversation Transcript (Session: ${sessionId})\n\n${data.transcript}`;
      console.log(`[get-transcript] Successfully retrieved transcript from store, length: ${transcript.length} characters`);
    }
    
    // Try to get OpenAI conversation ID if not already retrieved
    if (!openaiConversationId) {
      openaiConversationId = getConversationId(sessionId) || null;
    }
    
    // Build conversation URL
    if (openaiConversationId) {
      // Use OpenAI platform link
      conversationUrl = `https://platform.openai.com/logs/${openaiConversationId}`;
      conversationLink = `View conversation in OpenAI Platform: ${conversationUrl}`;
    } else {
      // Fallback to our conversation page
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                      'https://main.d2xcz3k9ugtvab.amplifyapp.com';
      conversationUrl = `${baseUrl}/conversation/${sessionId}`;
      conversationLink = `View conversation: ${conversationUrl}`;
    }

    console.log(`[get-transcript] Retrieved transcript for session: ${sessionId}, ticket: ${ticketId || 'N/A'}`);

    // Return transcript in a format Zapier can use
    return NextResponse.json({
      success: true,
      sessionId,
      ticketId: ticketId || null,
      transcript: transcript,
      formattedTranscript: formattedTranscript || `Chat Conversation Transcript (Session: ${sessionId})\n\n${transcript}`,
      // Conversation link for easy access
      conversationUrl: conversationUrl,
      conversationLink: conversationLink,
      openaiConversationId: openaiConversationId,
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

    // Try to get thread ID first - this gives us the best transcript source
    const threadId = getThreadId(sessionId);
    let transcript = "";
    let formattedTranscript = "";
    let openaiConversationId: string | null = null;
    
    // If we have a thread ID, fetch the transcript from ChatKit API (best quality)
    if (threadId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                        'https://main.d2xcz3k9ugtvab.amplifyapp.com';
        const threadApiUrl = `${baseUrl}/api/get-thread-transcript?sessionId=${encodeURIComponent(sessionId)}&threadId=${encodeURIComponent(threadId)}`;
        
        const threadResponse = await fetch(threadApiUrl);
        
        if (threadResponse.ok) {
          const threadData = await threadResponse.json();
          transcript = threadData.transcript || "";
          formattedTranscript = threadData.formattedTranscript || threadData.transcript || "";
          openaiConversationId = threadData.conversationId || null;
        }
      } catch (error) {
        console.error(`[get-transcript] Error fetching from thread API:`, error);
      }
    }
    
    // Fallback to stored transcript if thread API didn't work
    if (!transcript) {
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
      
      transcript = data.transcript;
      formattedTranscript = `Chat Conversation Transcript (Session: ${sessionId})\n\n${data.transcript}`;
    }
    
    // Try to get OpenAI conversation ID if not already retrieved
    if (!openaiConversationId) {
      openaiConversationId = getConversationId(sessionId) || null;
    }

    // Get the base URL for the conversation link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                    'https://main.d2xcz3k9ugtvab.amplifyapp.com';
    
    const conversationUrl = openaiConversationId
      ? `https://platform.openai.com/logs/${openaiConversationId}`
      : `${baseUrl}/conversation/${sessionId}`;

    return NextResponse.json({
      success: true,
      sessionId,
      ticketId: ticketId || null,
      transcript: transcript,
      formattedTranscript: formattedTranscript || `Chat Conversation Transcript (Session: ${sessionId})\n\n${transcript}`,
      conversationUrl: conversationUrl,
      conversationLink: `View full conversation: ${conversationUrl}`,
      openaiConversationId: openaiConversationId,
    });
  } catch (error) {
    console.error("[get-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve transcript" },
      { status: 500 }
    );
  }
}

