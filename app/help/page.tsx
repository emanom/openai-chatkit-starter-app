"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";

function HelpPageContent() {
  const [inputValue, setInputValue] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  const { scheme, setScheme } = useColorScheme();
  const searchParams = useSearchParams();

  // Check for query parameter on mount
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setInitialQuery(q);
      setShowChat(true);
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setInitialQuery(inputValue.trim());
      setShowChat(true);
      setInputValue(""); // Clear input
    } else {
      setInitialQuery(undefined);
      setShowChat(true);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInitialQuery(suggestion);
    setShowChat(true);
  };

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[HelpPage] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[HelpPage] response end");
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {!showChat ? (
        // Initial landing view
        <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl space-y-8">
            {/* Main Title */}
            <h1 className="text-center text-3xl font-semibold text-gray-900">
              How can I help you today?
            </h1>

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
                />

                {/* Send Button */}
                <button
                  type="submit"
                  className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-800"
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

            {/* Suggestion Buttons */}
            <div className="flex flex-wrap justify-center gap-3">
              {[
                "Help with feature",
                "Enhancement idea",
                "Something's not working",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:border-gray-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Bottom Information Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Submit a Support Request Card */}
              <Link
                href="/support"
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
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
              </Link>

              {/* Help Centre articles Card */}
              <Link
                href="/help-centre"
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
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
              </Link>
            </div>
          </div>
        </div>
      ) : (
        // Chat view - embedded inline
        <div className="flex h-screen flex-col">
          <div className="h-full w-full">
            <ChatKitPanel
              theme={scheme}
              onWidgetAction={handleWidgetAction}
              onResponseEnd={handleResponseEnd}
              onThemeRequest={setScheme}
              initialQuery={initialQuery}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <HelpPageContent />
    </Suspense>
  );
}

