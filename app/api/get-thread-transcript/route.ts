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
    // Try fetching thread with items - some APIs require a query parameter to include items
    let url = `${apiBase}/v1/chatkit/threads/${threadId}`;
    
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
    let response = await fetch(url, {
      method: "GET",
      headers,
    });
    
    // If thread doesn't have items, try fetching thread items separately
    // Some ChatKit APIs have a separate endpoint for thread items
    if (response.ok) {
      const threadPreview = await response.clone().json();
      if (!threadPreview.items || !threadPreview.items.data || threadPreview.items.data.length === 0) {
        console.log(`[get-thread-transcript] Thread has no items, trying thread items endpoint...`);
        // Try thread items endpoint: /v1/chatkit/threads/{threadId}/items
        const itemsUrl = `${apiBase}/v1/chatkit/threads/${threadId}/items`;
        const itemsResponse = await fetch(itemsUrl, {
          method: "GET",
          headers,
        });
        
        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          console.log(`[get-thread-transcript] Retrieved items separately:`, Object.keys(itemsData));
          // Merge items into thread object
          threadPreview.items = itemsData.items || itemsData.data || itemsData;
          // Recreate response with merged data
          response = new Response(JSON.stringify(threadPreview), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

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
    console.log(`[get-thread-transcript] Retrieved thread:`, JSON.stringify(thread, null, 2));
    console.log(`[get-thread-transcript] Thread data keys:`, Object.keys(thread));
    console.log(`[get-thread-transcript] Has items?:`, !!thread.items);
    console.log(`[get-thread-transcript] Items structure:`, thread.items ? Object.keys(thread.items) : 'no items');
    console.log(`[get-thread-transcript] Items data length:`, thread.items?.data?.length || 0);

    // If thread doesn't have items, try fetching thread items separately
    if (!thread.items || !thread.items.data || thread.items.data.length === 0) {
      console.log(`[get-thread-transcript] Thread has no items, trying thread items endpoint...`);
      try {
        const itemsUrl = `${apiBase}/v1/chatkit/threads/${threadId}/items`;
        console.log(`[get-thread-transcript] Fetching items from: ${itemsUrl}`);
        const itemsResponse = await fetch(itemsUrl, {
          method: "GET",
          headers,
        });
        
        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          console.log(`[get-thread-transcript] Items response keys:`, Object.keys(itemsData));
          console.log(`[get-thread-transcript] Items response:`, JSON.stringify(itemsData, null, 2));
          
          // Merge items into thread object
          if (itemsData.items) {
            thread.items = itemsData.items;
          } else if (itemsData.data) {
            thread.items = { data: itemsData.data };
          } else if (Array.isArray(itemsData)) {
            thread.items = { data: itemsData };
          }
        } else {
          const errorText = await itemsResponse.text();
          console.log(`[get-thread-transcript] Items endpoint returned ${itemsResponse.status}:`, errorText);
        }
      } catch (error) {
        console.error(`[get-thread-transcript] Error fetching items:`, error);
      }
    }

    // Build transcript from thread items
    const transcript = buildTranscript(thread);
    const formattedTranscript = buildFormattedTranscript(thread);
    console.log(`[get-thread-transcript] Built transcript length:`, transcript.length);
    
    // Try to extract conversation ID from thread data
    let conversationId: string | undefined;
    const threadStr = JSON.stringify(thread);
    const convIdMatch = threadStr.match(/conv_[a-f0-9]{40,}/i);
    if (convIdMatch) {
      conversationId = convIdMatch[0];
      console.log(`[get-thread-transcript] Found conversation ID in thread: ${conversationId}`);
    }
    
    // Check common fields for conversation ID
    if (!conversationId) {
      conversationId = (thread.conversation_id || thread.conversationId || thread.conversation?.id) as string | undefined;
      if (conversationId && conversationId.startsWith('conv_')) {
        console.log(`[get-thread-transcript] Found conversation ID in thread fields: ${conversationId}`);
      }
    }
    
    const conversationUrl = conversationId 
      ? `https://platform.openai.com/logs/${conversationId}`
      : sessionId 
        ? `https://main.d2xcz3k9ugtvab.amplifyapp.com/conversation/${sessionId}`
        : undefined;
    
    return NextResponse.json({
      success: true,
      sessionId,
      threadId,
      transcript,
      formattedTranscript,
      conversationId,
      conversationUrl,
      conversationLink: conversationUrl ? `View conversation: ${conversationUrl}` : undefined,
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

interface ThreadItem {
  id?: string;
  type?: string;
  content?: Array<{ 
    type?: string;
    text?: string; 
    content?: string;
  }> | string;
  text?: string;
}

interface ThreadResponse {
  items?: {
    data?: ThreadItem[];
  };
}

function buildTranscript(thread: ThreadResponse): string {
  if (!thread.items?.data || !Array.isArray(thread.items.data)) {
    return "";
  }

  const messages: string[] = [];
  
  // Sort items by created_at (oldest first) if available
  const sortedItems = [...thread.items.data].sort((a, b) => {
    const aTime = (a as { created_at?: number }).created_at || 0;
    const bTime = (b as { created_at?: number }).created_at || 0;
    return aTime - bTime;
  });
  
  for (const item of sortedItems) {
    // Skip task_group and other non-message types
    if (item.type === 'chatkit.task_group' || !item.type) {
      continue;
    }
    
    // Determine role based on ChatKit message type
    const role = item.type === 'chatkit.assistant_message' ? 'Assistant' : 
                item.type === 'chatkit.user_message' ? 'User' : 
                item.type?.includes('assistant') ? 'Assistant' :
                item.type?.includes('user') ? 'User' :
                'System';
    
    // Extract text content from the item
    let text = '';
    if (item.content && Array.isArray(item.content)) {
      // Extract text from content array (which has objects with 'text' field)
      const textParts = item.content
        .map((c: { type?: string; text?: string; content?: string }) => {
          // Prioritize 'text' field, fallback to 'content'
          return c.text || c.content || '';
        })
        .filter((t: string) => t && t.length > 0);
      text = textParts.join('\n');
    } else if (item.text) {
      text = item.text;
    } else if (typeof item.content === 'string') {
      text = item.content;
    }
    
    if (text && text.trim().length > 0) {
      messages.push(`${role}: ${text.trim()}`);
    }
  }
  
  return messages.join('\n\n');
}

function buildFormattedTranscript(thread: ThreadResponse): string {
  if (!thread.items?.data || !Array.isArray(thread.items.data)) {
    return "";
  }

  const messages: string[] = [];
  
  // Sort items by created_at (oldest first) if available
  const sortedItems = [...thread.items.data].sort((a, b) => {
    const aTime = (a as { created_at?: number }).created_at || 0;
    const bTime = (b as { created_at?: number }).created_at || 0;
    return aTime - bTime;
  });
  
  for (const item of sortedItems) {
    // Skip task_group and other non-message types
    if (item.type === 'chatkit.task_group' || !item.type) {
      continue;
    }
    
    // Determine role based on ChatKit message type
    const role = item.type === 'chatkit.assistant_message' ? 'Assistant' : 
                item.type === 'chatkit.user_message' ? 'User' : 
                item.type?.includes('assistant') ? 'Assistant' :
                item.type?.includes('user') ? 'User' :
                'System';
    
    // Extract text content from the item
    let text = '';
    if (item.content && Array.isArray(item.content)) {
      // Extract text from content array (which has objects with 'text' field)
      const textParts = item.content
        .map((c: { type?: string; text?: string; content?: string }) => {
          // Prioritize 'text' field, fallback to 'content'
          return c.text || c.content || '';
        })
        .filter((t: string) => t && t.length > 0);
      text = textParts.join('\n');
    } else if (item.text) {
      text = item.text;
    } else if (typeof item.content === 'string') {
      text = item.content;
    }
    
    if (text && text.trim().length > 0) {
      // Format with timestamp if available
      const timestamp = (item as { created_at?: number }).created_at;
      const timeStr = timestamp ? new Date(timestamp * 1000).toLocaleString() : '';
      const header = timeStr ? `[${timeStr}] ${role}:` : `${role}:`;
      messages.push(`${header}\n${text.trim()}\n`);
    }
  }
  
  return messages.join('\n---\n\n');
}

