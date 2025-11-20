"use client";

import { useCallback, Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useSearchParams } from "next/navigation";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";

function AssistantPageContent() {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const [firstNameFromParent, setFirstNameFromParent] = useState<string | null>(null);
  
  // Get first-name from query parameters (try multiple variations)
  const firstNameFromUrlRaw = searchParams.get("first-name") || 
                               searchParams.get("firstName") ||
                               searchParams.get("firstname");
  
  // Filter out template variables (like {{input.first-name}}, {{query.firstname}}, etc. from Zapier)
  const isTemplateVariable = firstNameFromUrlRaw && (
    firstNameFromUrlRaw.includes('{{') || 
    firstNameFromUrlRaw.includes('}}') ||
    firstNameFromUrlRaw.startsWith('{{') ||
    firstNameFromUrlRaw.endsWith('}}')
  );
  
  const firstNameFromUrl = isTemplateVariable ? null : firstNameFromUrlRaw;
  
  // Read firstName from cookie set by middleware (from Referer header)
  useEffect(() => {
    console.log('[AssistantPage] Checking for cookie, firstNameFromUrl:', firstNameFromUrl);
    console.log('[AssistantPage] All cookies:', document.cookie);
    
    if (!firstNameFromUrl && typeof document !== 'undefined') {
      const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('assistant-first-name='))
        ?.split('=')[1];
      
      console.log('[AssistantPage] Cookie value found:', cookieValue);
      
      if (cookieValue) {
        const decoded = decodeURIComponent(cookieValue);
        console.log('[AssistantPage] Decoded cookie value:', decoded);
        if (decoded && !decoded.includes('{{')) {
          console.log('[AssistantPage] Setting firstName from cookie:', decoded);
          setFirstNameFromParent(decoded);
        } else {
          console.log('[AssistantPage] Cookie contains template variable, ignoring');
        }
      } else {
        console.log('[AssistantPage] No assistant-first-name cookie found');
      }
    }
  }, [firstNameFromUrl]);
  
  // If we're in an iframe and don't have valid URL params, try to read from parent window URL
  useEffect(() => {
    // Only try if we don't already have a valid firstName from URL or cookie
    if (!firstNameFromUrl && !firstNameFromParent && typeof window !== 'undefined') {
      // Method 0: Check URL hash fragment (not sent to server but available client-side)
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashFirstName = hashParams.get('first-name') || hashParams.get('firstName') || hashParams.get('firstname');
          if (hashFirstName && !hashFirstName.includes('{{')) {
            console.log('[AssistantPage] Found firstName in URL hash:', hashFirstName);
            setFirstNameFromParent(hashFirstName);
            return;
          }
        } catch (e) {
          console.debug('[AssistantPage] Error reading hash params:', e);
        }
      }
      
      // Method 1: Try to access parent window's URL directly (works if same origin)
      if (window.self !== window.top) {
        try {
          const parentParams = new URLSearchParams(window.parent.location.search);
          const parentFirstName = parentParams.get('first-name') || 
                                 parentParams.get('first_name') ||
                                 parentParams.get('firstName') ||
                                 parentParams.get('firstname');
          if (parentFirstName) {
            console.log('[AssistantPage] Found firstName in parent URL:', parentFirstName);
            setFirstNameFromParent(parentFirstName);
            return;
          }
        } catch (e) {
          // Cross-origin restriction - expected if parent is on different domain
          console.debug('[AssistantPage] Cannot access parent URL (cross-origin):', e);
        }
      }
      
      // Method 2: Try document.referrer (works even with cross-origin, but query params are stripped)
      try {
        const referrer = document.referrer;
        console.log('[AssistantPage] document.referrer:', referrer);
        if (referrer) {
          const referrerUrl = new URL(referrer);
          const referrerParams = new URLSearchParams(referrerUrl.search);
          const referrerFirstName = referrerParams.get('first-name') || 
                                   referrerParams.get('first_name') ||
                                   referrerParams.get('firstName') ||
                                   referrerParams.get('firstname');
          console.log('[AssistantPage] firstName from referrer:', referrerFirstName);
          if (referrerFirstName) {
            setFirstNameFromParent(referrerFirstName);
            return;
          }
        }
      } catch (e) {
        console.debug('[AssistantPage] Error reading referrer:', e);
      }
      
      // Method 3: Try to extract from parent page's __NEXT_DATA__ script tag (Zapier stores query params there)
      if (window.self !== window.top) {
        try {
          const parentDoc = window.parent.document;
          const nextDataScript = parentDoc.querySelector('script#__NEXT_DATA__');
          console.log('[AssistantPage] Attempting to read parent __NEXT_DATA__ script tag');
          console.log('[AssistantPage] Parent document accessible:', !!parentDoc);
          console.log('[AssistantPage] Script tag found:', !!nextDataScript);
          
          if (nextDataScript && nextDataScript.textContent) {
            const nextData = JSON.parse(nextDataScript.textContent);
            console.log('[AssistantPage] Parsed __NEXT_DATA__:', JSON.stringify(nextData?.props?.pageProps?.query || {}, null, 2));
            
            const queryParams = nextData?.props?.pageProps?.query || {};
            const zapierFirstName = queryParams['first-name'] || 
                                   queryParams['firstName'] || 
                                   queryParams['firstname'] ||
                                   queryParams['first_name'];
            console.log('[AssistantPage] Found firstName in parent __NEXT_DATA__:', zapierFirstName);
            
            if (zapierFirstName && !zapierFirstName.includes('{{') && typeof zapierFirstName === 'string') {
              console.log('[AssistantPage] Setting firstName from __NEXT_DATA__:', zapierFirstName);
              setFirstNameFromParent(zapierFirstName);
              return;
            } else {
              console.log('[AssistantPage] firstName from __NEXT_DATA__ is invalid or contains template variable');
            }
          } else {
            console.log('[AssistantPage] __NEXT_DATA__ script tag not found or empty');
          }
        } catch (e) {
          console.error('[AssistantPage] Cannot access parent __NEXT_DATA__ (cross-origin or not found):', e);
          console.error('[AssistantPage] Error details:', e.message);
        }
      }
      
      // Method 4: Try API endpoint that reads Referer header (servers can see full referer)
      if (window.self !== window.top) {
        fetch('/api/get-parent-params')
          .then(res => res.json())
          .then(data => {
            console.log('[AssistantPage] Parent params from API:', JSON.stringify(data, null, 2));
            console.log('[AssistantPage] API params object:', data.params);
            console.log('[AssistantPage] API referer:', data.referer);
            if (data.params && (data.params['first-name'] || data.params['first_name'] || data.params['firstname'])) {
              const apiFirstName = data.params['first-name'] || data.params['first_name'] || data.params['firstname'];
              console.log('[AssistantPage] Found firstName in API params:', apiFirstName);
              if (apiFirstName && !apiFirstName.includes('{{')) {
                console.log('[AssistantPage] Setting firstName from API:', apiFirstName);
                setFirstNameFromParent(apiFirstName);
              } else {
                console.log('[AssistantPage] firstName contains template variable, ignoring');
              }
            } else {
              console.log('[AssistantPage] No firstName found in API params');
            }
          })
          .catch(e => {
            console.error('[AssistantPage] Error fetching parent params:', e);
          });
      }
    }
  }, [firstNameFromUrl, firstNameFromParent]);
  
  // Also listen for postMessage from parent window (for embedding scenarios)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // For security, you might want to check event.origin
      if (event.data && typeof event.data === 'object') {
        if (event.data.firstName || event.data['first-name']) {
          setFirstNameFromParent(event.data.firstName || event.data['first-name']);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  // Use firstName from URL first, then from cookie/middleware, then from parent URL, then from postMessage
  const firstName = firstNameFromUrl || firstNameFromParent;
  
  // Create personalized greeting
  const greeting = useMemo(() => {
    if (firstName) {
      return `Hi ${firstName}! How can I help you today?`;
    }
    return "How can I help you today?";
  }, [firstName]);

  const getClientSecret = useCallback(async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;

    console.log("[AssistantPage] Creating ChatKit session...");
    
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
      console.error("[AssistantPage] Session creation failed:", response.status, errorText);
      throw new Error("Failed to create session: " + response.status);
    }

    const data = await response.json();
    console.log("[AssistantPage] Session created successfully");
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

  // Log when ChatKit control is ready
  useEffect(() => {
    if (chatkit.control) {
      console.log("[AssistantPage] ChatKit control is ready!");
    } else {
      console.log("[AssistantPage] Waiting for ChatKit control...");
    }
  }, [chatkit.control]);

  // Custom styling to make ChatKit look clean and full-page
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
        console.debug('[AssistantPage] style injection error:', e);
      }
    };

    let mo: MutationObserver | null = null;
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
        } catch {}
        applyStyles();
        mo = new MutationObserver(() => applyStyles());
        mo.observe(shadow, { childList: true, subtree: true });
      } catch (e) {
        console.debug('[AssistantPage] style observer error:', e);
      }
    };

    attachObserver();
    return () => {
      try {
        mo?.disconnect();
      } catch {}
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Main Chat Area - Full Page */}
      <div className="flex flex-1 flex-col bg-white">
        <div className="w-full flex-1 flex flex-col">
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
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <AssistantPageContent />
    </Suspense>
  );
}

