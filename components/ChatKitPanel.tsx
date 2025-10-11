"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
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
      console.error("Failed to load chatkit.js for some reason", event);
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
      console.info("[ChatKitPanel] getClientSecret invoked", {
        currentSecretPresent: Boolean(currentSecret),
        workflowId: WORKFLOW_ID,
        endpoint: CREATE_SESSION_ENDPOINT,
        isProduction: process.env.NODE_ENV === "production",
        isCurrentlyInitializing: isInitializingRef.current,
        hasCachedSecret: !!cachedSecretRef.current,
        secretExpired: Date.now() > secretExpiresRef.current
      });

      // If we have a cached secret in-memory that hasn't expired, return it immediately
      if (!currentSecret && cachedSecretRef.current && Date.now() < secretExpiresRef.current) {
        console.info(
          "[ChatKitPanel] ✅ Returning cached secret (valid for another",
          Math.floor((secretExpiresRef.current - Date.now()) / 1000),
          "seconds)"
        );
        if (isMountedRef.current) {
          isInitializingRef.current = false;
          setIsInitializingSession(false);
          setErrorState({ session: null, integration: null });
        }
        hasActiveSessionRef.current = true;
        return cachedSecretRef.current;
      }

      // Check browser localStorage cache as a fallback (persists across re-mounts)
      if (isBrowser && !currentSecret) {
        try {
          const lsSecret = window.localStorage.getItem("chatkit_client_secret");
          const lsExpires = Number(window.localStorage.getItem("chatkit_client_secret_expires"));
          if (lsSecret && Number.isFinite(lsExpires) && Date.now() < lsExpires) {
            cachedSecretRef.current = lsSecret;
            secretExpiresRef.current = lsExpires;
            console.info(
              "[ChatKitPanel] ✅ Returning localStorage cached secret (valid for",
              Math.floor((lsExpires - Date.now()) / 1000),
              "seconds)"
            );
            if (isMountedRef.current) {
              isInitializingRef.current = false;
              setIsInitializingSession(false);
              setErrorState({ session: null, integration: null });
            }
            hasActiveSessionRef.current = true;
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
      console.info("[ChatKitPanel] Cooldown check", {
        now,
        lastTimestamp: lastSessionCreatedRef.current,
        timeSinceLastMs: timeSinceLastSession,
        cooldownActive: timeSinceLastSession < 2000,
        timestampExists: lastSessionCreatedRef.current > 0,
        isNewSession: !currentSecret,
        willBlock: !currentSecret && timeSinceLastSession < 2000 && lastSessionCreatedRef.current > 0
      });
      
      if (!currentSecret && timeSinceLastSession < 2000 && lastSessionCreatedRef.current > 0) {
        console.warn("[ChatKitPanel] ⚠️ COOLDOWN ACTIVE - Blocking duplicate session creation", {
          timeSinceLastMs: timeSinceLastSession,
          cooldownMs: 2000
        });
        // Wait for cooldown to expire
        await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastSession + 100));
        console.info("[ChatKitPanel] Cooldown expired, proceeding");
      }

      // Prevent concurrent initialization calls - wait for existing init to complete
      if (!currentSecret && isInitializingRef.current) {
        console.warn("[ChatKitPanel] Concurrent initialization detected, waiting...");
        // Wait for the existing initialization to complete
        let attempts = 0;
        while (isInitializingRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        console.info("[ChatKitPanel] Wait complete, proceeding with initialization");
      }

      if (isMountedRef.current) {
        if (!currentSecret) {
          if (!hasActiveSessionRef.current) {
            isInitializingRef.current = true; // Mark initialization as in progress
            lastSessionCreatedRef.current = Date.now(); // Set timestamp immediately
            setIsInitializingSession(true);
            console.info("[ChatKitPanel] Setting isInitializingSession to true and timestamp");
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

        console.info("[ChatKitPanel] createSession response", {
          status: response.status,
          ok: response.ok,
          bodyLength: raw.length,
        });

        let data: Record<string, unknown> = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch (parseError) {
            console.error(
              "Failed to parse create-session response",
              parseError
            );
          }
        }

        if (!response.ok) {
          const detail = extractErrorDetail(data, response.statusText);
          console.error("Create session request failed", {
            status: response.status,
            body: data,
          });
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
        console.error("Failed to create ChatKit session", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Unable to start ChatKit session.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
        }
        throw error instanceof Error ? error : new Error(detail);
      } finally {
        console.info("[ChatKitPanel] getClientSecret finally block", {
          isMounted: isMountedRef.current,
          currentSecret,
          willSetInitFalse: isMountedRef.current && !currentSecret
        });
        if (isMountedRef.current && !currentSecret) {
          isInitializingRef.current = false; // Reset initialization flag
          setIsInitializingSession(false);
          console.info("[ChatKitPanel] Set isInitializingSession to false and reset init flag");
        }
      }
    },
    [isWorkflowConfigured, setErrorState]
  );

  const chatkit = useChatKit({
    api: { getClientSecret },
    theme: {
      colorScheme: theme,
      color: {
        grayscale: {
          hue: 220,
          tint: 6,
          shade: theme === "dark" ? -1 : -4,
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
      console.error("ChatKit error", error);
    },
  });

  // Log state changes
  useEffect(() => {
    console.info("[ChatKitPanel] State changed:", {
      isInitializingSession,
      hasControl: Boolean(chatkit.control),
      scriptStatus,
      hasError: Boolean(errors.session ?? errors.integration ?? errors.script),
      widgetInstanceKey,
    });
    
    // Check if ChatKit element is actually rendered and has content
    if (isBrowser && !isInitializingSession && chatkit.control) {
      setTimeout(() => {
        const chatkitElement = document.querySelector('openai-chatkit');
        if (chatkitElement) {
          const shadowRoot = (chatkitElement as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
          console.info("[ChatKitPanel] ChatKit element check:", {
            elementExists: true,
            hasShadowRoot: Boolean(shadowRoot),
            shadowRootChildren: shadowRoot?.childElementCount || 0,
            elementDisplay: window.getComputedStyle(chatkitElement).display,
            elementVisibility: window.getComputedStyle(chatkitElement).visibility,
            elementOpacity: window.getComputedStyle(chatkitElement).opacity,
          });
        } else {
          console.warn("[ChatKitPanel] ChatKit element not found in DOM!");
        }
      }, 500);
    }
  }, [isInitializingSession, chatkit.control, scriptStatus, errors, widgetInstanceKey]);

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render state", {
      isInitializingSession,
      hasControl: Boolean(chatkit.control),
      scriptStatus,
      hasError: Boolean(blockingError),
      workflowId: WORKFLOW_ID,
    });
  }

  return (
    <div className="relative flex h-[90vh] w-full flex-col overflow-hidden bg-white shadow-sm transition-colors dark:bg-slate-900">
      {/* Persistent production debug info */}
      {process.env.NODE_ENV === "production" && (
        <div className="absolute top-0 left-0 right-0 z-[100] bg-yellow-100 p-2 text-xs border-b border-yellow-300">
          <strong>Debug:</strong> init={String(isInitializingSession)} | err={blockingError || "none"} | ctrl={String(Boolean(chatkit.control))} | script={scriptStatus} | wf={WORKFLOW_ID ? "✓" : "✗"} | opacity={blockingError || isInitializingSession ? "0" : "100"}
        </div>
      )}
      <ChatKit
        key={widgetInstanceKey}
        control={chatkit.control}
        className={"block h-full w-full"}
        style={{ paddingTop: process.env.NODE_ENV === "production" ? "2.5rem" : undefined }}
      />
      <ErrorOverlay
        error={blockingError}
        fallbackMessage={
          blockingError || !isInitializingSession
            ? null
            : "Loading assistant session..."
        }
        onRetry={handleResetChat}
        retryLabel="Restart chat"
      />
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
