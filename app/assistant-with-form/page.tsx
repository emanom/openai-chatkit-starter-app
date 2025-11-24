"use client";

import { useCallback, Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useSearchParams } from "next/navigation";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";
import SupportRequestForm from "@/components/SupportRequestForm";
import ConversationSupportForm from "@/components/ConversationSupportForm";
import ChatKitIconBadge from "@/components/ChatKitIconBadge";
import {
  sanitizeCitationsDeep,
  sanitizeCitationText,
  ensureGlobalCitationObserver,
} from "@/lib/sanitizeCitations";
import type { UserMetadata, UserMetadataKey } from "@/types/userMetadata";
import { USER_METADATA_KEYS } from "@/types/userMetadata";

const USER_METADATA_KEY_SET = new Set<UserMetadataKey>(USER_METADATA_KEYS);

const sanitizeMetadataParamValue = (value: string | null): string | null => {
  if (!value) return null;
  if (value.includes("{{") || value.includes("}}")) {
    return null;
  }
  return value;
};

const normalizeMetadataParamKey = (rawKey: string): UserMetadataKey | null => {
  if (USER_METADATA_KEY_SET.has(rawKey as UserMetadataKey)) {
    return rawKey as UserMetadataKey;
  }
  if (rawKey.startsWith("meta.")) {
    const trimmed = rawKey.slice(5);
    if (USER_METADATA_KEY_SET.has(trimmed as UserMetadataKey)) {
      return trimmed as UserMetadataKey;
    }
    return null;
  }
  if (rawKey.startsWith("meta_")) {
    const trimmed = rawKey.slice(5);
    if (USER_METADATA_KEY_SET.has(trimmed as UserMetadataKey)) {
      return trimmed as UserMetadataKey;
    }
  }
  return null;
};

