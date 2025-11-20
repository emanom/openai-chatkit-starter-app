import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranscript } from "@/lib/transcript-store";

async function ConversationContent({ sessionId }: { sessionId: string }) {
  const data = getTranscript(sessionId);

  if (!data) {
    notFound();
  }

  // Format the transcript for display
  const transcriptLines = data.transcript.split('\n\n').filter(line => line.trim().length > 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Chat Conversation</h1>
            <p className="text-sm text-gray-500">
              Session ID: <code className="bg-gray-100 px-2 py-1 rounded text-xs">{sessionId}</code>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Started: {new Date(data.timestamp).toLocaleString()}
            </p>
          </div>

          <div className="space-y-4">
            {transcriptLines.length > 0 ? (
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
}: {
  params: Promise<{ sessionId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-lg">Loading conversation...</div>
        </div>
      }
    >
      <ConversationPageContent params={params} />
    </Suspense>
  );
}

async function ConversationPageContent({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConversationContent sessionId={sessionId} />;
}

