"use client";

import { useCallback, Suspense, useEffect, useRef } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";
import { sanitizeCitationsDeep, ensureGlobalCitationObserver } from "@/lib/sanitizeCitations";
import Image from "next/image";

function HelpPageContent() {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const getClientSecret = useCallback(async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;

    console.log("[HelpPage] Creating ChatKit session...");
    
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
      console.error("[HelpPage] Session creation failed:", response.status, errorText);
      throw new Error("Failed to create session: " + response.status);
    }

    const data = await response.json();
    console.log("[HelpPage] Session created successfully");
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
      greeting: "Do you need help with any particular topic?",
      prompts: [
        { label: "Help with feature", prompt: "I need help with this feature: ", icon: "circle-question" },
        { label: "Enhancement idea", prompt: "I have an enhancement idea", icon: "lightbulb" },
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

  // Log when ChatKit control is ready
  useEffect(() => {
    if (chatkit.control) {
      console.log("[HelpPage] ChatKit control is ready!");
    } else {
      console.log("[HelpPage] Waiting for ChatKit control...");
    }
  }, [chatkit.control]);

  // Custom styling to make ChatKit look clean and full-page
  useEffect(() => {
    ensureGlobalCitationObserver();
  }, []);

  useEffect(() => {
    const rootNode = chatContainerRef.current;
    if (!rootNode) return;

    const applyStyles = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) return;

        if (!shadow.querySelector('style[data-fyi-fullpage]')) {
          const style = document.createElement('style');
          style.setAttribute('data-fyi-fullpage', '1');
          style.textContent = `
            /* Clean full-page styling */
            :host {
              --font-text-md-size: 0.9375rem;
              --color-surface: #ffffff !important;
              --color-surface-background: #ffffff !important;
              --color-surface-secondary: #ffffff !important;
              --color-surface-tertiary: #ffffff !important;
              --color-surface-elevated: #ffffff !important;
              --color-surface-elevated-secondary: #ffffff !important;
              --color-background: #ffffff !important;
              background: #ffffff !important;
              display: flex !important;
              flex-direction: column !important;
              height: 100% !important;
              width: 100% !important;
            }
            
            /* Ensure inner container takes full space with white background */
            [data-kind="chat-container"],
            [data-part="container"] {
              height: 100% !important;
              display: flex !important;
              flex-direction: column !important;
              background: #ffffff !important;
            }
            
            /* White background for start screen and main areas */
            [data-kind="start-screen"],
            [data-part="start-screen"],
            main,
            [role="main"] {
              background: #ffffff !important;
            }
            
            /* Force white background on surface elements */
            .bg-\\(--color-surface\\) {
              background-color: #ffffff !important;
            }
            
            /* Fix composer field background - target specific classes */
            .ifWRv,
            .bOsG1,
            ._6-Awz,
            .fPqy-,
            .PMelk,
            .Pn-ne,
            .j124x,
            .GXmxh,
            .yVugO {
              background: #ffffff !important;
              background-color: #ffffff !important;
            }
            
            /* Composer textarea */
            #chatkit-composer-input,
            textarea._6-Awz,
            textarea.fPqy- {
              background: #ffffff !important;
              background-color: #ffffff !important;
              color: #0f172a !important;
            }
            
            /* All composer elements */
            [data-kind="composer"],
            [data-part="composer"],
            [data-part*="composer"],
            form,
            form *,
            [role="textbox"],
            [contenteditable="true"],
            textarea,
            input,
            input[type="text"] {
              background: #ffffff !important;
              background-color: #ffffff !important;
              color: #0f172a !important;
            }
            
            /* Composer container and all children */
            [data-part*="composer-container"],
            [data-part*="composer-container"] *,
            form[data-part*="composer"],
            form[data-part*="composer"] * {
              background: #ffffff !important;
              background-color: #ffffff !important;
            }
            
            /* Make start screen greeting larger and centered */
            [data-kind="start-screen"] h1,
            [data-part*="greeting"] {
              font-size: 2rem !important;
              text-align: center !important;
            }
            
            /* Style the prompts to match the design */
            [data-kind="start-screen"] button {
              border-radius: 0.5rem !important;
              padding: 0.625rem 1rem !important;
            }
          `;
          shadow.appendChild(style);
        }
      } catch (e) {
        console.debug('[HelpPage] style injection error:', e);
      }
    };

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
        const iframes = shadow.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
          try {
            const doc = iframe.contentDocument;
            if (doc) {
              sanitizeCitationsDeep(doc);
            }
          } catch {}
        });
      } catch (e) {
        console.debug('[HelpPage] sanitize shadow error:', e);
      }
    };

    const debouncedSanitize = () => {
      if (sanitizeTimeout !== null) {
        clearTimeout(sanitizeTimeout);
      }
      sanitizeShadow();
      sanitizeTimeout = window.setTimeout(() => {
        sanitizeShadow();
        sanitizeTimeout = null;
      }, 50);
    };

    let mo: MutationObserver | null = null;
    let sanitizeInterval: number | null = null;
    const attachObserver = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) {
          requestAnimationFrame(attachObserver);
          return;
        }
        try {
          mo?.disconnect();
          if (sanitizeInterval !== null) {
            clearInterval(sanitizeInterval);
          }
        } catch {}
        applyStyles();
        sanitizeShadow();
        mo = new MutationObserver(() => {
          applyStyles();
          debouncedSanitize();
        });
        mo.observe(shadow, { childList: true, subtree: true });
        // Also run periodically during active streaming (every 200ms)
        sanitizeInterval = window.setInterval(() => {
          sanitizeShadow();
        }, 200);
      } catch (e) {
        console.debug('[HelpPage] style observer error:', e);
      }
    };

    attachObserver();
    return () => {
      if (sanitizeTimeout !== null) {
        clearTimeout(sanitizeTimeout);
      }
      if (sanitizeInterval !== null) {
        clearInterval(sanitizeInterval);
      }
      try {
        mo?.disconnect();
      } catch {}
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header with Logo */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <Image 
            src="/FYI_Logo_Colour.png" 
            alt="FYI Logo" 
            width={40} 
            height={13}
            style={{ height: 'auto' }}
            priority
          />
          <h1 className="text-xl font-semibold text-gray-900">FYI Support Assistant</h1>
          <div style={{ width: '120px' }}></div>
        </div>
      </header>

      {/* Main Chat Area - Full Page */}
      <div className="flex flex-1 flex-col items-center bg-white">
        <div className="w-full max-w-5xl flex-1 flex flex-col px-4 py-8">
          <div 
            ref={chatContainerRef}
            className="w-full flex-1 flex flex-col"
            style={{ minHeight: '600px', height: '100%' }}
          >
            {chatkit.control ? (
              <div 
                className="w-full h-full" 
                style={{ 
                  minHeight: '600px', 
                  display: 'flex', 
                  flexDirection: 'column',
                  background: 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                <ChatKit 
                  control={chatkit.control}
                  style={{ 
                    width: '100%', 
                    height: '100%',
                    minHeight: '600px',
                    display: 'block',
                    flex: 1,
                    background: 'white'
                  }}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 text-gray-600">Loading chat assistant...</div>
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Information Cards */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Submit a Support Request Card */}
            <a
              href="https://support.fyi.app/"
              target="_blank"
              rel="noopener noreferrer"
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
            </a>

            {/* Help Centre articles Card */}
            <a
              href="https://support.fyi.app/"
              target="_blank"
              rel="noopener noreferrer"
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
            </a>
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
