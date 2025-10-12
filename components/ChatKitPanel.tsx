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
          primary: theme === "dark" ? "#f1f5f9" : "#0f172a",
          level: 1,
        },
      },
      radius: "round",
    },
    startScreen: {
      greeting: GREETING,
      prompts: STARTER_PROMPTS,
    },
    composer: {
      placeholder: PLACEHOLDER_INPUT,
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

      return { success: false };
    },
    onResponseEnd: () => {
      onResponseEnd();
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
    },
    onThreadChange: () => {
      processedFacts.current.clear();
    },
    onError: ({ error }: { error: unknown }) => {
      // Note that Chatkit UI handles errors for your users.
      // Thus, your app code doesn't need to display errors on UI.
      console.error("❌ [ChatKitPanel] ChatKit error:", error);
      console.error("❌ [ChatKitPanel] Error details:", JSON.stringify(error, null, 2));
    },
  };
  
  // @ts-expect-error - Type mismatch between theme config and ChatKit expectations
  const chatkit = useChatKit(chatkitConfig);

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

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render", { init: isInitializingSession });
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900">
      <ChatKit
        key={widgetInstanceKey}
        control={chatkit.control}
        className={"block h-full w-full"}
      />
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
