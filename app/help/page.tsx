"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";
import type { ColorScheme } from "@/hooks/useColorScheme";

function HelpPageContent() {
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const chatKitRef = useRef<{ setComposerValue: (value: { text: string }) => Promise<void>; focusComposer: () => Promise<void> } | null>(null);
  const { scheme, setScheme } = useColorScheme();
  const searchParams = useSearchParams();

  // ChatKit start screen prompts - matching ChatKitPanel configuration
  const chatKitPrompts = [
    { label: "What can fyi do for me?", prompt: "What can fyi do for me?" },
    { label: "Tell me about the subscription plans", prompt: "Tell me about the subscription plans" },
    { label: "What's new with fyi?", prompt: "What's the latest with fyi?" },
  ];

  // Handle sending messages - use ChatKit's API
  const handleSendMessage = useCallback(async (text: string) => {
    const messageText = text.trim();
    if (!messageText || !chatKitRef.current) {
      console.warn("Cannot send message: ChatKit not ready", { hasControl: !!chatKitRef.current, text: messageText });
      return;
    }

    setHasStartedChat(true);
    setIsLoading(true);

    try {
      // Use ChatKit's API to set the composer value
      await chatKitRef.current.setComposerValue({ text: messageText });
      
      // Wait a moment for ChatKit to process
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Focus the composer - this makes ChatKit ready
      await chatKitRef.current.focusComposer();
      
      // Wait a bit more, then trigger Enter key to submit
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Trigger Enter key on ChatKit's web component to submit
      const wc = document.querySelector<HTMLElement>("openai-chatkit");
      if (wc) {
        const shadow = wc.shadowRoot;
        if (shadow) {
          // Find the iframe and send postMessage, or dispatch Enter event
          const iframe = shadow.querySelector('iframe.ck-iframe, iframe') as HTMLIFrameElement;
          if (iframe?.contentWindow) {
            // Try postMessage first
            iframe.contentWindow.postMessage({
              type: 'chatkit-submit',
              text: messageText
            }, '*');
          }
          
          // Also dispatch Enter event on web component as fallback
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
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
    }
  }, []);

  const handleChatKitReady = useCallback((chatkit: { setComposerValue: (value: { text: string }) => Promise<void>; focusComposer: () => Promise<void> }) => {
    chatKitRef.current = chatkit;
  }, []);

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[HelpPage] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    setIsLoading(false);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[HelpPage] response end");
    }
  }, []);

  // Check for query parameter on mount
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && chatKitRef.current) {
      handleSendMessage(q);
    }
  }, [searchParams, handleSendMessage]);

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

      {/* ChatKit - rendered normally, composer hidden, displays messages */}
      <div className="flex-1 border-t border-gray-200 overflow-hidden">
        <div className="h-[calc(100vh-500px)] min-h-[400px] max-h-[600px] w-full">
          <ChatKitPanel
            theme={scheme}
            onWidgetAction={handleWidgetAction}
            onResponseEnd={handleResponseEnd}
            onThemeRequest={setScheme}
            hideComposer={true}
            onChatKitReady={handleChatKitReady}
          />
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
