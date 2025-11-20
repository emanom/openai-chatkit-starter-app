import { Suspense } from "react";
import { notFound } from "next/navigation";

async function ConversationContent({ sessionId, threadIdParam }: { sessionId: string; threadIdParam?: string }) {
  // Try to get OpenAI conversation ID first
  const { getConversationId } = await import("@/lib/conversation-id-store");
  let openaiConversationId = getConversationId(sessionId);
  
  // If not found in store, try fetching from API
  if (!openaiConversationId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                      'https://main.d2xcz3k9ugtvab.amplifyapp.com';
      const apiUrl = `${baseUrl}/api/store-conversation-id?sessionId=${encodeURIComponent(sessionId)}`;
      
      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.conversationId) {
          openaiConversationId = result.conversationId;
        }
      }
    } catch (error) {
      console.error('[ConversationPage] Error fetching conversation ID:', error);
    }
  }

  // If we have OpenAI conversation ID, redirect to OpenAI platform
  if (openaiConversationId && openaiConversationId.startsWith('conv_')) {
    const openaiUrl = `https://platform.openai.com/logs/${openaiConversationId}`;
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Chat Conversation</h1>
              <p className="text-sm text-gray-500">
                Session ID: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{sessionId}</code>
              </p>
            </div>
            <div className="text-center py-8">
              <p className="text-lg font-semibold mb-4">View conversation in OpenAI Platform</p>
              <a
                href={openaiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
              >
                Open Conversation in OpenAI Platform →
              </a>
              <p className="text-sm text-gray-500 mt-4">
                <a href={openaiUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {openaiUrl}
                </a>
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200">
              <a
                href="/assistant-with-form"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                ← Back to Chat
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Try to get thread ID and fetch transcript from ChatKit API
  const { getThreadId } = await import("@/lib/thread-id-store");
  // Use threadId from URL parameter if provided, otherwise look it up
  let threadId = threadIdParam || getThreadId(sessionId);
  
  // If not found in store, try fetching from API (for serverless environments)
  if (!threadId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const threadIdUrl = `${baseUrl}/api/get-thread-id?sessionId=${encodeURIComponent(sessionId)}`;
      
      console.log(`[ConversationPage] Thread ID not in store, fetching from API: ${threadIdUrl}`);
      const threadIdResponse = await fetch(threadIdUrl, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (threadIdResponse.ok) {
        const threadIdResult = await threadIdResponse.json();
        if (threadIdResult.threadId) {
          threadId = threadIdResult.threadId;
          console.log(`[ConversationPage] ✅ Retrieved thread ID from API: ${threadId}`);
        }
      }
    } catch (error) {
      console.error('[ConversationPage] Error fetching thread ID:', error);
    }
  }
  
  let data: { transcript: string; timestamp: number } | null = null;
  
  console.log(`[ConversationPage] Session ID: ${sessionId}, Thread ID: ${threadId || 'not found'}`);
  
  // If we have a thread ID, fetch transcript from ChatKit API
  if (threadId) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const apiUrl = `${baseUrl}/api/get-thread-transcript?threadId=${encodeURIComponent(threadId)}`;
      
      console.log(`[ConversationPage] Fetching transcript for thread: ${threadId} from ${apiUrl}`);
      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[ConversationPage] API response:`, { 
          success: result.success, 
          transcriptLength: result.transcript?.length || 0,
          hasThreadData: !!result.threadData 
        });
        
        if (result.transcript && result.transcript.length > 0) {
          console.log(`[ConversationPage] ✅ Retrieved transcript, length: ${result.transcript.length}`);
          data = {
            transcript: result.transcript,
            timestamp: Date.now(), // Use current time since we don't have timestamp from API
          };
        } else {
          console.log(`[ConversationPage] ⚠️ Transcript is empty or missing in API response`);
        }
      } else {
        const errorText = await response.text();
        console.error(`[ConversationPage] ❌ Failed to fetch thread transcript: ${response.status}`, errorText);
      }
    } catch (error) {
      console.error('[ConversationPage] ❌ Error fetching thread transcript:', error);
    }
  } else {
    console.log(`[ConversationPage] ⚠️ No thread ID found for session: ${sessionId}`);
  }
  
  // Fallback: Try to get transcript from in-memory store
  if (!data) {
    const { getTranscript } = await import("@/lib/transcript-store");
    const storedTranscript = getTranscript(sessionId);
    if (storedTranscript) {
      data = {
        transcript: storedTranscript.transcript,
        timestamp: storedTranscript.timestamp,
      };
    }
    
    // If not found in store, try fetching from API
    if (!data) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                        'https://main.d2xcz3k9ugtvab.amplifyapp.com';
        const apiUrl = `${baseUrl}/api/get-transcript?sessionId=${encodeURIComponent(sessionId)}`;
        
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.transcript !== undefined && result.transcript !== "") {
            data = {
              transcript: result.transcript,
              timestamp: result.timestamp || Date.now(),
            };
          }
        }
      } catch (error) {
        console.error('[ConversationPage] Error fetching transcript:', error);
      }
    }
  }

  // Format the transcript for display
  const transcriptLines = data ? data.transcript.split('\n\n').filter(line => line.trim().length > 0) : [];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Chat Conversation</h1>
            <p className="text-sm text-gray-500">
              Session ID: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{sessionId}</code>
            </p>
            {data && (
              <p className="text-sm text-gray-500 mt-1">
                Started: {new Date(data.timestamp).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {!data ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-lg font-semibold mb-2">Conversation Not Found</p>
                <p>No conversation transcript found for this session ID.</p>
                <p className="text-sm mt-2">The conversation may not have been stored, or it may have expired.</p>
                {threadId && (
                  <p className="text-xs mt-2 text-gray-400">
                    Thread ID: <code className="bg-gray-100 px-2 py-1 rounded">{threadId}</code>
                  </p>
                )}
                <p className="text-xs mt-4 text-gray-400">
                  Session ID: <code className="bg-gray-100 px-2 py-1 rounded">{sessionId}</code>
                </p>
              </div>
            ) : transcriptLines.length > 0 ? (
              transcriptLines.map((line, index) => {
                const isUser = line.startsWith('User:');
                const isAssistant = line.startsWith('Assistant:');
                const content = line.replace(/^(User|Assistant|System):\s*/, '');
                
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg ${
                      isUser
                        ? 'bg-blue-50 border border-blue-200 ml-8'
                        : isAssistant
                        ? 'bg-green-50 border border-green-200 mr-8'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="font-semibold text-sm mb-1 text-gray-700">
                      {isUser ? '👤 User' : isAssistant ? '🤖 Assistant' : '⚙️ System'}
                    </div>
                    <div className="text-gray-800 whitespace-pre-wrap">{content}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No conversation messages found.</p>
                <p className="text-sm mt-2">The conversation transcript may not have been captured.</p>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <a
              href="/assistant-with-form"
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← Back to Chat
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ threadId?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-lg">Loading conversation...</div>
        </div>
      }
    >
      <ConversationPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ConversationPageContent({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { sessionId } = await params;
  const { threadId } = await searchParams;
  return <ConversationContent sessionId={sessionId} threadIdParam={threadId} />;
}