const extractUserMetadataFromQuery = (queryString: string): UserMetadata => {
  const metadata: UserMetadata = {};
  if (!queryString) {
    return metadata;
  }
  const params = new URLSearchParams(queryString);
  params.forEach((value, key) => {
    const normalizedKey = normalizeMetadataParamKey(key);
    if (!normalizedKey) {
      return;
    }
    const sanitized = sanitizeMetadataParamValue(value);
    if (sanitized) {
      metadata[normalizedKey] = sanitized;
    }
  });
  return metadata;
};

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
          const cleanedText = sanitizeCitationText(turn.textContent ?? "");
          
          if (cleanedText) {
            const roleLabel = role === 'user' ? 'User' : 
                             role === 'assistant' ? 'Assistant' : 
                             'System';
            messages.push(`${roleLabel}: ${cleanedText}`);
          }
        });
      }
    } catch {
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
          const cleanedText = sanitizeCitationText(turn.textContent ?? "");
          
          if (cleanedText) {
            const roleLabel = role === 'user' ? 'User' : 
                             role === 'assistant' ? 'Assistant' : 
                             'System';
            messages.push(`${roleLabel}: ${cleanedText}`);
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
          const cleanedText = sanitizeCitationText(element.textContent ?? "");
          if (!cleanedText) {
            return;
          }

          // Try to determine role from attributes or class names
          const role = element.getAttribute('data-message-role') || 
                      element.getAttribute('data-role') ||
                      (element.className.includes('user') ? 'user' : 
                       element.className.includes('assistant') ? 'assistant' : 'unknown');
          
          const roleLabel = role === 'user' ? 'User' : 
                           role === 'assistant' ? 'Assistant' : 
                           'System';
          const payload = `${roleLabel}: ${cleanedText}`;

          if (!messages.includes(payload)) {
            messages.push(payload);
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
  const searchParamsString = searchParams.toString();
  const metadata = useMemo(
    () => extractUserMetadataFromQuery(searchParamsString),
    [searchParamsString]
  );
  const [firstName, setFirstName] = useState<string | null>(null);
  const metadataFirstName = metadata.first_name ?? null;
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [hasBotResponded, setHasBotResponded] = useState<boolean>(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [isConversationForm, setIsConversationForm] = useState<boolean>(false);
  const [submittedFormType, setSubmittedFormType] = useState<"support" | "conversation" | null>(null);
  const [showLoadingSpinner, setShowLoadingSpinner] = useState<boolean>(true);
  const conversationIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const botResponseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef<string>("");
  const hasBotRespondedRef = useRef<boolean>(false);
  
  const handleModalClose = useCallback(() => {
    setIsFormModalOpen(false);
    setIsConversationForm(false);
    setSubmittedFormType(null);
  }, []);

  const handleSupportFormSuccess = useCallback(() => {
    setSubmittedFormType("support");
  }, []);

  const handleConversationFormSuccess = useCallback(() => {
    setSubmittedFormType("conversation");
  }, []);

  useEffect(() => {
    if (!firstName && metadataFirstName) {
      setFirstName(metadataFirstName);
    }
  }, [firstName, metadataFirstName]);

  // Generate a unique session ID on mount
  useEffect(() => {
    const id = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(id);
  }, []);

  useEffect(() => {
    ensureGlobalCitationObserver();
  }, []);
  
  // Keep ref in sync with state
  useEffect(() => {
    hasBotRespondedRef.current = hasBotResponded;
  }, [hasBotResponded]);
  
  // Suppress ChatKit internal console errors (CORS issues from chatgpt.com)
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;
    
    const shouldSuppress = (message: string): boolean => {
      const lowerMessage = message.toLowerCase();
      return (
        lowerMessage.includes('chatgpt.com/ces/v1/projects/oai/settings') ||
        lowerMessage.includes('ces/v1/projects/oai/settings') ||
        lowerMessage.includes('chatgpt.com/ces/v1') ||
        lowerMessage.includes('cors policy') ||
        lowerMessage.includes('access-control-allow-origin') ||
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('err_failed 403') ||
        lowerMessage.includes('err_failed') ||
        lowerMessage.includes('403 (forbidden)') ||
        (lowerMessage.includes('access to fetch') && lowerMessage.includes('chatgpt.com')) ||
        (lowerMessage.includes('blocked by cors') && lowerMessage.includes('chatgpt.com')) ||
        (lowerMessage.includes('from origin') && lowerMessage.includes('cdn.platform.openai.com') && lowerMessage.includes('chatgpt.com'))
      );
    };
    
    console.error = (...args: unknown[]) => {
      const message = args.join(' ');
      if (shouldSuppress(message)) {
        return; // Suppress these errors
      }
      originalError.apply(console, args);
    };
    
    console.warn = (...args: unknown[]) => {
      const message = args.join(' ');
      if (shouldSuppress(message)) {
        return; // Suppress these warnings
      }
      originalWarn.apply(console, args);
    };
    
    // Also suppress in console.log for some cases
    console.log = (...args: unknown[]) => {
      const message = args.join(' ');
      if (shouldSuppress(message)) {
        return; // Suppress these logs
      }
      originalLog.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      console.log = originalLog;
    };
  }, []);
  
  // Sanitize raw file citations rendered by ChatKit when sources are disabled
  useEffect(() => {
    const rootNode = chatContainerRef.current;
    if (!rootNode) return;

    let rafId: number | null = null;
    let observer: MutationObserver | null = null;
    let sanitizeIntervalId: NodeJS.Timeout | null = null;

    let sanitizeTimeout: number | null = null;
    const sanitizeShadow = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) return;
        sanitizeCitationsDeep(shadow);
        if (typeof document !== 'undefined') {
          sanitizeCitationsDeep(document.body);
        }
      } catch (e) {
        console.debug('[AssistantWithForm] sanitize shadow error:', e);
      }
    };

    const debouncedSanitize = () => {
      if (sanitizeTimeout !== null) {
        clearTimeout(sanitizeTimeout);
      }
      // Run immediately
      sanitizeShadow();
      // Then run again after a short delay to catch rapid changes
      sanitizeTimeout = window.setTimeout(() => {
        sanitizeShadow();
        sanitizeTimeout = null;
      }, 50);
    };

    const attachObserver = () => {
      const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
      const shadow = wc?.shadowRoot;
      if (!shadow) {
        rafId = window.requestAnimationFrame(attachObserver);
        return;
      }
      rafId = null;
      sanitizeShadow();
      try {
        observer?.disconnect();
      } catch {}
      // Clear any existing interval before creating a new one
      if (sanitizeIntervalId !== null) {
        clearInterval(sanitizeIntervalId);
        sanitizeIntervalId = null;
      }
      observer = new MutationObserver(() => debouncedSanitize());
      observer.observe(shadow, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      // Also run periodically during active streaming (every 200ms)
      sanitizeIntervalId = setInterval(() => {
        sanitizeShadow();
      }, 200);
    };

    attachObserver();
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (sanitizeTimeout !== null) {
        clearTimeout(sanitizeTimeout);
      }
      try {
        observer?.disconnect();
        // Clear interval if it exists
        if (sanitizeIntervalId !== null) {
          clearInterval(sanitizeIntervalId);
          sanitizeIntervalId = null;
        }
      } catch {}
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
      // Skip S3 uploads, file uploads, and other non-ChatKit requests
      const url = args[0];
      if (typeof url === 'string' && 
          url.includes('/v1/chatkit/conversation') && 
          !url.includes('s3.amazonaws.com') && 
          !url.includes('amazonaws.com')) {
        console.log("[AssistantWithForm] Intercepted ChatKit conversation API request:", url);
        try {
          // Only intercept JSON responses, skip binary/binary-like responses
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            return response; // Return original response for non-JSON content
          }
          
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
  
  // Get first_name from query parameters (try multiple variations)
  const firstNameFromUrlRaw = searchParams.get("first_name") || 
                          searchParams.get("first-name") ||
                          searchParams.get("firstName") ||
                          searchParams.get("firstname");
  const firstNameFromUrl =
    firstNameFromUrlRaw && !firstNameFromUrlRaw.includes("{{") && !firstNameFromUrlRaw.includes("}}")
      ? firstNameFromUrlRaw
      : null;
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Always build the Zapier form URL, even if sessionId isn't ready yet
    const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
    const resolvedFirstName = firstNameFromUrl || metadataFirstName;
    
    if (resolvedFirstName) {
      setFirstName(resolvedFirstName);
      zapierFormUrl.searchParams.set("first_name", resolvedFirstName);
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
  }, [firstNameFromUrl, metadataFirstName, sessionId, conversationId, threadId]);
  
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


  // Function to handle conversation form button click - simpler form
  const handleConversationFormClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setSubmittedFormType(null);
    
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
    
    // Open conversation form in modal
    setIsConversationForm(true);
    setIsFormModalOpen(true);
  }, [sessionId, storeTranscript]);

  // Function to handle general form button click - full form
  const handleFormLinkClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setSubmittedFormType(null);
    
    // Full form doesn't need transcript - user is submitting without conversation context
    // Just open the form modal
    setIsConversationForm(false);
    setIsFormModalOpen(true);
  }, []);
  
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
        { label: "Tell me about Learning resources", prompt: "Tell me about Learning resources", icon: "circle-question" },
        { label: "What's new in FYI?", prompt: "What's new in FYI? ", icon: "sparkle" },
        { label: "Details on subscription plans", prompt: "Details on subscription plans", icon: "document" },
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
            } catch {
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
              } catch {
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
    } catch {
      // Error checking for conversation ID - ignore
    }
    }, 2000); // Check every 2 seconds

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkInterval);
    };
  }, [chatkit.control, conversationId, sessionId]);

  // Show loading spinner for minimum time and until ChatKit is ready
  useEffect(() => {
    if (chatkit.control) {
      // Wait a bit to ensure ChatKit is actually rendered, then hide spinner
      const timer = setTimeout(() => {
        setShowLoadingSpinner(false);
      }, 500); // Minimum 500ms display time
      return () => clearTimeout(timer);
    } else {
      setShowLoadingSpinner(true);
    }
  }, [chatkit.control]);

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
              { firstName, first_name: firstName },
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
          {chatkit.control && !showLoadingSpinner ? (
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
            <div className="flex items-center justify-center h-full bg-white">
              <div className="text-center">
                <svg
                  className="animate-spin h-12 w-12 text-green-600 mx-auto mb-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="text-lg text-gray-600">Loading chat...</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Custom Composer Prefill Buttons */}
        {chatkit.control && !showLoadingSpinner && (
          <div className="border-t border-gray-200 bg-white py-4" style={{ paddingRight: '240px' }}>
            <div className="max-w-2xl mx-auto px-4 sm:px-6">
              <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    // Access the ChatKit web component directly
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chatkitElement = document.querySelector('openai-chatkit') as any;
                    if (chatkitElement && typeof chatkitElement.setComposerValue === 'function') {
                      await chatkitElement.setComposerValue({ text: "I need help with a feature: " });
                      if (typeof chatkitElement.focusComposer === 'function') {
                        await chatkitElement.focusComposer();
                      }
                    } else {
                      // Fallback: try to find composer in shadow DOM
                      const shadow = chatkitElement?.shadowRoot;
                      if (shadow) {
                        const composer = shadow.querySelector('[role="textbox"], [contenteditable="true"]') as HTMLElement;
                        if (composer) {
                          composer.textContent = "I need help with a feature: ";
                          composer.dispatchEvent(new Event('input', { bubbles: true }));
                          composer.focus();
                        }
                      }
                    }
                  } catch (error) {
                    console.error('[AssistantWithForm] Failed to set composer value:', error);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-normal transition-all duration-150 border border-gray-200 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] flex items-center gap-3 text-left justify-start whitespace-nowrap"
                type="button"
              >
                <ChatKitIconBadge name="circle-question" />
                <span className="text-sm font-normal text-gray-600">Help with feature</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    // Access the ChatKit web component directly
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chatkitElement = document.querySelector('openai-chatkit') as any;
                    if (chatkitElement && typeof chatkitElement.setComposerValue === 'function') {
                      await chatkitElement.setComposerValue({ text: "I have an enhancement idea: " });
                      if (typeof chatkitElement.focusComposer === 'function') {
                        await chatkitElement.focusComposer();
                      }
                    } else {
                      // Fallback: try to find composer in shadow DOM
                      const shadow = chatkitElement?.shadowRoot;
                      if (shadow) {
                        const composer = shadow.querySelector('[role="textbox"], [contenteditable="true"]') as HTMLElement;
                        if (composer) {
                          composer.textContent = "I have an enhancement idea: ";
                          composer.dispatchEvent(new Event('input', { bubbles: true }));
                          composer.focus();
                        }
                      }
                    }
                  } catch (error) {
                    console.error('[AssistantWithForm] Failed to set composer value:', error);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-normal transition-all duration-150 border border-gray-200 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] flex items-center gap-3 text-left justify-start whitespace-nowrap"
                type="button"
              >
                <ChatKitIconBadge name="sparkle" />
                <span className="text-sm font-normal text-gray-600">Enhancement idea</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    // Access the ChatKit web component directly
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chatkitElement = document.querySelector('openai-chatkit') as any;
                    if (chatkitElement && typeof chatkitElement.setComposerValue === 'function') {
                      await chatkitElement.setComposerValue({ text: "Something's not working as expected: " });
                      if (typeof chatkitElement.focusComposer === 'function') {
                        await chatkitElement.focusComposer();
                      }
                    } else {
                      // Fallback: try to find composer in shadow DOM
                      const shadow = chatkitElement?.shadowRoot;
                      if (shadow) {
                        const composer = shadow.querySelector('[role="textbox"], [contenteditable="true"]') as HTMLElement;
                        if (composer) {
                          composer.textContent = "Something's not working as expected: ";
                          composer.dispatchEvent(new Event('input', { bubbles: true }));
                          composer.focus();
                        }
                      }
                    }
                  } catch (error) {
                    console.error('[AssistantWithForm] Failed to set composer value:', error);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-normal transition-all duration-150 border border-gray-200 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] flex items-center gap-3 text-left justify-start whitespace-nowrap"
                type="button"
              >
                <ChatKitIconBadge name="bug" />
                <span className="text-sm font-normal text-gray-600">Something&apos;s not working</span>
              </button>
              <button
                onClick={() => {
                  window.open('https://support.fyi.app/', '_blank', 'noopener,noreferrer');
                }}
                className="px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-normal transition-all duration-150 border border-gray-200 hover:border-gray-300 hover:shadow-sm active:scale-[0.98] flex items-center gap-3 text-left justify-start whitespace-nowrap"
                type="button"
              >
                <ChatKitIconBadge name="document" />
                <span className="text-sm font-normal text-gray-600">FYI Documentation</span>
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Zapier Form Section */}
      <div className="border-t border-gray-200 bg-gray-50 p-6">
        <div className="w-full px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Submit a support request</h2>
          
          {/* New conversation-based form (shown after bot responds) */}
          {hasBotResponded && (
            <div className="mb-6 flex flex-col items-start gap-4">
              <p className="text-gray-600 mb-4">
                Submit a support request from this conversation with additional details or attachments:
              </p>
              <button
                onClick={handleConversationFormClick}
                className="group flex items-center justify-between rounded-xl border bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md mb-4"
                style={{ borderColor: '#4ccf96' }}
              >
                <span className="text-lg font-semibold text-gray-900">
                  Submit a Support Request from this conversation
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
          
          {/* Original form (only shown before bot responds) */}
          {!hasBotResponded && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-gray-600 mb-4">
                Submit a support request without the assistant:
              </p>
              <button
                onClick={handleFormLinkClick}
                disabled={!iframeSrc}
                className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:border-gray-200"
              >
                <span className="text-lg font-semibold text-gray-900">
                  Support Request Form
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
          )}
        </div>
      </div>
      
      {/* Support Request Form Modal */}
      {isFormModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 overflow-y-auto"
          onClick={handleModalClose}
        >
          <div 
            className="relative w-full max-w-4xl mx-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Back Button */}
            <button
              onClick={handleModalClose}
              className="absolute -top-12 left-0 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-lg hover:bg-gray-50 transition-colors border border-gray-200 text-gray-700"
              aria-label="Go back to chat"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            
            {/* Form Component */}
            {submittedFormType ? (
              <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-xl p-10 text-center">
                <div className="flex flex-col items-center gap-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {submittedFormType === "conversation" ? "Conversation request sent" : "Support request sent"}
                    </h2>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                      {submittedFormType === "conversation"
                        ? "We attached this chat (and any files) to your ticket so the team has full context. We'll follow up via email soon."
                        : "Thanks for sharing the details. Our support team received your request and will reach out using the contact information you provided."}
                    </p>
                    <p className="text-sm text-gray-500 mt-4">
                      You can keep chatting with the assistant while we review your request.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <button
                      type="button"
                      onClick={() => setSubmittedFormType(null)}
                      className="flex-1 border border-gray-300 text-gray-700 font-semibold rounded-lg px-6 py-3 hover:bg-gray-50 transition-colors"
                    >
                      Submit another request
                    </button>
                    <button
                      type="button"
                      onClick={handleModalClose}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
                    >
                      Back to chat
                    </button>
                  </div>
                </div>
              </div>
            ) : isConversationForm ? (
              <ConversationSupportForm
                sessionId={sessionId}
                conversationId={conversationId}
                threadId={threadId}
                conversationLink={
                  conversationId
                    ? `https://platform.openai.com/logs/${conversationId}`
                    : sessionId
                    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/conversation/${sessionId}${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`
                    : undefined
                }
                metadata={metadata}
                firstName={firstName || metadata?.first_name || undefined}
                lastName={metadata?.last_name || undefined}
                onClose={handleModalClose}
                onSuccess={handleConversationFormSuccess}
              />
            ) : (
              <SupportRequestForm
                firstName={firstName}
                sessionId={sessionId}
                conversationId={conversationId}
                threadId={threadId}
                conversationLink={
                  conversationId
                    ? `https://platform.openai.com/logs/${conversationId}`
                    : sessionId
                    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/conversation/${sessionId}${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`
                    : undefined
                }
                metadata={metadata}
                onClose={handleModalClose}
                onSuccess={handleSupportFormSuccess}
              />
            )}
          </div>
        </div>
      )}
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

