"use client";

import { useCallback, Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useSearchParams } from "next/navigation";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";

// Function to extract transcript from ChatKit shadow DOM
function extractTranscript(): string {
  try {
    const messages: string[] = [];
    
    // Method 1: Try to find shadow root by searching all elements
    const allElements = document.querySelectorAll('*');
    let shadowRoot: ShadowRoot | null = null;
    
    for (const element of allElements) {
      if (element.shadowRoot) {
        // Check if this shadow root contains ChatKit messages
        const hasThreadTurns = element.shadowRoot.querySelectorAll('[data-thread-turn]').length > 0;
        if (hasThreadTurns) {
          shadowRoot = element.shadowRoot;
          break;
        }
      }
    }

    if (shadowRoot) {
      // Extract messages from shadow DOM
      const threadTurns = shadowRoot.querySelectorAll('[data-thread-turn]');
      
      threadTurns.forEach((turn) => {
        const role = turn.getAttribute('data-message-role') || 
                    turn.getAttribute('data-role') || 
                    'unknown';
        const text = turn.textContent?.trim();
        
        if (text && text.length > 0) {
          const roleLabel = role === 'user' ? 'User' : 
                           role === 'assistant' ? 'Assistant' : 
                           'System';
          messages.push(`${roleLabel}: ${text}`);
        }
      });
    }

    // Method 2: Fallback - try to find messages in regular DOM (if shadow root not found)
    if (messages.length === 0) {
      const userMessages = document.querySelectorAll(
        '[data-thread-turn][data-message-role="user"], ' +
        '[data-thread-turn][data-role="user"], ' +
        '[data-message-role="user"], ' +
        '[data-role="user"]'
      );
      
      const assistantMessages = document.querySelectorAll(
        '[data-thread-turn][data-message-role="assistant"], ' +
        '[data-thread-turn][data-role="assistant"], ' +
        '[data-message-role="assistant"], ' +
        '[data-role="assistant"]'
      );
      
      userMessages.forEach((msg) => {
        const text = msg.textContent?.trim();
        if (text && text.length > 0) {
          messages.push(`User: ${text}`);
        }
      });
      
      assistantMessages.forEach((msg) => {
        const text = msg.textContent?.trim();
        if (text && text.length > 0) {
          messages.push(`Assistant: ${text}`);
        }
      });
    }

    // Remove duplicates and clean up
    const uniqueMessages = Array.from(new Set(messages));
    const transcript = uniqueMessages.join('\n\n');
    
    console.log(`[extractTranscript] Extracted ${uniqueMessages.length} messages`);
    return transcript;
  } catch (error) {
    console.error("[extractTranscript] Error extracting transcript:", error);
    return "";
  }
}

