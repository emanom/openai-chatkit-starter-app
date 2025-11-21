"use client";

import { useCallback, Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useSearchParams } from "next/navigation";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";

// Function to extract transcript from ChatKit shadow DOM
function extractTranscript(): string {
  try {
    const messages: string[] = [];
    
    // Method 1: Try to access ChatKit iframe content (may fail due to CORS)
    try {
      const chatKitIframe = document.querySelector('iframe[src*="chatkit"], iframe[src*="openai"], iframe[src*="cdn.platform"]') as HTMLIFrameElement | null;
      if (chatKitIframe && chatKitIframe.contentDocument) {
        const iframeDoc = chatKitIframe.contentDocument;
        const iframeThreadTurns = iframeDoc.querySelectorAll('[data-thread-turn]');
        
        iframeThreadTurns.forEach((turn) => {
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
    } catch (e) {
      // Cannot access iframe content (CORS) - expected
    }
    
    // Method 2: Try to find shadow root by searching all elements
    if (messages.length === 0) {
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
    }

    // Method 3: Fallback - try to find messages in regular DOM (if shadow root not found)
    if (messages.length === 0) {
      // Try various selectors that ChatKit might use
      const selectors = [
        '[data-thread-turn]',
        '[data-message-role="user"]',
        '[data-message-role="assistant"]',
        '[data-role="user"]',
        '[data-role="assistant"]',
        '[class*="message"]',
        '[class*="turn"]',
        '[class*="user-message"]',
        '[class*="assistant-message"]',
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach((element) => {
          const text = element.textContent?.trim();
          if (text && text.length > 0 && !messages.includes(`User: ${text}`) && !messages.includes(`Assistant: ${text}`)) {
            // Try to determine role from attributes or class names
            const role = element.getAttribute('data-message-role') || 
                        element.getAttribute('data-role') ||
                        (element.className.includes('user') ? 'user' : 
                         element.className.includes('assistant') ? 'assistant' : 'unknown');
            
            const roleLabel = role === 'user' ? 'User' : 
                             role === 'assistant' ? 'Assistant' : 
                             'System';
            messages.push(`${roleLabel}: ${text}`);
          }
        });
      }
    }

    // Remove duplicates and clean up
    const uniqueMessages = Array.from(new Set(messages));
    const transcript = uniqueMessages.join('\n\n');
    
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasBotResponded, setHasBotResponded] = useState<boolean>(false);
  const conversationIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const botResponseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef<string>("");
  const hasBotRespondedRef = useRef<boolean>(false);
  
  // Generate a unique session ID on mount
  useEffect(() => {
    const id = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(id);
  }, []);
  
  // Keep ref in sync with state
  useEffect(() => {
    hasBotRespondedRef.current = hasBotResponded;
  }, [hasBotResponded]);
  
  // Suppress ChatKit internal console errors (CORS issues from chatgpt.com)
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args: unknown[]) => {
      const message = args.join(' ');
      // Filter out ChatKit internal CORS errors
      if (
        message.includes('chatgpt.com/ces/v1/projects/oai/settings') ||
        message.includes('CORS policy') ||
        message.includes('Access-Control-Allow-Origin') ||
        message.includes('Failed to fetch') ||
        message.includes('ERR_FAILED 403')
      ) {
        return; // Suppress these errors
      }
      originalError.apply(console, args);
    };
    
    console.warn = (...args: unknown[]) => {
      const message = args.join(' ');
      // Filter out ChatKit internal warnings
      if (
        message.includes('chatgpt.com/ces/v1/projects/oai/settings') ||
        message.includes('CORS policy') ||
        message.includes('Access-Control-Allow-Origin')
      ) {
        return; // Suppress these warnings
      }
      originalWarn.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
  
  // Intercept fetch requests globally to capture conversation ID from ChatKit API responses
  useEffect(() => {
    if (conversationIdRef.current) return; // Already found
    
    console.log("[AssistantWithForm] Setting up fetch interception...");
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Check if this is a ChatKit conversation API request
      const url = args[0];
      if (typeof url === 'string' && url.includes('/v1/chatkit/conversation')) {
        console.log("[AssistantWithForm] Intercepted ChatKit conversation API request:", url);
        try {
          // Clone the response so we can read it without consuming it
          const clonedResponse = response.clone();
          const data = await clonedResponse.json().catch(() => null);
          
          console.log("[AssistantWithForm] Conversation API response data:", data);
          
          if (data && typeof data === 'object') {
            // Look for conversation ID in various possible fields
            const convId = (data.id || data.conversation_id || data.conversationId || 
                          data.conversation?.id || data.thread?.id) as string | undefined;
            
            console.log("[AssistantWithForm] Extracted conversation ID candidate:", convId);
            
            if (convId && typeof convId === 'string' && convId.startsWith('conv_')) {
              console.log("[AssistantWithForm] ✅ Found conversation ID in fetch response:", convId);
              conversationIdRef.current = convId;
              setConversationId(convId);
              
              // Store the conversation ID mapping
              const currentSessionId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
              fetch('/api/store-conversation-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: currentSessionId, conversationId: convId }),
              }).catch(() => {}); // Silently fail
              
              // Restore original fetch once we've found the ID
              window.fetch = originalFetch;
            } else {
              console.log("[AssistantWithForm] Response keys:", Object.keys(data));
              // Try to find conv_ pattern anywhere in the response
              const responseStr = JSON.stringify(data);
              const convIdMatch = responseStr.match(/conv_[a-f0-9]{40,}/i);
              if (convIdMatch) {
                const foundConvId = convIdMatch[0];
                console.log("[AssistantWithForm] ✅ Found conversation ID in response string:", foundConvId);
                conversationIdRef.current = foundConvId;
                setConversationId(foundConvId);
                
                const currentSessionId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId: currentSessionId, conversationId: foundConvId }),
                }).catch(() => {}); // Silently fail
                
                window.fetch = originalFetch;
              }
            }
          }
        } catch (e) {
          console.debug('[AssistantWithForm] Could not parse fetch response:', e);
        }
      }
      
      return response;
    };
    
    return () => {
      // Restore original fetch on cleanup
      if (window.fetch !== originalFetch) {
        window.fetch = originalFetch;
      }
    };
  }, [sessionId]);
  
  // Get first-name from query parameters (try multiple variations)
  const firstNameFromUrl = searchParams.get("first-name") || 
                          searchParams.get("firstName") ||
                          searchParams.get("firstname");
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Always build the Zapier form URL, even if sessionId isn't ready yet
    const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
    
    if (firstNameFromUrl && !firstNameFromUrl.includes('{{')) {
      setFirstName(firstNameFromUrl);
      zapierFormUrl.searchParams.set("first-name", firstNameFromUrl);
    }
    
    // Add session-related parameters if available
    if (sessionId) {
      zapierFormUrl.searchParams.set("chat-session-id", sessionId);
      // Pass thread ID if available (this is what we need for retrieving transcript)
      if (threadId) {
        zapierFormUrl.searchParams.set("thread-id", threadId);
      }
      // Pass OpenAI conversation link if available
      if (conversationId) {
        const openaiConversationUrl = `https://platform.openai.com/logs/${conversationId}`;
        zapierFormUrl.searchParams.set("conversation-link", openaiConversationUrl);
        zapierFormUrl.searchParams.set("openai-conversation-id", conversationId);
      } else if (sessionId) {
        // Fallback to our conversation page - include threadId if available
        let conversationUrl = `${window.location.origin}/conversation/${sessionId}`;
        if (threadId) {
          conversationUrl += `?threadId=${encodeURIComponent(threadId)}`;
        }
        zapierFormUrl.searchParams.set("conversation-link", conversationUrl);
      }
    }
    
    setIframeSrc(zapierFormUrl.toString());
  }, [firstNameFromUrl, sessionId, conversationId, threadId]);
  
  // Function to store transcript
  const storeTranscript = useCallback(async (transcriptText: string) => {
    if (!sessionId || !transcriptText || transcriptText.length === 0) {
      return false;
    }

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

      await response.json();
      return true;
    } catch (error) {
      console.error('[AssistantWithForm] Error storing transcript:', error);
      if (error instanceof Error) {
        console.error('[AssistantWithForm] Error details:', error.message, error.stack);
      }
      return false;
    }
  }, [sessionId]);


  // Function to handle form button click - extract and store transcript
  const handleFormLinkClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Prevent default navigation
    
    // Try to extract transcript with retries (ChatKit might need a moment to render)
    let transcript = extractTranscript();
    let attempts = 0;
    const maxAttempts = 3;
    
    while ((!transcript || transcript.length === 0) && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between attempts
      transcript = extractTranscript();
    }
    
    if (transcript && transcript.length > 0 && sessionId) {
      // Store transcript and wait for it to complete
      await storeTranscript(transcript);
    } else if (sessionId) {
      // Still try to store a placeholder so the session ID is recorded
      await storeTranscript('No conversation transcript available at time of form submission.');
    }
    
    // Navigate directly to form (CSP blocks iframe embedding)
    window.location.href = iframeSrc;
  }, [sessionId, storeTranscript, iframeSrc]);
  
  // Create personalized greeting
  const greeting = useMemo(() => {
    if (firstName) {
      return `Hi ${firstName}! How can I help you today?`;
    }
    return "Hi! How can I help you today?";
  }, [firstName]);

  const getClientSecret = useCallback(async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;

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
    
    // Try to extract conversation ID from the response
    // Check various possible fields
    const convId = (data.conversation_id || data.thread_id || data.id || data.conversationId || 
                    data.conversation?.id || data.thread?.id) as string | undefined;
    
    // Also check if client_secret contains a conversation ID (it might be a JWT or encoded)
    const clientSecret = data.client_secret as string | undefined;
    if (clientSecret) {
      // Try to extract conv_ from client_secret if it's a JWT or contains it
      const convIdInSecret = clientSecret.match(/conv_[a-f0-9]{40,}/i);
      if (convIdInSecret) {
        const foundConvId = convIdInSecret[0];
        setConversationId(foundConvId);
        if (sessionId) {
          fetch('/api/store-conversation-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, conversationId: foundConvId }),
          }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
        }
      }
    }
    
    if (convId && typeof convId === 'string' && convId.startsWith('conv_')) {
      setConversationId(convId);
      // Store the conversation ID mapping
      if (sessionId) {
        fetch('/api/store-conversation-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, conversationId: convId }),
        }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
      }
    }
    
    return data.client_secret as string;
  }, [sessionId]);

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
    onReady: () => {
      // ChatKit is ready
    },
    onThreadChange: (event: { threadId: string | null }) => {
      const newThreadId = event.threadId;
      const previousThreadId = previousThreadIdRef.current;
      
      // Check if this is a new conversation thread
      // This happens when:
      // 1. ThreadId changes from one value to a different value (new thread)
      // 2. ThreadId becomes null (conversation cleared)
      const isNewConversation = previousThreadId !== null && 
                                 (newThreadId === null || newThreadId !== previousThreadId);
      
      if (isNewConversation) {
        // Reset bot response state for new conversation
        setHasBotResponded(false);
        hasBotRespondedRef.current = false;
        // Clear any monitoring intervals
        if (botResponseCheckIntervalRef.current) {
          clearInterval(botResponseCheckIntervalRef.current);
          botResponseCheckIntervalRef.current = null;
        }
        lastTranscriptRef.current = "";
      }
      
      if (newThreadId) {
        setThreadId(newThreadId);
        previousThreadIdRef.current = newThreadId;
        
        // Store thread ID mapping
        if (sessionId) {
          fetch('/api/store-thread-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, threadId: newThreadId }),
          }).catch(() => {}); // Silently fail
        }
        
        // Start monitoring for bot response completion (streaming end)
        // Use a ref to track if we should monitor (avoid stale closure)
        const currentThreadId = newThreadId;
        
        // Clear any existing check interval
        if (botResponseCheckIntervalRef.current) {
          clearInterval(botResponseCheckIntervalRef.current);
        }
        
        // Reset transcript tracking
        lastTranscriptRef.current = "";
        let stableCount = 0;
        let checkCount = 0;
        const maxChecks = 60; // Stop checking after 60 seconds
        
        // Check periodically for complete bot response using thread API
        botResponseCheckIntervalRef.current = setInterval(() => {
          checkCount++;
          
          // Stop checking after max attempts
          if (checkCount > maxChecks) {
            if (botResponseCheckIntervalRef.current) {
              clearInterval(botResponseCheckIntervalRef.current);
              botResponseCheckIntervalRef.current = null;
            }
            return;
          }
          
          // Use thread API to check for assistant messages
          if (currentThreadId && sessionId) {
            fetch(`/api/get-thread-transcript?threadId=${encodeURIComponent(currentThreadId)}`)
              .then(res => res.json())
              .then(data => {
                if (data.success && data.transcript) {
                  const transcript = data.transcript;
                  
                  // Check if transcript contains assistant message with actual content
                  if (transcript && transcript.includes('Assistant:')) {
                    // Extract assistant messages
                    const assistantMessages = transcript
                      .split('\n\n')
                      .filter((msg: string) => msg.trim().startsWith('Assistant:'));
                    
                    if (assistantMessages.length > 0) {
                      // Get the last assistant message
                      const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
                      const assistantContent = lastAssistantMsg.replace(/^Assistant:\s*/i, '').trim();
                      
                      // Check if assistant message has substantial content
                      if (assistantContent.length > 10) {
                        // Check if transcript has stabilized
                        if (transcript === lastTranscriptRef.current && transcript.length > 0) {
                          stableCount++;
                          // Require 2 consecutive stable checks (2 seconds) to ensure streaming is done
                          if (stableCount >= 2 && !hasBotRespondedRef.current) {
                            // Transcript is stable, bot has finished streaming
                            hasBotRespondedRef.current = true;
                            setHasBotResponded(true);
                            if (botResponseCheckIntervalRef.current) {
                              clearInterval(botResponseCheckIntervalRef.current);
                              botResponseCheckIntervalRef.current = null;
                            }
                          }
                        } else {
                          // Transcript changed, reset stable count
                          stableCount = 0;
                          lastTranscriptRef.current = transcript;
                        }
                      }
                    }
                  }
                }
              })
              .catch(() => {
                // Silently fail - API might not be ready yet
              });
          }
        }, 1000); // Check every second
      } else {
        // Thread was cleared
        setThreadId(null);
        previousThreadIdRef.current = null;
      }
    },
  });

  // Listen for conversation ID via postMessage events and periodic checks
  useEffect(() => {
    if (!chatkit.control || conversationId) return;

    // Listen for postMessage events from ChatKit iframe
    const handleMessage = (event: MessageEvent) => {
      // Check if message contains conversation ID
      if (event.data && typeof event.data === 'object') {
        const data = event.data as Record<string, unknown>;
        const convId = (data.conversationId || data.conversation_id || data.convId || data.id) as string | undefined;
        if (convId && typeof convId === 'string' && convId.startsWith('conv_')) {
          setConversationId(convId);
          if (sessionId) {
            fetch('/api/store-conversation-id', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, conversationId: convId }),
            }).catch(() => {}); // Silently fail
          }
        }
      }
      
      // Also check if message is a string containing conv_
      if (typeof event.data === 'string') {
        const convIdMatch = event.data.match(/conv_[a-f0-9]{40,}/i);
        if (convIdMatch) {
          const convId = convIdMatch[0];
          setConversationId(convId);
          if (sessionId) {
            fetch('/api/store-conversation-id', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, conversationId: convId }),
            }).catch(() => {}); // Silently fail
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Periodically check control object and localStorage for conversation ID
    const checkInterval = setInterval(() => {
      if (conversationId) {
        clearInterval(checkInterval);
        return;
      }
      
      try {
        // Check localStorage for conversation ID (ChatKit might store it)
        try {
          const storageKeys = Object.keys(localStorage);
          for (const key of storageKeys) {
            const value = localStorage.getItem(key);
            if (value) {
              const convIdMatch = value.match(/conv_[a-f0-9]{40,}/i);
              if (convIdMatch) {
                const convId = convIdMatch[0];
                setConversationId(convId);
                if (sessionId) {
                  fetch('/api/store-conversation-id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, conversationId: convId }),
                  }).catch(() => {}); // Silently fail
                }
                clearInterval(checkInterval);
                return;
              }
            }
          }
        } catch (e) {
          console.debug('[AssistantWithForm] Could not check localStorage:', e);
        }
        
        // Check ChatKit iframe URL for conversation ID
        try {
          const chatKitIframe = document.querySelector('iframe[src*="chatkit"], iframe[src*="openai"]') as HTMLIFrameElement | null;
          if (chatKitIframe && chatKitIframe.src) {
            const convIdMatch = chatKitIframe.src.match(/conv_[a-f0-9]{40,}/i);
            if (convIdMatch) {
              const convId = convIdMatch[0];
              setConversationId(convId);
              if (sessionId) {
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, conversationId: convId }),
                }).catch(() => {}); // Silently fail
              }
              clearInterval(checkInterval);
              return;
            }
          }
        } catch (e) {
          console.debug('[AssistantWithForm] Could not check iframe URL:', e);
        }
        
        if (chatkit.control) {
          const controlAny = chatkit.control as unknown as Record<string, unknown>;
          // Try to access any properties that might contain conversation ID
          const allKeys = Object.keys(controlAny);
          
          // Check control object for conversation ID
          if (controlAny.options) {
            const options = controlAny.options as Record<string, unknown>;
            // Try to stringify options to find conv_ pattern
            try {
              const optionsStr = JSON.stringify(options);
              const convIdMatch = optionsStr.match(/conv_[a-f0-9]{40,}/i);
              if (convIdMatch) {
                const foundConvId = convIdMatch[0];
                setConversationId(foundConvId);
                if (sessionId) {
                  fetch('/api/store-conversation-id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, conversationId: foundConvId }),
                  }).catch(() => {}); // Silently fail
                }
                clearInterval(checkInterval);
                return;
              }
            } catch (e) {
              // Could not stringify options
            }
          }
          
          // Check common property names
          for (const key of allKeys) {
            const value = controlAny[key];
            if (typeof value === 'string' && value.startsWith('conv_')) {
              setConversationId(value);
              if (sessionId) {
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, conversationId: value }),
                }).catch(() => {}); // Silently fail
              }
              clearInterval(checkInterval);
              break;
            }
            
            // Also check nested objects - recursively search for conv_ pattern
            if (value && typeof value === 'object') {
              try {
                const valueStr = JSON.stringify(value);
                const convIdMatch = valueStr.match(/conv_[a-f0-9]{40,}/i);
                if (convIdMatch) {
                  const foundConvId = convIdMatch[0];
                  setConversationId(foundConvId);
                  if (sessionId) {
                    fetch('/api/store-conversation-id', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId, conversationId: foundConvId }),
                    }).catch(() => {}); // Silently fail
                  }
                  clearInterval(checkInterval);
                  return;
                }
              } catch (e) {
                // If stringify fails, try direct property access
                const nestedObj = value as Record<string, unknown>;
                for (const nestedKey of Object.keys(nestedObj)) {
                  const nestedValue = nestedObj[nestedKey];
                  if (typeof nestedValue === 'string' && nestedValue.startsWith('conv_')) {
                    setConversationId(nestedValue);
                    if (sessionId) {
                      fetch('/api/store-conversation-id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, conversationId: nestedValue }),
                      }).catch(() => {}); // Silently fail
                    }
                    clearInterval(checkInterval);
                    return;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Error checking for conversation ID - ignore
      }
    }, 2000); // Check every 2 seconds

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkInterval);
    };
  }, [chatkit.control, conversationId, sessionId]);

  // Periodically store transcript as conversation progresses
  useEffect(() => {
    if (!chatkit.control || !sessionId) return;

    const interval = setInterval(() => {
      const transcript = extractTranscript();
      if (transcript && transcript.length > 0) {
        storeTranscript(transcript).catch(() => {}); // Silently fail
      }
    }, 10000); // Store every 10 seconds

    return () => clearInterval(interval);
  }, [chatkit.control, sessionId, storeTranscript]);
  
  // Cleanup bot response check interval on unmount
  useEffect(() => {
    return () => {
      if (botResponseCheckIntervalRef.current) {
        clearInterval(botResponseCheckIntervalRef.current);
      }
    };
  }, []);

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
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Submit Support Request</h2>
          
          {/* New conversation-based form (shown after bot responds) */}
          {hasBotResponded && (
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Use the form below to submit a support request from this conversation with additional details:
              </p>
              <button
                onClick={handleFormLinkClick}
                disabled={!iframeSrc}
                className="group flex items-center justify-between w-full rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:border-gray-200 mb-4"
              >
                <span className="text-lg font-semibold text-gray-900">
                  Open Support Request from this conversation
                </span>
                <svg
                  className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
          
          {/* Original form (always shown) */}
          <div>
            <p className="text-gray-600 mb-4">
              Use the form below to submit a support request without using the assistant:
            </p>
            <button
              onClick={handleFormLinkClick}
              disabled={!iframeSrc}
              className="group flex items-center justify-between w-full rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:border-gray-200"
            >
              <span className="text-lg font-semibold text-gray-900">
                Open Support Request Form
              </span>
              <svg
                className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <p className="text-sm text-gray-500 mt-4">
              {firstName && "Your details will be pre-filled in the form."}
            </p>
          </div>
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

