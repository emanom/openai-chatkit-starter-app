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
        console.log(`[extractTranscript] Found ${iframeThreadTurns.length} thread turns in iframe`);
        
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
      console.debug('[extractTranscript] Cannot access iframe content (CORS):', e);
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
        console.log(`[extractTranscript] Found ${threadTurns.length} thread turns in shadow DOM`);
        
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
        console.log(`[extractTranscript] Found ${elements.length} elements with selector: ${selector}`);
        
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
    
    console.log(`[extractTranscript] Extracted ${uniqueMessages.length} messages`);
    if (uniqueMessages.length > 0) {
      console.log(`[extractTranscript] Sample messages:`, uniqueMessages.slice(0, 3));
    }
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
  const conversationIdRef = useRef<string | null>(null);
  
  // Generate a unique session ID on mount
  useEffect(() => {
    const id = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(id);
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
              }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
              
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
                }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
                
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
    
    if (firstNameFromUrl && !firstNameFromUrl.includes('{{')) {
      setFirstName(firstNameFromUrl);
      
      // Build Zapier form URL with the parameter
      const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
      zapierFormUrl.searchParams.set("first-name", firstNameFromUrl);
      if (sessionId) {
        zapierFormUrl.searchParams.set("chat-session-id", sessionId);
        // Pass OpenAI conversation link if available
        if (conversationId) {
          const openaiConversationUrl = `https://platform.openai.com/logs/${conversationId}`;
          zapierFormUrl.searchParams.set("conversation-link", openaiConversationUrl);
          zapierFormUrl.searchParams.set("openai-conversation-id", conversationId);
        } else {
          // Fallback to our conversation page
          const conversationUrl = `${window.location.origin}/conversation/${sessionId}`;
          zapierFormUrl.searchParams.set("conversation-link", conversationUrl);
        }
      }
      setIframeSrc(zapierFormUrl.toString());
    } else {
      // Default Zapier form URL without parameter
      const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
      if (sessionId) {
        zapierFormUrl.searchParams.set("chat-session-id", sessionId);
        // Pass OpenAI conversation link if available
        if (conversationId) {
          const openaiConversationUrl = `https://platform.openai.com/logs/${conversationId}`;
          zapierFormUrl.searchParams.set("conversation-link", openaiConversationUrl);
          zapierFormUrl.searchParams.set("openai-conversation-id", conversationId);
        } else {
          // Fallback to our conversation page
          const conversationUrl = `${window.location.origin}/conversation/${sessionId}`;
          zapierFormUrl.searchParams.set("conversation-link", conversationUrl);
        }
      }
      setIframeSrc(zapierFormUrl.toString());
    }
  }, [firstNameFromUrl, sessionId, conversationId]);
  
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
    console.log("[AssistantWithForm] Session created successfully", data);
    console.log("[AssistantWithForm] Full response data:", JSON.stringify(data, null, 2));
    
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
        console.log("[AssistantWithForm] Found conversation ID in client_secret:", foundConvId);
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
      console.log("[AssistantWithForm] Found conversation ID in response:", convId);
      setConversationId(convId);
      // Store the conversation ID mapping
      if (sessionId) {
        fetch('/api/store-conversation-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, conversationId: convId }),
        }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
      }
    } else {
      console.log("[AssistantWithForm] No conversation ID (conv_...) found in response. Available fields:", Object.keys(data));
      if (convId) {
        console.log("[AssistantWithForm] Found ID but it's not a conversation ID:", convId);
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
      console.log("[AssistantWithForm] ChatKit ready, control:", chatkit.control);
      // Try to extract conversation ID from control object
      if (chatkit.control) {
        try {
          // Check if control object has conversation/thread info
          const controlAny = chatkit.control as unknown as Record<string, unknown>;
          if (controlAny.conversationId || controlAny.conversation_id || controlAny.threadId || controlAny.thread_id) {
            const convId = (controlAny.conversationId || controlAny.conversation_id || controlAny.threadId || controlAny.thread_id) as string;
            if (convId && convId.startsWith('conv_')) {
              console.log("[AssistantWithForm] Found conversation ID in control:", convId);
              setConversationId(convId);
              if (sessionId) {
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, conversationId: convId }),
                }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
              }
            }
          }
        } catch (e) {
          console.debug('[AssistantWithForm] Could not access control properties:', e);
        }
      }
    },
  });

  // Listen for conversation ID via postMessage events and periodic checks
  useEffect(() => {
    if (!chatkit.control || conversationId) return;

    let hasLoggedKeys = false; // Track if we've logged the control keys

    // Listen for postMessage events from ChatKit iframe
    const handleMessage = (event: MessageEvent) => {
      // Check if message contains conversation ID
      if (event.data && typeof event.data === 'object') {
        const data = event.data as Record<string, unknown>;
        const convId = (data.conversationId || data.conversation_id || data.convId || data.id) as string | undefined;
        if (convId && typeof convId === 'string' && convId.startsWith('conv_')) {
          console.log("[AssistantWithForm] ✅ Found conversation ID in postMessage:", convId);
          setConversationId(convId);
          if (sessionId) {
            fetch('/api/store-conversation-id', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, conversationId: convId }),
            }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
          }
        }
      }
      
      // Also check if message is a string containing conv_
      if (typeof event.data === 'string') {
        const convIdMatch = event.data.match(/conv_[a-f0-9]{40,}/i);
        if (convIdMatch) {
          const convId = convIdMatch[0];
          console.log("[AssistantWithForm] ✅ Found conversation ID in postMessage string:", convId);
          setConversationId(convId);
          if (sessionId) {
            fetch('/api/store-conversation-id', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, conversationId: convId }),
            }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
                console.log("[AssistantWithForm] ✅ Found conversation ID in localStorage:", key, convId);
                setConversationId(convId);
                if (sessionId) {
                  fetch('/api/store-conversation-id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, conversationId: convId }),
                  }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
              console.log("[AssistantWithForm] ✅ Found conversation ID in iframe URL:", convId);
              setConversationId(convId);
              if (sessionId) {
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, conversationId: convId }),
                }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
          
          // Only log keys on first check to avoid spam
          if (!hasLoggedKeys) {
            console.log("[AssistantWithForm] Control object keys:", allKeys);
            // Log detailed structure of handlers and options
            if (controlAny.handlers) {
              console.log("[AssistantWithForm] Control handlers:", Object.keys(controlAny.handlers as Record<string, unknown>));
            }
            if (controlAny.options) {
              const options = controlAny.options as Record<string, unknown>;
              console.log("[AssistantWithForm] Control options keys:", Object.keys(options));
              // Try to stringify options to find conv_ pattern
              try {
                const optionsStr = JSON.stringify(options);
                const convIdMatch = optionsStr.match(/conv_[a-f0-9]{40,}/i);
                if (convIdMatch) {
                  console.log("[AssistantWithForm] ✅ Found conversation ID in options:", convIdMatch[0]);
                  const foundConvId = convIdMatch[0];
                  setConversationId(foundConvId);
                  if (sessionId) {
                    fetch('/api/store-conversation-id', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId, conversationId: foundConvId }),
                    }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
                  }
                  clearInterval(checkInterval);
                  return;
                }
              } catch (e) {
                console.debug('[AssistantWithForm] Could not stringify options:', e);
              }
            }
            hasLoggedKeys = true;
          }
          
          // Check common property names
          for (const key of allKeys) {
            const value = controlAny[key];
            if (typeof value === 'string' && value.startsWith('conv_')) {
              console.log("[AssistantWithForm] ✅ Found conversation ID in control property:", key, value);
              setConversationId(value);
              if (sessionId) {
                fetch('/api/store-conversation-id', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId, conversationId: value }),
                }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
                  console.log("[AssistantWithForm] ✅ Found conversation ID in nested control property:", key, foundConvId);
                  setConversationId(foundConvId);
                  if (sessionId) {
                    fetch('/api/store-conversation-id', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId, conversationId: foundConvId }),
                    }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
                    console.log("[AssistantWithForm] ✅ Found conversation ID in nested control property:", key, nestedKey, nestedValue);
                    setConversationId(nestedValue);
                    if (sessionId) {
                      fetch('/api/store-conversation-id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, conversationId: nestedValue }),
                      }).catch(err => console.error('[AssistantWithForm] Failed to store conversation ID:', err));
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
        console.debug('[AssistantWithForm] Error checking for conversation ID:', e);
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

