"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import type { UseChatKitOptions } from "@openai/chatkit-react";
import {
  STARTER_PROMPTS,
  PLACEHOLDER_INPUT,
  GREETING,
  CREATE_SESSION_ENDPOINT,
  WORKFLOW_ID,
  getThemeConfig,
} from "@/lib/config";
import { ErrorOverlay } from "./ErrorOverlay";
import type { ColorScheme } from "@/hooks/useColorScheme";

export type FactAction = {
  type: "save";
  factId: string;
  factText: string;
};

type ChatKitPanelProps = {
  theme: ColorScheme;
  onWidgetAction: (action: FactAction) => Promise<void>;
  onResponseEnd: () => void;
  onThemeRequest: (scheme: ColorScheme) => void;
};

type ErrorState = {
  script: string | null;
  session: string | null;
  integration: string | null;
  retryable: boolean;
};

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV !== "production";

const createInitialErrors = (): ErrorState => ({
  script: null,
  session: null,
  integration: null,
  retryable: false,
});

export function ChatKitPanel({
  theme,
  onWidgetAction,
  onResponseEnd,
  onThemeRequest,
}: ChatKitPanelProps) {
  const processedFacts = useRef(new Set<string>());
  const [errors, setErrors] = useState<ErrorState>(() => createInitialErrors());
  const [isInitializingSession, setIsInitializingSession] = useState(true);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false); // Track if initialization is in progress
  const lastSessionCreatedRef = useRef<number>(0); // Track last session creation time
  const cachedSecretRef = useRef<string | null>(null); // Cache the client secret
  const secretExpiresRef = useRef<number>(0); // Track when secret expires
  const hasActiveSessionRef = useRef<boolean>(false); // Tracks if a usable session exists
  const [scriptStatus, setScriptStatus] = useState<
    "pending" | "ready" | "error"
  >(() =>
    isBrowser && window.customElements?.get("openai-chatkit")
      ? "ready"
      : "pending"
  );
  const [widgetInstanceKey, setWidgetInstanceKey] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEnhancementFormOpen, setIsEnhancementFormOpen] = useState(false);
  const [enhancementTitle, setEnhancementTitle] = useState("");
  const [enhancementDescription, setEnhancementDescription] = useState("");
  const [enhancementPriority, setEnhancementPriority] = useState("Medium");
  const [enhancementImpact, setEnhancementImpact] = useState("");
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const responseStartRef = useRef<number>(0);
  const responseSeqRef = useRef<number>(0);

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    let timeoutId: number | undefined;

    const handleLoaded = () => {
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("ready");
      setErrorState({ script: null });
    };

    const handleError = (event: Event) => {
      if (isDev) console.error("Failed to load chatkit.js", event);
      if (!isMountedRef.current) {
        return;
      }
      setScriptStatus("error");
      const detail = (event as CustomEvent<unknown>)?.detail ?? "unknown error";
      setErrorState({ script: `Error: ${detail}`, retryable: false });
      setIsInitializingSession(false);
    };

    window.addEventListener("chatkit-script-loaded", handleLoaded);
    window.addEventListener(
      "chatkit-script-error",
      handleError as EventListener
    );

    if (window.customElements?.get("openai-chatkit")) {
      handleLoaded();
    } else if (scriptStatus === "pending") {
      timeoutId = window.setTimeout(() => {
        if (!window.customElements?.get("openai-chatkit")) {
          handleError(
            new CustomEvent("chatkit-script-error", {
              detail:
                "ChatKit web component is unavailable. Verify that the script URL is reachable.",
            })
          );
        }
      }, 5000);
    }

    return () => {
      window.removeEventListener("chatkit-script-loaded", handleLoaded);
      window.removeEventListener(
        "chatkit-script-error",
        handleError as EventListener
      );
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scriptStatus, setErrorState]);

  const isWorkflowConfigured = Boolean(
    WORKFLOW_ID && !WORKFLOW_ID.startsWith("wf_replace")
  );

  useEffect(() => {
    if (!isWorkflowConfigured && isMountedRef.current) {
      setErrorState({
        session: "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.",
        retryable: false,
      });
      setIsInitializingSession(false);
    }
  }, [isWorkflowConfigured, setErrorState]);

  const handleResetChat = useCallback(() => {
    processedFacts.current.clear();
    isInitializingRef.current = false; // Reset initialization flag on reset
    lastSessionCreatedRef.current = 0; // Reset cooldown timer
    cachedSecretRef.current = null; // Clear cached secret
    secretExpiresRef.current = 0; // Clear expiration
    if (isBrowser) {
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, []);

  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      if (isDev) {
        console.info("[ChatKitPanel] getClientSecret", {
          hasCurrent: Boolean(currentSecret),
          hasCached: Boolean(cachedSecretRef.current),
        });
      }

      // CRITICAL: If ChatKit is passing us an existing secret, validate and return it!
      // ChatKit will pass the current secret when it wants to reuse the same session
      if (currentSecret) {
        console.info("[ChatKitPanel] ✅ ChatKit provided existing secret, returning it to maintain session continuity");
        // Store it in our cache for future use
        cachedSecretRef.current = currentSecret;
        if (!secretExpiresRef.current || secretExpiresRef.current < Date.now()) {
          // Set a reasonable expiration if we don't have one (5 minutes from now)
          secretExpiresRef.current = Date.now() + (5 * 60 * 1000);
        }
        hasActiveSessionRef.current = true;
        if (isMountedRef.current) {
          isInitializingRef.current = false;
          setIsInitializingSession(false);
          setErrorState({ session: null, integration: null });
        }
        return currentSecret;
      }

      // If we have a cached secret in-memory that hasn't expired, return it immediately
      if (cachedSecretRef.current && Date.now() < secretExpiresRef.current) {
        if (isDev) console.info("[ChatKitPanel] returning cached secret");
        // ALWAYS clear initializing state when returning cached secret
        isInitializingRef.current = false;
        hasActiveSessionRef.current = true;
        // Use setTimeout to ensure state update happens even if component remounts
        setTimeout(() => {
          setIsInitializingSession(false);
          setErrorState({ session: null, integration: null });
        }, 0);
        return cachedSecretRef.current;
      }

      // Check browser localStorage cache as a fallback (persists across re-mounts)
      if (isBrowser) {
        try {
          const lsSecret = window.localStorage.getItem("chatkit_client_secret");
          const lsExpires = Number(window.localStorage.getItem("chatkit_client_secret_expires"));
          if (lsSecret && Number.isFinite(lsExpires) && Date.now() < lsExpires) {
            cachedSecretRef.current = lsSecret;
            secretExpiresRef.current = lsExpires;
            if (isDev) console.info("[ChatKitPanel] returning localStorage cached secret");
            // ALWAYS clear initializing state when returning cached secret
            isInitializingRef.current = false;
            hasActiveSessionRef.current = true;
            // Use setTimeout to ensure state update happens even if component remounts
            setTimeout(() => {
              setIsInitializingSession(false);
              setErrorState({ session: null, integration: null });
            }, 0);
            return lsSecret;
          }
        } catch (e) {
          console.warn("[ChatKitPanel] localStorage unavailable", e);
        }
      }

      if (!isWorkflowConfigured) {
        const detail =
          "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
          setIsInitializingSession(false);
        }
        throw new Error(detail);
      }

      // Prevent rapid successive session creation calls (cooldown: 2 seconds)
      const now = Date.now();
      const timeSinceLastSession = now - lastSessionCreatedRef.current;
      if (isDev) console.info("[ChatKitPanel] cooldown", { sinceMs: timeSinceLastSession });
      
      if (!currentSecret && timeSinceLastSession < 2000 && lastSessionCreatedRef.current > 0) {
        if (isDev) console.warn("[ChatKitPanel] cooldown active; waiting");
        // Wait for cooldown to expire
        await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastSession + 100));
        if (isDev) console.info("[ChatKitPanel] cooldown ok");
      }

      // Prevent concurrent initialization calls - wait for existing init to complete
      if (!currentSecret && isInitializingRef.current) {
        if (isDev) console.warn("[ChatKitPanel] concurrent init; waiting...");
        // Wait for the existing initialization to complete
        let attempts = 0;
        while (isInitializingRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (isDev) console.info("[ChatKitPanel] proceed after wait");
      }

      if (isMountedRef.current) {
        if (!currentSecret) {
          if (!hasActiveSessionRef.current) {
            isInitializingRef.current = true; // Mark initialization as in progress
            lastSessionCreatedRef.current = Date.now(); // Set timestamp immediately
          setIsInitializingSession(true);
          if (isDev) console.info("[ChatKitPanel] initializing session");
          } else {
            // We already have a valid session; keep UI unblocked
            isInitializingRef.current = false;
            setIsInitializingSession(false);
          }
        }
        setErrorState({ session: null, integration: null, retryable: false });
      }

      try {
        const response = await fetch(CREATE_SESSION_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workflow: { id: WORKFLOW_ID },
            chatkit_configuration: {
              // enable attachments
              file_upload: {
                enabled: true,
              },
            },
          }),
        });

        const raw = await response.text();

        if (isDev) console.info("[ChatKitPanel] createSession", { status: response.status });

        let data: Record<string, unknown> = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch (parseError) {
            if (isDev) console.error("Failed to parse create-session response", parseError);
          }
        }

        if (!response.ok) {
          const detail = extractErrorDetail(data, response.statusText);
          if (isDev) console.error("Create session request failed", { status: response.status });
          throw new Error(detail);
        }

        const clientSecret = data?.client_secret as string | undefined;
        if (!clientSecret) {
          throw new Error("Missing client secret in response");
        }

        // Cache the secret with expiration (use expires_at from response, or default to 5 minutes)
        const expiresAt = data?.expires_at as number | undefined;
        if (expiresAt) {
          secretExpiresRef.current = expiresAt * 1000; // Convert to milliseconds
        } else {
          secretExpiresRef.current = Date.now() + (5 * 60 * 1000); // 5 minutes default
        }
        cachedSecretRef.current = clientSecret;
        hasActiveSessionRef.current = true;

        // Persist to localStorage for robustness against re-mounts/re-inits
        if (isBrowser) {
          try {
            window.localStorage.setItem("chatkit_client_secret", clientSecret);
            window.localStorage.setItem("chatkit_client_secret_expires", String(secretExpiresRef.current));
          } catch {}
        }

        if (isMountedRef.current) {
          setErrorState({ session: null, integration: null });
        }

        console.info("[ChatKitPanel] Session created successfully, cached secret expires in", Math.floor((secretExpiresRef.current - Date.now()) / 1000), "seconds");
        return clientSecret;
      } catch (error) {
        if (isDev) console.error("Failed to create ChatKit session", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Unable to start ChatKit session.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
        }
        throw error instanceof Error ? error : new Error(detail);
      } finally {
        if (isDev) console.info("[ChatKitPanel] finalize getClientSecret", { isMounted: isMountedRef.current });
        if (isMountedRef.current && !currentSecret) {
          isInitializingRef.current = false; // Reset initialization flag
          setIsInitializingSession(false);
          if (isDev) console.info("[ChatKitPanel] init=false");
        }
      }
    },
    [isWorkflowConfigured, setErrorState]
  );

  const chatkitConfig: UseChatKitOptions = {
    api: { getClientSecret },
    theme: {
      colorScheme: theme,
      color: {
        grayscale: {
          hue: 220,
          tint: 6,
          // Keep within documented numeric range to avoid type errors
          shade: theme === "dark" ? 1 : 4,
        },
        accent: {
          primary: "#4ccf96",
          level: 3,
        },
        ...(theme === "dark"
          ? {}
          : {
              surface: {
                background: "#fafafa",
                foreground: "#0f172a",
              },
            }),
      },
      radius: "round",
    },
    startScreen: {
      greeting: GREETING,
      prompts: [
        { label: "What can fyi do for me?", prompt: "What can fyi do for me?", icon: "sparkle" },
        { label: "Tell me about the subscription plans", prompt: "Tell me about the subscription plans", icon: "circle-question" },
        { label: "What's new with fyi?", prompt: "What's the latest with fyi?", icon: "sparkle" },
      ],
    },
    composer: {
      placeholder: PLACEHOLDER_INPUT,
      attachments: {
        enabled: true,
        accept: {
          "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
          "application/pdf": [".pdf"],
        },
      },
    },
    widgets: {
      onAction: async (action: unknown) => {
        try {
          if (typeof action === "object" && action !== null) {
            const obj = action as Record<string, unknown>;
            if (obj.type === "prefill") {
              const payload = (obj as { payload?: unknown }).payload;
              const text =
                typeof (payload as { text?: unknown } | undefined)?.text === "string"
                  ? ((payload as { text?: string }).text as string)
                  : "";
              if (text) {
                await chatkit.setComposerValue({ text });
                await chatkit.focusComposer();
              }
            }
          }
        } catch {}
      },
    },
    threadItemActions: {
      feedback: false,
    },
    onClientTool: async (invocation: {
      name: string;
      params: Record<string, unknown>;
    }) => {
      if (invocation.name === "switch_theme") {
        const requested = invocation.params.theme;
        if (requested === "light" || requested === "dark") {
          if (isDev) {
            console.debug("[ChatKitPanel] switch_theme", requested);
          }
          onThemeRequest(requested);
          return { success: true };
        }
        return { success: false };
      }

      if (invocation.name === "record_fact") {
        const id = String(invocation.params.fact_id ?? "");
        const text = String(invocation.params.fact_text ?? "");
        if (!id || processedFacts.current.has(id)) {
          return { success: true };
        }
        processedFacts.current.add(id);
        void onWidgetAction({
          type: "save",
          factId: id,
          factText: text.replace(/\s+/g, " ").trim(),
        });
        return { success: true };
      }

      // no-op for get_current_date (removed)

      return { success: false };
    },
    onResponseEnd: () => {
      try {
        const seq = responseSeqRef.current;
        const start = responseStartRef.current || 0;
        const dur = start ? Date.now() - start : null;
        if (isDev) console.info(`[ChatKitPanel] onResponseEnd seq=${seq}${dur !== null ? ` duration=${dur}ms` : ''}`);
      } catch {}
      onResponseEnd();
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
      try {
        responseSeqRef.current += 1;
        responseStartRef.current = Date.now();
        if (isDev) console.info(`[ChatKitPanel] onResponseStart seq=${responseSeqRef.current}`);
      } catch {}
    },
    onThreadChange: () => {
      processedFacts.current.clear();
      if (isDev) console.info("[ChatKitPanel] onThreadChange (cleared processed facts)");
    },
    onError: ({ error }: { error: unknown }) => {
      // Note that Chatkit UI handles errors for your users.
      // Thus, your app code doesn't need to display errors on UI.
      console.error("❌ [ChatKitPanel] ChatKit error:", error);
      console.error("❌ [ChatKitPanel] Error details:", JSON.stringify(error, null, 2));
    },
  };
  
  const chatkit = useChatKit(chatkitConfig);

  const handleQuickPrompt = useCallback(
    (text: string) => {
      if (!text) return;
      try {
        if (isDev) console.debug("[ChatKitPanel] handleQuickPrompt", { text });
        chatkit.setComposerValue({ text });
        chatkit.focusComposer();
      } catch {}
    },
    [chatkit]
  );

  const PromptIcon = ({ name }: { name?: unknown }) => {
    const common = "h-4 w-4";
    const n = typeof name === "string" ? name : undefined;
    switch (n) {
      case "sparkle":
        return (
          <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
            <path fill="currentColor" d="M9.5 1.75a.75.75 0 0 1 1 0l1.8 1.64c.2.18.31.43.31.7 0 .27-.11.52-.31.7L10.5 6.43a.75.75 0 0 1-1 0L7.7 4.79a.98.98 0 0 1-.31-.7c0-.27.11-.52.31-.7L9.5 1.75zM3.2 9.2a.6.6 0 0 1 .8 0l1.28 1.16c.18.16.28.38.28.62s-.1.46-.28.62L4 12.76a.6.6 0 0 1-.8 0l-1.28-1.16A.86.86 0 0 1 1.64 11c0-.24.1-.46.28-.62L3.2 9.2zm13.6 0a.6.6 0 0 1 .8 0l1.28 1.16c.18.16.28.38.28.62s-.1.46-.28.62L17.6 12.76a.6.6 0 0 1-.8 0l-1.28-1.16a.86.86 0 0 1-.28-.62c0-.24.1-.46.28-.62L16.8 9.2zM8.5 8.75a1 1 0 0 1 3 0l.41 1.25c.14.44.5.8.94.94L14.1 11a1 1 0 0 1 0 2l-1.25.41a1.5 1.5 0 0 0-.94.94L11.5 15a1 1 0 0 1-3 0l-.41-1.25a1.5 1.5 0 0 0-.94-.94L5.9 13a1 1 0 0 1 0-2l1.25-.41c.44-.14.8-.5.94-.94L8.5 8.75z"/>
          </svg>
        );
      case "bug":
        return (
          <svg viewBox="0 0 24 24" className={common} fill="currentColor">
            <path d="M9.5 13.5C10.3284 13.5 11 12.9404 11 12.25C11 11.5596 10.3284 11 9.5 11C8.67157 11 8 11.5596 8 12.25C8 12.9404 8.67157 13.5 9.5 13.5Z"></path>
            <path d="M13.5 16.5C13.5 17.6046 12.8284 18.5 12 18.5C11.1716 18.5 10.5 17.6046 10.5 16.5C10.5 15.3954 11.1716 14.5 12 14.5C12.8284 14.5 13.5 15.3954 13.5 16.5Z"></path>
            <path d="M14.5 13.5C15.3284 13.5 16 12.9404 16 12.25C16 11.5596 15.3284 11 14.5 11C13.6716 11 13 11.5596 13 12.25C13 12.9404 13.6716 13.5 14.5 13.5Z"></path>
            <path d="M10.1689 5.17703C10.7615 5.0609 11.3741 5 12 5C12.6259 5 13.2385 5.0609 13.8311 5.17703C14.2125 4.34087 14.7295 3.51088 15.3887 2.90913C16.0678 2.2891 16.9848 1.84347 18.0577 2.05199C19.0855 2.25177 19.9991 3.00672 20.8169 4.16677C21.1354 4.61856 21.0278 5.24335 20.5766 5.56226C20.1254 5.88118 19.5014 5.77346 19.183 5.32167C18.5007 4.35394 17.9768 4.07629 17.6766 4.01793C17.4212 3.9683 17.1195 4.03899 16.7362 4.38899C16.3912 4.70395 16.054 5.18667 15.7606 5.77733C18.8328 7.11381 21 10.0398 21 13.5C21 18.2542 16.9088 22 12 22C7.09121 22 3 18.2542 3 13.5C3 10.0398 5.16716 7.11381 8.2394 5.77733C7.946 5.18667 7.60881 4.70395 7.26383 4.38899C6.88046 4.03899 6.57876 3.9683 6.32345 4.01793C6.02318 4.07629 5.49926 4.35394 4.81705 5.32167C4.49855 5.77346 3.87459 5.88118 3.4234 5.56226C2.9722 5.24335 2.86462 4.61856 3.18312 4.16677C4.00091 3.00672 4.91449 2.25177 5.94234 2.05199C7.01515 1.84347 7.9322 2.2891 8.61134 2.90913C9.27045 3.51088 9.78747 4.34087 10.1689 5.17703ZM12 7C11.6011 7 11.2111 7.03063 10.8322 7.08936C10.8946 7.34259 10.9462 7.59208 10.9865 7.83391C11.0773 8.3794 10.7093 8.8953 10.1645 8.98622C9.61971 9.07713 9.10448 8.70863 9.01369 8.16314C8.98674 8.00125 8.95305 7.83368 8.91295 7.6627C6.57573 8.73108 5 10.9719 5 13.5C5 17.03 8.07223 20 12 20C15.9278 20 19 17.03 19 13.5C19 10.9719 17.4243 8.73108 15.0871 7.6627C15.0469 7.83368 15.0133 8.00125 14.9863 8.16314C14.8955 8.70863 14.3803 9.07713 13.8355 8.98622C13.2907 8.8953 12.9227 8.3794 13.0135 7.83391C13.0538 7.59208 13.1054 7.34259 13.1678 7.08936C12.7889 7.03063 12.3989 7 12 7Z"/>
          </svg>
        );
      case "lifesaver":
        return (
          <svg viewBox="0 0 20 20" className={common} fill="currentColor">
            <path d="M10 1.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5zM9 13.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm1-8a3 3 0 0 1 3 3c0 1.08-.57 1.8-1.52 2.36-.61.36-.73.55-.73 1.14v.25h-1.5v-.38c0-1.04.36-1.63 1.32-2.2.68-.4.93-.71.93-1.17A1.5 1.5 0 0 0 10 7a1.5 1.5 0 0 0-1.5 1.5H7A3 3 0 0 1 10 5.5z"/>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 20 20" className={common} aria-hidden="true">
            <path fill="currentColor" d="M10 15l-4.045 2.128.773-4.508L3.455 9.372l4.527-.658L10 4.5l2.018 4.214 4.527.658-3.273 3.248.773 4.508z"/>
          </svg>
        );
    }
  };

  // Optional dev log
  useEffect(() => {
    if (isDev) {
      console.info("[ChatKitPanel] control", { has: Boolean(chatkit.control) });
    }
  }, [chatkit.control]);

  // Minimal state log in development only
  useEffect(() => {
    if (!isDev) return;
    console.info("[ChatKitPanel] state", {
      init: isInitializingSession,
      control: Boolean(chatkit.control),
      script: scriptStatus,
    });
  }, [isInitializingSession, chatkit.control, scriptStatus]);

  // Collapse/hide detailed "Thinking" content inside the web component, keep only status updates
  useEffect(() => {
    const rootNode = chatContainerRef.current;
    if (!rootNode) return;

    const collapseThinking = () => {
      try {
        // Find ChatKit web component inside our container
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) return;

        // Inject CSS to hide all thinking paragraphs (simple approach)
        if (!shadow.querySelector('style[data-fyi-hide-thinking]')) {
          const style = document.createElement('style');
          style.setAttribute('data-fyi-hide-thinking', '1');
          style.textContent = `
            /* Hide all thinking paragraphs - they contain detailed explanations */
            /* Hide paragraphs in .fYdWH that are longer than short status updates */
            .fYdWH p,
            .fYdWH.text-sm p,
            .fYdWH div p,
            .fYdWH > p,
            [data-kind="thinking"] p,
            [data-message-type="thinking"] p,
            [part*="thinking"] p,
            /* Hide list items and bullets with detailed reasoning */
            [data-kind="thinking"] ul,
            [data-kind="thinking"] ol,
            [data-kind="thinking"] li,
            [data-message-type="thinking"] ul,
            [data-message-type="thinking"] ol,
            [data-message-type="thinking"] li {
              display: none !important;
            }
          `;
          shadow.appendChild(style);
        }

        // Target explicit thinking message containers
        const thinkingNodes = shadow.querySelectorAll<HTMLElement>('[data-kind="thinking"], [data-message-type="thinking"]');
        thinkingNodes.forEach((n, idx) => {
          try {
            if (isDev) console.debug('[ChatKitPanel] collapseThinking node', { idx, tag: n.tagName, part: n.getAttribute('part') });
            
            // Neutralize sticky so the thread can auto-scroll
            const cs = getComputedStyle(n);
            if (cs.position === 'sticky' || cs.position === 'fixed') {
              n.style.position = 'static';
              n.style.top = '';
              n.style.bottom = '';
            }

            // Hide all children except the first (status header)
            const kids = Array.from(n.children);
            kids.forEach((k, idx) => {
              if (idx > 0 && (k as HTMLElement).style) {
                (k as HTMLElement).style.display = 'none';
              }
            });

            // Hide ALL thinking paragraphs - status updates are in divs, not paragraphs
            const allThinkingParas = n.querySelectorAll('.fYdWH p, .fYdWH.text-sm p, .fYdWH div p, [data-kind="thinking"] p, [data-message-type="thinking"] p');
            allThinkingParas.forEach((el) => {
              // Always hide all paragraphs - they're all detailed thinking
              // Status updates appear in divs, not paragraphs
              (el as HTMLElement).style.display = 'none';
            });
          } catch {}
        });

        // Hide ALL .fYdWH paragraphs everywhere - status updates are in divs, not paragraphs
        const allThinkingParas = shadow.querySelectorAll('.fYdWH p, .fYdWH.text-sm p, .fYdWH div p, .fYdWH > p');
        allThinkingParas.forEach((el) => {
          // Always hide all paragraphs - they contain detailed thinking
          // Status updates like "Done" and "Clarifying envelope types" are in divs, not paragraphs
          (el as HTMLElement).style.display = 'none';
        });
      } catch {}
    };

    // Observe updates in the shadow DOM and apply collapsing
    let mo: MutationObserver | null = null;
    const attachObserver = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) { requestAnimationFrame(attachObserver); return; }
        try { mo?.disconnect(); } catch {}
        if (isDev) console.debug('[ChatKitPanel] attachObserver (shadow ready)');
        collapseThinking();
        mo = new MutationObserver(() => collapseThinking());
        mo.observe(shadow, { 
          childList: true, 
          subtree: true,
          characterData: false, // Skip text changes for performance
          attributes: false // Skip attribute changes for performance
        });
      } catch {}
    };

    attachObserver();
    return () => { try { mo?.disconnect(); } catch {} };
  }, []);

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render", { init: isInitializingSession });
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900">
      <div className="flex items-center justify-center gap-2 border-b border-slate-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
        fyi AI ASSIST
      </div>
      <div ref={chatContainerRef} className="flex-1 w-full">
        <ChatKit
          key={widgetInstanceKey}
          control={chatkit.control}
          className={"flex-1 w-full"}
        />
      </div>
      <div className="relative border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Dropdown toggle button */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
            </svg>
            Quick actions
          </span>
          <svg 
            className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path d="M5.293 7.293a1 1 0 0 1 1.414 0L10 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 0-1.414z"/>
          </svg>
        </button>

        {/* Dropdown content */}
        {isDropdownOpen && (
          <div className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <div className="p-2 space-y-1">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    if (p.label === "Enhancement request") {
                      setIsEnhancementFormOpen(true);
                    } else {
                      handleQuickPrompt(p.prompt);
                    }
                    setIsDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300">
                    <PromptIcon name={(p as unknown as { icon?: unknown }).icon} />
                  </span>
                  <span className="font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer handled by ChatKit UI; no duplicate here */}
      </div>
      {isEnhancementFormOpen && (
        <div className="border-t border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 font-medium text-slate-700 dark:text-slate-200">Enhancement request</div>
          <div className="grid grid-cols-1 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600 dark:text-slate-400">Title</span>
              <input
                value={enhancementTitle}
                onChange={(e) => setEnhancementTitle(e.target.value)}
                placeholder="Short, descriptive title"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600 dark:text-slate-400">Description</span>
              <textarea
                value={enhancementDescription}
                onChange={(e) => setEnhancementDescription(e.target.value)}
                placeholder="What problem does this solve? What would you like to see?"
                rows={4}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-slate-600 dark:text-slate-400">Priority</span>
                <select
                  value={enhancementPriority}
                  onChange={(e) => setEnhancementPriority(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-600 dark:text-slate-400">Impact</span>
                <input
                  value={enhancementImpact}
                  onChange={(e) => setEnhancementImpact(e.target.value)}
                  placeholder="Who is impacted and how often?"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEnhancementFormOpen(false);
                  setEnhancementTitle("");
                  setEnhancementDescription("");
                  setEnhancementPriority("Medium");
                  setEnhancementImpact("");
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const lines: string[] = [];
                  lines.push("I want to request a product enhancement:");
                  if (enhancementTitle.trim()) lines.push(`Title: ${enhancementTitle.trim()}`);
                  if (enhancementDescription.trim()) lines.push(`Description: ${enhancementDescription.trim()}`);
                  if (enhancementPriority) lines.push(`Priority: ${enhancementPriority}`);
                  if (enhancementImpact.trim()) lines.push(`Impact: ${enhancementImpact.trim()}`);
                  const text = lines.join("\n");
                  if (text) {
                    try {
                      chatkit.setComposerValue({ text });
                      chatkit.focusComposer();
                    } catch {}
                  }
                  setIsEnhancementFormOpen(false);
                  setEnhancementTitle("");
                  setEnhancementDescription("");
                  setEnhancementPriority("Medium");
                  setEnhancementImpact("");
                }}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                Add to message
              </button>
            </div>
          </div>
        </div>
      )}
      {blockingError && (
        <ErrorOverlay
          error={blockingError}
          fallbackMessage={null}
          onRetry={handleResetChat}
          retryLabel="Restart chat"
        />
      )}
      {isInitializingSession && !blockingError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80">
          <div className="text-slate-600 dark:text-slate-400">Loading assistant session...</div>
        </div>
      )}
    </div>
  );
}

function extractErrorDetail(
  payload: Record<string, unknown> | undefined,
  fallback: string
): string {
  if (!payload) {
    return fallback;
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") {
    return details;
  }

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") {
      return nestedError;
    }
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}
