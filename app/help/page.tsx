"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";
import type { ColorScheme } from "@/hooks/useColorScheme";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

function HelpPageContent() {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { scheme, setScheme } = useColorScheme();
  const searchParams = useSearchParams();

  // ChatKit start screen prompts - matching ChatKitPanel configuration
  const chatKitPrompts = [
    { label: "What can fyi do for me?", prompt: "What can fyi do for me?" },
    { label: "Tell me about the subscription plans", prompt: "Tell me about the subscription plans" },
    { label: "What's new with fyi?", prompt: "What's the latest with fyi?" },
  ];

  // Get client secret for ChatKit
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
      throw new Error("Failed to create session");
    }

    const data = await response.json();
    return data.client_secret as string;
  }, []);

  // Initialize ChatKit in background (hidden)
  const chatkit = useChatKit({
    api: { getClientSecret },
    theme: {
      colorScheme: scheme,
      color: {
        grayscale: { hue: 220, tint: 6, shade: scheme === "dark" ? 1 : 4 },
        accent: { primary: "#4ccf96", level: 3 },
      },
      radius: "round",
    },
    onResponseStart: () => {
      setIsLoading(true);
    },
    onResponseEnd: () => {
      setIsLoading(false);
    },
  });

  // Watch ChatKit's shadow DOM for messages and update custom UI
  useEffect(() => {
    if (!chatkit.control) return;

    const extractMessages = () => {
      const wc = document.querySelector<HTMLElement>("openai-chatkit");
      const shadow = wc?.shadowRoot;
      if (!shadow) return;

      const threadItems = shadow.querySelectorAll('article[data-thread-turn]');
      const newMessages: Message[] = [];
      threadItems.forEach((item, index) => {
        const role = item.getAttribute("data-thread-turn") === "assistant" ? "assistant" : "user";
        // Get text content, avoiding thinking/workflow status messages
        const contentElements = item.querySelectorAll('p, div:not([data-thread-item="workflow"])');
        let content = "";
        contentElements.forEach((el) => {
          const text = el.textContent?.trim() || "";
          // Skip thinking status messages
          if (!text.match(/^Thought for \d+s$/i) && !text.match(/^Thinking\.\.\.?$/i)) {
            content += (content ? " " : "") + text;
          }
        });
        // Fallback to direct textContent if no paragraphs found
        if (!content) {
          content = item.textContent?.trim() || "";
        }
        if (content.trim() && !content.match(/^Thought for \d+s$/i)) {
          newMessages.push({
            id: `${role}-${index}-${item.getAttribute("data-thread-item-id") || Date.now()}`,
            role,
            content: content.trim(),
            timestamp: Date.now(),
          });
        }
      });
      if (newMessages.length > 0) {
        setMessages(newMessages);
      }
    };

    // Watch for changes in ChatKit's shadow DOM
    const observer = new MutationObserver(() => {
      extractMessages();
    });

    const checkChatKit = () => {
      const wc = document.querySelector<HTMLElement>("openai-chatkit");
      const shadow = wc?.shadowRoot;
      if (shadow) {
        extractMessages();
        observer.observe(shadow, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      } else {
        setTimeout(checkChatKit, 100);
      }
    };

    checkChatKit();

    return () => {
      observer.disconnect();
    };
  }, [chatkit.control]);

  // Hide ChatKit UI completely but keep it functional
  // Make it visible initially so it can render, then hide it after initialization
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "chatkit-hide-style";
    
    // Initially make it visible but off-screen so it can render
    style.textContent = `
      openai-chatkit {
        position: fixed !important;
        top: -10000px !important;
        left: -10000px !important;
        width: 600px !important;
        height: 800px !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        overflow: visible !important;
        z-index: -9999 !important;
        visibility: visible !important;
      }
    `;
    document.head.appendChild(style);
    
    // After a delay, ensure it stays hidden but rendered
    const timer = setTimeout(() => {
      if (document.getElementById("chatkit-hide-style")) {
        style.textContent = `
          openai-chatkit {
            position: fixed !important;
            top: -10000px !important;
            left: -10000px !important;
            width: 600px !important;
            height: 800px !important;
            opacity: 0 !important;
            pointer-events: auto !important;
            overflow: visible !important;
            z-index: -9999 !important;
            visibility: hidden !important;
          }
        `;
      }
    }, 2000);
    
    return () => {
      clearTimeout(timer);
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Handle sending messages
  const handleSendMessage = useCallback(async (text: string) => {
    const messageText = text.trim();
    if (!messageText || !chatkit.control) {
      console.warn("Cannot send message: no control or empty text", { hasControl: !!chatkit.control, text: messageText });
      return;
    }

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // First, ensure ChatKit is fully loaded
      const waitForChatKit = (): Promise<HTMLElement> => {
        return new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 100; // 10 seconds
          
          const check = () => {
            attempts++;
            const wc = document.querySelector<HTMLElement>("openai-chatkit");
            if (wc && wc.shadowRoot) {
              resolve(wc);
              return;
            }
            if (attempts >= maxAttempts) {
              reject(new Error("ChatKit not found"));
              return;
            }
            setTimeout(check, 100);
          };
          check();
        });
      };

      const wc = await waitForChatKit();
      const shadow = wc.shadowRoot!;
      
      // ChatKit uses an iframe - need to access iframe content
      const iframe = shadow.querySelector('iframe.ck-iframe, iframe') as HTMLIFrameElement;
      if (!iframe) {
        throw new Error("ChatKit iframe not found");
      }
      
      // Wait for iframe to load
      await new Promise<void>((resolve) => {
        if (iframe.contentDocument?.readyState === 'complete') {
          resolve();
        } else {
          iframe.onload = () => resolve();
          setTimeout(() => resolve(), 2000); // Timeout after 2s
        }
      });
      
      // Try to access iframe document
      let iframeDoc: Document | null = null;
      try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
      } catch (e) {
        console.warn('[ChatKit] Cannot access iframe content (might be cross-origin)');
      }
      
      if (iframeDoc && messages.length === 0) {
        // CRITICAL: ChatKit needs a thread started before composer appears
        // Try to trigger start screen prompt to initialize thread
        const startScreenSelectors = [
          '[data-start-screen-prompt]',
          'button[data-prompt]',
          '[role="button"][data-kind="prompt"]',
          'button',
          '[role="button"]',
        ];
        
        let startScreenPrompt: HTMLElement | null = null;
        for (const selector of startScreenSelectors) {
          const prompts = iframeDoc.querySelectorAll(selector);
          if (prompts.length > 0) {
            startScreenPrompt = prompts[0] as HTMLElement;
            if (startScreenPrompt.offsetParent !== null || startScreenPrompt.getBoundingClientRect().width > 0) {
              console.log(`[ChatKit] Found start screen prompt in iframe with selector: ${selector}`);
              break;
            }
          }
        }
        
        if (startScreenPrompt) {
          console.log('[ChatKit] Clicking start screen prompt to initialize thread...');
          startScreenPrompt.click();
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for thread to initialize
        }
      }
      
      // Set the composer value
      await chatkit.setComposerValue({ text: messageText });
      await new Promise(resolve => setTimeout(resolve, 500)); // Give more time for composer to appear
      
      // Wait for ChatKit to be ready and find the composer using MutationObserver
      const findAndSubmit = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 100; // 10 seconds total
          
          const trySubmit = () => {
            attempts++;
            if (attempts > maxAttempts) {
              console.error("Failed to find ChatKit composer after max attempts");
              setIsLoading(false);
              reject(new Error("Composer not found"));
              return;
            }

            // ChatKit uses an iframe! We need to access the iframe's content
            const iframe = shadow.querySelector('iframe.ck-iframe, iframe') as HTMLIFrameElement;
            
            if (!iframe) {
              console.warn(`[ChatKit] No iframe found in shadow DOM`);
              setTimeout(trySubmit, 200);
              return;
            }
            
            // Debug: log iframe info
            if (attempts === 1 || attempts % 10 === 0) {
              console.log(`[ChatKit Debug] Attempt ${attempts}, iframe found:`, {
                src: iframe.src,
                contentWindow: !!iframe.contentWindow,
                contentDocument: !!iframe.contentDocument,
              });
            }
            
            // Try to access iframe content (might be same-origin or cross-origin)
            let iframeDoc: Document | null = null;
            try {
              iframeDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
            } catch (e) {
              // Cross-origin - can't access directly
              console.warn('[ChatKit] Iframe is cross-origin, cannot access content directly');
              // Try using postMessage API instead
              if (iframe.contentWindow) {
                // Send message to iframe to trigger submit
                iframe.contentWindow.postMessage({ type: 'chatkit-submit', text: messageText }, '*');
                console.log('[ChatKit] Sent postMessage to iframe');
                resolve();
                return;
              }
              setTimeout(trySubmit, 200);
              return;
            }
            
            if (!iframeDoc) {
              // Iframe not loaded yet
              setTimeout(trySubmit, 200);
              return;
            }
            
            // Try multiple selectors to find composer INSIDE the iframe
            const composerSelectors = [
              '[role="textbox"]',
              '[contenteditable="true"]',
              'textarea',
              'input[type="text"]',
              '[data-composer]',
              'form [contenteditable]',
              'form textarea',
              'form input[type="text"]',
              '[part*="composer"]',
              '[data-part*="composer"]',
            ];
            
            let composer: HTMLElement | null = null;
            for (const selector of composerSelectors) {
              composer = iframeDoc.querySelector(selector) as HTMLElement;
              if (composer) {
                console.log(`[ChatKit] Found composer in iframe with selector: ${selector}`);
                break;
              }
            }
            
            if (composer) {
              // Found it! Now submit
              (async () => {
                try {
                  composer!.focus();
                  
                  // Wait a moment for focus
                  await new Promise(resolve => setTimeout(resolve, 50));
                  
                  // Set value directly
                  if (composer!.tagName === 'INPUT' || composer!.tagName === 'TEXTAREA') {
                    (composer as HTMLInputElement | HTMLTextAreaElement).value = messageText;
                    // Trigger input event
                    composer!.dispatchEvent(new Event('input', { bubbles: true }));
                  } else if (composer!.contentEditable === 'true') {
                    composer!.textContent = messageText;
                    composer!.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  
                  // Wait a bit more
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  // Try Enter key press (keydown + keyup + keypress)
                  const enterDown = new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                  });
                  composer!.dispatchEvent(enterDown);
                  
                  const enterPress = new KeyboardEvent("keypress", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                  });
                  composer!.dispatchEvent(enterPress);
                  
                  const enterUp = new KeyboardEvent("keyup", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                  });
                  composer!.dispatchEvent(enterUp);

                  // Also try to find and click submit button
                  await new Promise(resolve => setTimeout(resolve, 50));
                  const submitSelectors = [
                    'button[type="submit"]',
                    'button[aria-label*="send" i]',
                    'button[aria-label*="Send" i]',
                    'button[aria-label*="submit" i]',
                    'button:has(svg)',
                    '[role="button"][aria-label*="send" i]',
                  ];
                  
                  for (const selector of submitSelectors) {
                    const submitButton = iframeDoc.querySelector(selector) as HTMLElement;
                    if (submitButton && submitButton.offsetParent !== null) {
                      submitButton.click();
                      break;
                    }
                  }
                } catch (e) {
                  console.warn("Error submitting via composer:", e);
                }
                
                resolve();
              })();
            } else {
              // If composer not found, try clicking start screen prompt to initialize thread (inside iframe)
              if (attempts === 1 && iframeDoc) {
                const startScreenPrompts = iframeDoc.querySelectorAll('[data-start-screen-prompt], button[data-prompt], [role="button"][data-kind="prompt"], button');
                if (startScreenPrompts.length > 0) {
                  // Click any button to potentially initialize the thread
                  (startScreenPrompts[0] as HTMLElement).click();
                  // After clicking, wait and try to find composer again
                  setTimeout(() => {
                    setTimeout(trySubmit, 200);
                  }, 500);
                  return;
                }
              }
              
              // Use MutationObserver to watch for composer to appear INSIDE the iframe
              if (iframeDoc) {
                const observer = new MutationObserver(() => {
                  let newComposer: HTMLElement | null = null;
                  for (const selector of composerSelectors) {
                    newComposer = iframeDoc!.querySelector(selector) as HTMLElement;
                    if (newComposer) break;
                  }
                  
                  if (newComposer) {
                    observer.disconnect();
                    // Retry submit with the new composer
                    setTimeout(async () => {
                      try {
                        newComposer!.focus();
                        await new Promise(resolve => setTimeout(resolve, 50));
                        if (newComposer!.tagName === 'INPUT' || newComposer!.tagName === 'TEXTAREA') {
                          (newComposer as HTMLInputElement | HTMLTextAreaElement).value = messageText;
                        } else if (newComposer!.contentEditable === 'true') {
                          newComposer!.textContent = messageText;
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const enterDown = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true });
                        newComposer!.dispatchEvent(enterDown);
                        const submitButton = iframeDoc!.querySelector('button[type="submit"], button[aria-label*="send" i]') as HTMLElement;
                        if (submitButton) {
                          submitButton.click();
                        }
                      } catch (e) {
                        console.warn("Error in MutationObserver submit:", e);
                      }
                      resolve();
                    }, 100);
                  }
                });
                
                observer.observe(iframeDoc, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['role', 'contenteditable'],
                });
              }
              
              // Also continue polling as fallback
              setTimeout(trySubmit, 200);
            }
          };

          trySubmit();
        });
      };

      await findAndSubmit();
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
    }
  }, [chatkit]);

  // Check for query parameter on mount
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && chatkit.control) {
      handleSendMessage(q);
    }
  }, [searchParams, chatkit.control, handleSendMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      await handleSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    await handleSendMessage(suggestion);
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header Section - Always Visible */}
      <div className="flex flex-col items-center px-4 pt-12 pb-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Main Title */}
          <h1 className="text-center text-3xl font-semibold text-gray-900">
            How can I help you today?
          </h1>

          {/* Custom Chat Messages Display - Above Input */}
          {messages.length > 0 && (
            <div className="border-t border-gray-200 overflow-hidden">
              <div
                ref={chatContainerRef}
                className="max-h-[400px] overflow-y-auto px-4 py-6"
              >
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-3 ${
                          message.role === "user"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-4 py-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chat Input Area */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-center rounded-2xl border border-gray-300 bg-white px-4 py-4 shadow-sm transition-shadow focus-within:border-gray-400 focus-within:shadow-md">
              {/* Smiley Icon */}
              <svg
                className="mr-3 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>

              {/* Input Field */}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything about FYI..."
                className="flex-1 border-none bg-transparent text-gray-900 placeholder-gray-400 outline-none"
                disabled={isLoading}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </button>
            </div>

            {/* Gradient Strip */}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full">
              <div className="h-full w-full bg-gradient-to-r from-purple-300 via-purple-200 to-green-200 opacity-50"></div>
            </div>
          </form>

          {/* ChatKit Start Screen Prompts - Using same prompts as ChatKitPanel */}
          {messages.length === 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {chatKitPrompts.map((prompt) => (
                <button
                  key={prompt.label}
                  onClick={() => handleSuggestionClick(prompt.prompt)}
                  disabled={isLoading}
                  className="group relative rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hidden ChatKit component for API access only - must be rendered for API to work */}
      {/* Give it proper size so shadow DOM and composer initialize properly */}
      <div style={{ position: "fixed", top: "-10000px", left: "-10000px", width: "600px", height: "800px", overflow: "visible", opacity: 1, visibility: "visible", pointerEvents: "auto", zIndex: -9999 }}>
        {chatkit.control && <ChatKit control={chatkit.control} />}
      </div>

      {/* Bottom Information Cards - Always visible */}
      <div className="flex flex-col items-center px-4 pb-12">
        <div className="w-full max-w-2xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Submit a Support Request Card */}
            <div className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Submit a Support Request
                </h2>
                <svg
                  className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1"
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
              </div>
              <p className="mt-2 text-sm text-gray-500">
                This form allows to submit a request and attach files or
                screenshots.
              </p>
            </div>

            {/* Help Centre articles Card */}
            <div className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md cursor-pointer">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Help Centre articles
                </h2>
                <svg
                  className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1"
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
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Consult our help articles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <HelpPageContent />
    </Suspense>
  );
}