function AssistantWithFormContent() {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  
  // Generate a unique session ID on mount
  useEffect(() => {
    const id = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(id);
  }, []);
  
  // Get first-name from query parameters (try multiple variations)
  const firstNameFromUrl = searchParams.get("first-name") || 
                          searchParams.get("firstName") ||
                          searchParams.get("firstname");
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (firstNameFromUrl && !firstNameFromUrl.includes('{{')) {
      setFirstName(firstNameFromUrl);
      
      // Build Zapier form URL with the parameter
      const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
      zapierFormUrl.searchParams.set("first-name", firstNameFromUrl);
      if (sessionId) {
        zapierFormUrl.searchParams.set("chat-session-id", sessionId);
        // Also pass the conversation link URL
        const conversationUrl = `${window.location.origin}/conversation/${sessionId}`;
        zapierFormUrl.searchParams.set("conversation-link", conversationUrl);
      }
      setIframeSrc(zapierFormUrl.toString());
    } else {
      // Default Zapier form URL without parameter
      const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
      if (sessionId) {
        zapierFormUrl.searchParams.set("chat-session-id", sessionId);
        // Also pass the conversation link URL
        const conversationUrl = `${window.location.origin}/conversation/${sessionId}`;
        zapierFormUrl.searchParams.set("conversation-link", conversationUrl);
      }
      setIframeSrc(zapierFormUrl.toString());
    }
  }, [firstNameFromUrl, sessionId]);
  
  // Function to store transcript
  const storeTranscript = useCallback(async (transcriptText: string) => {
    if (!sessionId) {
      console.warn('[AssistantWithForm] Cannot store transcript: missing sessionId');
      return false;
    }
    
    if (!transcriptText || transcriptText.length === 0) {
      console.warn('[AssistantWithForm] Cannot store transcript: transcript is empty');
      return false;
    }

    console.log(`[AssistantWithForm] Attempting to store transcript for session: ${sessionId}, length: ${transcriptText.length}`);

    try {
      const response = await fetch('/api/store-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, transcript: transcriptText }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AssistantWithForm] Failed to store transcript:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('[AssistantWithForm] Transcript stored successfully:', result);
      console.log(`[AssistantWithForm] SessionId: ${sessionId}, Transcript length: ${transcriptText.length}, Response:`, result);
      return true;
    } catch (error) {
      console.error('[AssistantWithForm] Error storing transcript:', error);
      if (error instanceof Error) {
        console.error('[AssistantWithForm] Error details:', error.message, error.stack);
      }
      return false;
    }
  }, [sessionId]);

  // Function to handle form link click - extract and store transcript
  const handleFormLinkClick = useCallback(async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault(); // Prevent default navigation
    
    const link = e.currentTarget;
    const targetUrl = link.href;
    
    // Try to extract transcript with retries (ChatKit might need a moment to render)
    let transcript = extractTranscript();
    let attempts = 0;
    const maxAttempts = 3;
    
    while ((!transcript || transcript.length === 0) && attempts < maxAttempts) {
      attempts++;
      console.log(`[AssistantWithForm] Attempt ${attempts} to extract transcript...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between attempts
      transcript = extractTranscript();
    }
    
    console.log('[AssistantWithForm] Final transcript length:', transcript.length, 'SessionId:', sessionId);
    console.log('[AssistantWithForm] Transcript preview (first 200 chars):', transcript.substring(0, 200));
    
    if (transcript && transcript.length > 0 && sessionId) {
      // Store transcript and wait for it to complete
      console.log('[AssistantWithForm] Storing transcript before navigation...');
      const stored = await storeTranscript(transcript);
      if (!stored) {
        console.error('[AssistantWithForm] ⚠️ Transcript storage failed! SessionId:', sessionId);
        console.error('[AssistantWithForm] This may cause issues when Zapier tries to retrieve the transcript.');
        // Still continue navigation, but log the error
      } else {
        console.log('[AssistantWithForm] ✅ Transcript stored successfully before navigation');
        // Verify storage by immediately checking
        try {
          const verifyResponse = await fetch(`/api/get-transcript?sessionId=${encodeURIComponent(sessionId)}`);
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            console.log('[AssistantWithForm] ✅ Storage verified! Retrieved transcript length:', verifyData.transcript?.length || 0);
          } else {
            console.warn('[AssistantWithForm] ⚠️ Storage verification failed - transcript may not be available');
          }
        } catch (verifyError) {
          console.warn('[AssistantWithForm] Could not verify storage:', verifyError);
        }
      }
    } else {
      console.warn('[AssistantWithForm] No transcript to store. Transcript length:', transcript.length, 'SessionId:', sessionId);
      // Still try to store a placeholder so the session ID is recorded
      if (sessionId) {
        await storeTranscript('No conversation transcript available at time of form submission.');
      }
    }
    
    // Now navigate to the form
    window.location.href = targetUrl;
  }, [sessionId, storeTranscript]);
  
  // Create personalized greeting
  const greeting = useMemo(() => {
    if (firstName) {
      return `Hi ${firstName}! How can I help you today?`;
    }
    return "Hi! How can I help you today?";
  }, [firstName]);

  const getClientSecret = useCallback(async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;

    console.log("[AssistantWithForm] Creating ChatKit session...");
    
    const response = await fetch(CREATE_SESSION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow: { id: WORKFLOW_ID },
        chatkit_configuration: {
          file_upload: { enabled: true },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AssistantWithForm] Session creation failed:", response.status, errorText);
      throw new Error("Failed to create session: " + response.status);
    }

    const data = await response.json();
    console.log("[AssistantWithForm] Session created successfully");
    return data.client_secret as string;
  }, []);

  const chatkit = useChatKit({
    api: { getClientSecret },
    theme: {
      color: {
        accent: { primary: "#4ccf96", level: 3 },
      },
    },
    startScreen: {
      greeting: greeting,
      prompts: [
        { label: "Help with feature", prompt: "I need help with a feature: ", icon: "circle-question" },
        { label: "Enhancement idea", prompt: "I have an enhancement idea", icon: "sparkle" },
        { label: "Something's not working", prompt: "Something's not working as expected", icon: "bug" },
      ],
    },
    composer: {
      placeholder: "Ask me anything about FYI...",
      attachments: {
        enabled: true,
        accept: {
          "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
          "application/pdf": [".pdf"],
        },
      },
    },
  });

  // Periodically store transcript as conversation progresses
  useEffect(() => {
    if (!chatkit.control || !sessionId) return;

    const interval = setInterval(() => {
      const transcript = extractTranscript();
      if (transcript && transcript.length > 0) {
        storeTranscript(transcript).catch(err => {
          console.error('[AssistantWithForm] Error in periodic transcript storage:', err);
        });
      }
    }, 10000); // Store every 10 seconds

    return () => clearInterval(interval);
  }, [chatkit.control, sessionId, storeTranscript]);

  // Also try to send firstName to Zapier form via postMessage (if it supports it)
  useEffect(() => {
    if (firstName && iframeSrc) {
      // Wait for iframe to load, then try to send postMessage
      const timer = setTimeout(() => {
        const iframe = document.querySelector('iframe[title="Support Request Form"]') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          try {
            iframe.contentWindow.postMessage(
              { firstName, 'first-name': firstName },
              'https://fyi-support-centre.zapier.app'
            );
            console.log('[AssistantWithForm] Sent firstName to Zapier form via postMessage:', firstName);
          } catch (e) {
            console.debug('[AssistantWithForm] Could not send postMessage to Zapier form:', e);
          }
        }
      }, 2000); // Wait 2 seconds for iframe to load
      
      return () => clearTimeout(timer);
    }
  }, [firstName, iframeSrc]);

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Chatbot Section */}
      <div className="flex-1 flex flex-col min-h-0" ref={chatContainerRef}>
        <div className="flex-1 overflow-hidden">
          {chatkit.control ? (
            <div 
              className="w-full h-full" 
              style={{ 
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
              }}
            >
              <ChatKit 
                control={chatkit.control}
                style={{ 
                  width: '100%', 
                  height: '100%',
                  flex: 1
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-lg">Loading chat...</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Zapier Form Section */}
      <div className="border-t border-gray-200 bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-4">Submit Support Request</h2>
          <p className="text-gray-600 mb-6">
            {firstName 
              ? `Hi ${firstName}! Use the form below to submit a support request with additional details.`
              : "Use the form below to submit a support request with additional details."}
          </p>
          {iframeSrc && (
            <a
              href={iframeSrc}
              onClick={handleFormLinkClick}
              className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90 transition-colors"
            >
              Open Support Request Form
              {firstName && ` (for ${firstName})`}
            </a>
          )}
          <p className="text-sm text-gray-500 mt-4">
            {firstName && `Your name (${firstName}) will be pre-filled in the form.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AssistantWithFormPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    }>
      <AssistantWithFormContent />
    </Suspense>
  );
}

