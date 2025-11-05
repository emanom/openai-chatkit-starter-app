"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useColorScheme } from "@/hooks/useColorScheme";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";
import type { ColorScheme } from "@/hooks/useColorScheme";

function HelpPageContent() {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const { scheme, setScheme } = useColorScheme();
  const searchParams = useSearchParams();

  // ChatKit start screen prompts
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

  // Initialize ChatKit
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
    startScreen: {
      greeting: "How can I help you today?",
      prompts: chatKitPrompts.map(p => ({ label: p.label, prompt: p.prompt, icon: "sparkle" as const })),
    },
    onResponseStart: () => {
      setIsLoading(true);
    },
    onResponseEnd: () => {
      setIsLoading(false);
    },
  });

  // Sync custom input with ChatKit's composer
  useEffect(() => {
    if (!chatkit.control) return;

    const syncInput = async () => {
      // When user types in custom input, sync to ChatKit's composer
      if (customInputRef.current) {
        const value = customInputRef.current.value;
        try {
          await chatkit.setComposerValue({ text: value });
        } catch (e) {
          // Ignore errors
        }
      }
    };

    const input = customInputRef.current;
    if (input) {
      input.addEventListener("input", syncInput);
      return () => {
        input.removeEventListener("input", syncInput);
      };
    }
  }, [chatkit.control, chatkit]);

  // Style ChatKit: Hide composer and start screen, keep messages visible
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "chatkit-custom-styles";
    style.textContent = `
      /* Hide ChatKit's start screen completely (we have our own) */
      openai-chatkit [data-start-screen],
      openai-chatkit [data-kind="start-screen"] {
        display: none !important;
      }
      
      /* Hide ChatKit's composer completely (we use custom input) */
      openai-chatkit [part*="composer"],
      openai-chatkit [data-part*="composer"],
      openai-chatkit form[part*="composer"],
      openai-chatkit form[data-part*="composer"],
      openai-chatkit [role="textbox"],
      openai-chatkit [contenteditable="true"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Keep ChatKit messages visible and styled */
      openai-chatkit {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Handle sending messages
  const handleSendMessage = useCallback(async (text: string) => {
    const messageText = text.trim();
    if (!messageText || !chatkit.control) {
      return;
    }

    setHasStartedChat(true);
    setIsLoading(true);

    try {
      // Set ChatKit's composer value
      await chatkit.setComposerValue({ text: messageText });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Focus and submit
      await chatkit.focusComposer();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Trigger Enter key on ChatKit
      const wc = document.querySelector<HTMLElement>("openai-chatkit");
      if (wc) {
        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        wc.dispatchEvent(enterEvent);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
    }
  }, [chatkit]);

  // Check for query parameter
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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header Section - Always Visible */}
      <div className="flex flex-col items-center px-4 pt-12 pb-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Main Title */}
          <h1 className="text-center text-3xl font-semibold text-gray-900">
            How can I help you today?
          </h1>

          {/* Custom Input Area - Syncs with ChatKit's composer */}
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
                ref={customInputRef}
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

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start px-4">
              <div className="bg-gray-100 rounded-lg px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                </div>
              </div>
            </div>
          )}

          {/* ChatKit Start Screen Prompts */}
          {!hasStartedChat && (
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

      {/* ChatKit - Rendered with custom styling */}
      <div className="flex-1 border-t border-gray-200 overflow-hidden">
        <div className="h-[calc(100vh-500px)] min-h-[400px] max-h-[600px] w-full">
          {chatkit.control && (
            <ChatKit control={chatkit.control} />
          )}
        </div>
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
