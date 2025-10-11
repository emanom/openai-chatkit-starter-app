"use client";

import { useCallback, useState, useEffect } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
  const [isOpen, setIsOpen] = useState(false);
  
  // Log modal state changes
  useEffect(() => {
    console.info("[App] Modal isOpen:", isOpen);
  }, [isOpen]);

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ChatKitPanel] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ChatKitPanel] response end");
    }
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6 py-6 dark:bg-slate-950">
      {/* Launcher button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 rounded-full bg-slate-900 px-4 py-3 text-white shadow-lg transition-colors hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
      >
        Open chat
      </button>

      {/* Chat modal */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="relative z-10 h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 rounded-md bg-white/60 px-2 py-1 text-sm text-slate-700 shadow hover:bg-white dark:bg-slate-800/60 dark:text-slate-200"
            >
              Close
            </button>
            <div className="h-full w-full">
              <ChatKitPanel
                theme={scheme}
                onWidgetAction={handleWidgetAction}
                onResponseEnd={handleResponseEnd}
                onThemeRequest={setScheme}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
