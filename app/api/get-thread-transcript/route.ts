import { NextRequest, NextResponse } from "next/server";
import { getThreadId } from "@/lib/thread-id-store";

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");
    const threadIdParam = searchParams.get("threadId");

    if (!sessionId && !threadIdParam) {
      return NextResponse.json(
        { error: "Missing sessionId or threadId parameter" },
        { status: 400 }
      );
    }

    // Use threadId from parameter if provided, otherwise look it up from sessionId
    const threadId = threadIdParam || getThreadId(sessionId!);
    
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

    // Retrieve thread from ChatKit API
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const url = `${apiBase}/v1/chatkit/threads/${threadId}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
      "OpenAI-Beta": "chatkit_beta=v1",
    };
    
    // Add organization ID if provided
    const orgId = process.env.OPENAI_ORG_ID;
    if (orgId) {
      headers["OpenAI-Organization"] = orgId;
    }
    
    // Add project ID if provided
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (projectId) {
      headers["OpenAI-Project"] = projectId;
    }

    console.log(`[get-thread-transcript] Fetching thread: ${threadId}`);
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[get-thread-transcript] API error: ${response.status}`, errorText);
      return NextResponse.json(
        { 
          error: "Failed to retrieve thread from ChatKit API",
          status: response.status,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const thread = await response.json();
    console.log(`[get-thread-transcript] Retrieved thread with ${thread.items?.data?.length || 0} items`);

    // Build transcript from thread items
    const transcript = buildTranscript(thread);
    
    return NextResponse.json({
      success: true,
      sessionId,
      threadId,
      transcript,
      threadData: thread,
    });
  } catch (error) {
    console.error("[get-thread-transcript] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve thread transcript" },
      { status: 500 }
    );
  }
}

function buildTranscript(thread: any): string {
  if (!thread.items?.data || !Array.isArray(thread.items.data)) {
    return "";
  }

  const messages: string[] = [];
  
  for (const item of thread.items.data) {
    const role = item.type === 'assistant_message' ? 'Assistant' : 
                item.type === 'user_message' ? 'User' : 
                'System';
    
    // Extract text content from the item
    let text = '';
    if (item.content && Array.isArray(item.content)) {
      text = item.content
        .map((c: any) => c.text || c.content || '')
        .filter((t: string) => t.length > 0)
        .join(' ');
    } else if (item.text) {
      text = item.text;
    } else if (typeof item.content === 'string') {
      text = item.content;
    }
    
    if (text && text.length > 0) {
      messages.push(`${role}: ${text}`);
    }
  }
  
  return messages.join('\n\n');
}

