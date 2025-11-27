"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import type { UseChatKitOptions } from "@openai/chatkit-react";
import {
  STARTER_PROMPTS,
  PLACEHOLDER_INPUT,
  CREATE_SESSION_ENDPOINT,
  WORKFLOW_ID,
  PROMPT_METADATA_ENDPOINT,
} from "@/lib/config";
import { ErrorOverlay } from "./ErrorOverlay";
import type { ColorScheme } from "@/hooks/useColorScheme";
import { stableStringify } from "@/lib/stableStringify";
import { sanitizeCitationsDeep, ensureGlobalCitationObserver } from "@/lib/sanitizeCitations";
import type { UserMetadata } from "@/types/userMetadata";
import { buildLinkAwareGreeting, inferLinkContextValue } from "@/lib/greeting";

// Component to auto-hide loading overlay after timeout
function LoadingTimeoutHandler({ 
  isActive, 
  onTimeout 
}: { 
  isActive: boolean; 
  onTimeout: () => void;
}) {
  useEffect(() => {
    if (!isActive) return;
    const timeout = setTimeout(() => {
      console.warn("[ChatKitPanel] Loading timeout - clearing initialization state");
      onTimeout();
    }, 10000); // 10 second timeout
    return () => clearTimeout(timeout);
  }, [isActive, onTimeout]);
  return null;
}

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
  initialQuery?: string;
  hideComposer?: boolean;
  userMetadata?: UserMetadata;
  onChatKitReady?: (chatkit: { setComposerValue: (value: { text: string }) => Promise<void>; focusComposer: () => Promise<void> }) => void;
};

type ErrorState = {
  script: string | null;
  session: string | null;
  integration: string | null;
  retryable: boolean;
};

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV !== "production";

const PROMPT_STORAGE_KEY = "chatkit_prompt_key";
const PROMPT_STORAGE_EXPIRES_KEY = "chatkit_prompt_key_expires";
const PROMPT_STORAGE_HASH_KEY = "chatkit_prompt_key_hash";
const SESSION_METADATA_HASH_KEY = "chatkit_session_metadata_hash";

type PromptCacheInfo = {
  key: string;
  expiresAt: number;
  hash: string;
};

function sanitizeMetadata(
  input: UserMetadata | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key) continue;
    result[key] = sanitizeMetadataValue(value);
  }
  return result;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }
  if (type === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  return String(value);
}

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
  initialQuery,
  hideComposer = false,
  userMetadata,
  onChatKitReady,
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
  const promptCacheRef = useRef<PromptCacheInfo | null>(null);
  const sessionMetadataHashRef = useRef<string | null>(null);
  const metadataHashRef = useRef<string>("");
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
  const cleanedMetadata = useMemo(
    () => sanitizeMetadata(userMetadata),
    [userMetadata]
  );
  const linkTarget = useMemo(
    () =>
      typeof cleanedMetadata["link_url"] === "string"
        ? (cleanedMetadata["link_url"] as string)
        : null,
    [cleanedMetadata]
  );
  const linkContext = useMemo(
    () => inferLinkContextValue(linkTarget),
    [linkTarget]
  );
  const promptParameters = useMemo(() => {
    const next: Record<string, unknown> = { ...cleanedMetadata };
    if (linkContext) {
      next.link_context = linkContext;
    }
    return next;
  }, [cleanedMetadata, linkContext]);
  const startScreenGreeting = useMemo(
    () =>
      buildLinkAwareGreeting({
        link: linkTarget,
      }),
    [linkTarget]
  );
  const metadataHash = useMemo(
    () => stableStringify(promptParameters),
    [promptParameters]
  );

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  useEffect(() => {
    ensureGlobalCitationObserver();
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
    promptCacheRef.current = null;
    sessionMetadataHashRef.current = null;
    if (isBrowser) {
      try {
        window.localStorage.removeItem("chatkit_client_secret");
        window.localStorage.removeItem("chatkit_client_secret_expires");
        window.localStorage.removeItem(PROMPT_STORAGE_KEY);
        window.localStorage.removeItem(PROMPT_STORAGE_EXPIRES_KEY);
        window.localStorage.removeItem(PROMPT_STORAGE_HASH_KEY);
        window.localStorage.removeItem(SESSION_METADATA_HASH_KEY);
      } catch {}
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!metadataHashRef.current) {
      metadataHashRef.current = metadataHash;
      return;
    }
    if (metadataHashRef.current !== metadataHash) {
      if (isDev) {
        console.info("[ChatKitPanel] Metadata changed - resetting session");
      }
      metadataHashRef.current = metadataHash;
      handleResetChat();
    }
  }, [handleResetChat, metadataHash]);

  const storeSessionMetadataHash = useCallback((hash: string) => {
    sessionMetadataHashRef.current = hash;
    if (isBrowser) {
      try {
        window.localStorage.setItem(SESSION_METADATA_HASH_KEY, hash);
      } catch {}
    }
  }, []);

  const persistPromptMetadata = useCallback((entry: PromptCacheInfo) => {
    promptCacheRef.current = entry;
    if (isBrowser) {
      try {
        window.localStorage.setItem(PROMPT_STORAGE_KEY, entry.key);
        window.localStorage.setItem(
          PROMPT_STORAGE_EXPIRES_KEY,
          String(entry.expiresAt)
        );
        window.localStorage.setItem(PROMPT_STORAGE_HASH_KEY, entry.hash);
      } catch {}
    }
  }, []);

  const ensurePromptMetadata = useCallback(async (): Promise<PromptCacheInfo | null> => {
    const now = Date.now();
    const cached = promptCacheRef.current;
    if (
      cached &&
      cached.hash === metadataHash &&
      cached.expiresAt > now
    ) {
      return cached;
    }

    if (isBrowser) {
      try {
        const lsKey = window.localStorage.getItem(PROMPT_STORAGE_KEY);
        const lsExpiresRaw = window.localStorage.getItem(
          PROMPT_STORAGE_EXPIRES_KEY
        );
        const lsHash = window.localStorage.getItem(PROMPT_STORAGE_HASH_KEY);
        const lsExpires = lsExpiresRaw ? Number(lsExpiresRaw) : 0;
        if (
          lsKey &&
          lsHash === metadataHash &&
          Number.isFinite(lsExpires) &&
          lsExpires > now
        ) {
          const entry: PromptCacheInfo = {
            key: lsKey,
            expiresAt: lsExpires,
            hash: lsHash,
          };
          persistPromptMetadata(entry);
          return entry;
        }
      } catch (error) {
        if (isDev) {
          console.debug(
            "[ChatKitPanel] prompt metadata localStorage error",
            error
          );
        }
      }
    }

    try {
      const response = await fetch(PROMPT_METADATA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: WORKFLOW_ID,
          parameters: promptParameters,
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || response.statusText);
      }
      const data = (await response.json().catch(() => ({}))) as {
        promptKey?: string;
        expiresAt?: number;
      };
      if (!data.promptKey) {
        throw new Error("Missing prompt metadata key");
      }
      const entry: PromptCacheInfo = {
        key: data.promptKey,
        expiresAt:
          typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt)
            ? data.expiresAt
            : Date.now() + 5 * 60 * 1000,
        hash: metadataHash,
      };
      persistPromptMetadata(entry);
      return entry;
    } catch (error) {
      if (isDev) {
        console.warn("[ChatKitPanel] Failed to fetch prompt metadata", error);
      }
      return null;
    }
  }, [metadataHash, persistPromptMetadata, promptParameters]);

  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      if (isDev) {
        console.info("[ChatKitPanel] getClientSecret", {
          hasCurrent: Boolean(currentSecret),
          hasCached: Boolean(cachedSecretRef.current),
        });
      }
      const now = Date.now();

      // CRITICAL: If ChatKit is passing us an existing secret, validate and return it!
      // ChatKit will pass the current secret when it wants to reuse the same session
      if (currentSecret) {
        console.info("[ChatKitPanel] ✅ ChatKit provided existing secret, returning it to maintain session continuity");
        // Store it in our cache for future use
        cachedSecretRef.current = currentSecret;
        if (!secretExpiresRef.current || secretExpiresRef.current < now) {
          // Set a reasonable expiration if we don't have one (5 minutes from now)
          secretExpiresRef.current = now + (5 * 60 * 1000);
        }
        hasActiveSessionRef.current = true;
        storeSessionMetadataHash(metadataHash);
        void ensurePromptMetadata();
        if (isMountedRef.current) {
          isInitializingRef.current = false;
          setIsInitializingSession(false);
          setErrorState({ session: null, integration: null });
        }
        return currentSecret;
      }

      // If we have a cached secret in-memory that hasn't expired, return it immediately
      if (
        cachedSecretRef.current &&
        now < secretExpiresRef.current &&
        sessionMetadataHashRef.current === metadataHash
      ) {
        if (isDev) console.info("[ChatKitPanel] returning cached secret");
        // ALWAYS clear initializing state when returning cached secret
        isInitializingRef.current = false;
        hasActiveSessionRef.current = true;
        // Use setTimeout to ensure state update happens even if component remounts
        setTimeout(() => {
          setIsInitializingSession(false);
          setErrorState({ session: null, integration: null });
        }, 0);
        void ensurePromptMetadata();
        return cachedSecretRef.current;
      }

      // Check browser localStorage cache as a fallback (persists across re-mounts)
      if (isBrowser) {
        try {
          const lsSecret = window.localStorage.getItem("chatkit_client_secret");
          const lsExpires = Number(window.localStorage.getItem("chatkit_client_secret_expires"));
          const lsHash = window.localStorage.getItem(SESSION_METADATA_HASH_KEY);
          if (
            lsSecret &&
            Number.isFinite(lsExpires) &&
            now < lsExpires &&
            lsHash === metadataHash
          ) {
            cachedSecretRef.current = lsSecret;
            secretExpiresRef.current = lsExpires;
            if (isDev) console.info("[ChatKitPanel] returning localStorage cached secret");
            // ALWAYS clear initializing state when returning cached secret
            isInitializingRef.current = false;
            hasActiveSessionRef.current = true;
            storeSessionMetadataHash(metadataHash);
            // Use setTimeout to ensure state update happens even if component remounts
            setTimeout(() => {
              setIsInitializingSession(false);
              setErrorState({ session: null, integration: null });
            }, 0);
            void ensurePromptMetadata();
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
      const cooldownNow = Date.now();
      const timeSinceLastSession = cooldownNow - lastSessionCreatedRef.current;
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
        const promptEntry = await ensurePromptMetadata();
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
            prompt_parameters: promptParameters,
            ...(promptEntry
              ? {
                  prompt_metadata: {
                    key: promptEntry.key,
                    expiresAt: promptEntry.expiresAt,
                  },
                }
              : {}),
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
        storeSessionMetadataHash(metadataHash);

        // Persist to localStorage for robustness against re-mounts/re-inits
        if (isBrowser) {
          try {
            window.localStorage.setItem("chatkit_client_secret", clientSecret);
            window.localStorage.setItem("chatkit_client_secret_expires", String(secretExpiresRef.current));
          } catch {}
        }

        const responsePromptKey =
          typeof data?.prompt_key === "string" ? data.prompt_key : undefined;
        const responsePromptExpires =
          typeof data?.prompt_expires_at === "number"
            ? data.prompt_expires_at * 1000
            : undefined;
        const resolvedPromptKey =
          responsePromptKey ?? promptEntry?.key ?? null;
        if (resolvedPromptKey) {
          const resolvedExpires =
            responsePromptExpires ??
            promptEntry?.expiresAt ??
            Date.now() + 5 * 60 * 1000;
          persistPromptMetadata({
            key: resolvedPromptKey,
            expiresAt: resolvedExpires,
            hash: metadataHash,
          });
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
    [
      ensurePromptMetadata,
      isWorkflowConfigured,
      metadataHash,
      persistPromptMetadata,
      promptParameters,
      setErrorState,
      storeSessionMetadataHash,
    ]
  );

  const chatkitConfig: UseChatKitOptions = {
    api: { getClientSecret },
    onReady: () => {
      // ChatKit is fully initialized and ready
      if (isDev) {
        console.info("[ChatKitPanel] ChatKit is ready");
      }
      // Ensure initialization state is cleared when ChatKit is ready
      if (isMountedRef.current) {
        isInitializingRef.current = false;
        setIsInitializingSession(false);
        setErrorState({ session: null, integration: null });
      }
    },
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
      greeting: startScreenGreeting,
      prompts: [
        { label: "What can FYI do for me?", prompt: "What can FYI do for me?", icon: "sparkle" },
        { label: "Tell me about the subscription plans", prompt: "Tell me about the subscription plans", icon: "circle-question" },
        { label: "What's new with FYI?", prompt: "What's the latest with FYI?", icon: "sparkle" },
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
      setErrorState({ integration: null, retryable: false, session: null });
      setIsInitializingSession(false); // Ensure loading overlay is cleared when response starts
      isInitializingRef.current = false;
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
      // Clear any session errors when ChatKit handles the error internally
      // This prevents the white overlay from appearing
      if (isMountedRef.current) {
        setErrorState({ session: null, integration: null });
        setIsInitializingSession(false);
        isInitializingRef.current = false;
      }
    },
  };
  
  const chatkit = useChatKit(chatkitConfig);

  // Ensure initialization state is cleared when ChatKit is ready
  useEffect(() => {
    if (chatkit && chatkit.control && !isInitializingSession) {
      // ChatKit is ready and initialized - ensure no stuck states
      if (isInitializingRef.current) {
        isInitializingRef.current = false;
        setIsInitializingSession(false);
        setErrorState({ session: null, integration: null });
      }
    }
  }, [chatkit, isInitializingSession, setErrorState]);

  // Expose chatkit instance to parent component
  useEffect(() => {
    if (chatkit && chatkit.control && onChatKitReady) {
      onChatKitReady({
        setComposerValue: chatkit.setComposerValue.bind(chatkit),
        focusComposer: chatkit.focusComposer.bind(chatkit),
      });
    }
  }, [chatkit, onChatKitReady]);

  // Set initial query when ChatKit is ready
  useEffect(() => {
    if (initialQuery && chatkit && chatkit.control && !isInitializingSession) {
      // Wait a bit for ChatKit to fully initialize, then set the query
      const timer = setTimeout(async () => {
        try {
          await chatkit.setComposerValue({ text: initialQuery });
          // Auto-submit the query if hideComposer is true (using custom input)
          if (hideComposer) {
            // Trigger Enter key press to submit
            const wc = chatContainerRef.current?.querySelector<HTMLElement>('openai-chatkit');
            const shadow = wc?.shadowRoot;
            if (shadow) {
              const composer = shadow.querySelector('[role="textbox"], [contenteditable="true"]') as HTMLElement;
              if (composer) {
                const enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true,
                });
                composer.dispatchEvent(enterEvent);
              }
            }
          } else {
            await chatkit.focusComposer();
          }
        } catch (error) {
          if (isDev) console.debug("[ChatKitPanel] Failed to set initial query:", error);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialQuery, chatkit, isInitializingSession, hideComposer]);

  // Hide composer and control text size in ChatKit
  useEffect(() => {
    const rootNode = chatContainerRef.current;
    if (!rootNode) return;

    const applyStyles = () => {
      try {
        // Find ChatKit web component inside our container
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        if (!shadow) return;

        // Configure font size here (default: 1rem / 16px)
        // You can change this value to adjust text size:
        // - "0.875rem" (14px) - smaller
        // - "1rem" (16px) - default
        // - "1.125rem" (18px) - larger
        // - "1.25rem" (20px) - extra large
        const baseFontSize = "0.875rem"; // Change this to adjust text size

        // Inject CSS to control text size and hide composer if needed
        const styleId = hideComposer ? 'data-fyi-help-page-styles' : 'data-fyi-text-size';
        if (!shadow.querySelector(`style[${styleId}]`)) {
          const style = document.createElement('style');
          style.setAttribute(styleId, '1');
          style.textContent = `
            /* Control base font size for chat content */
            :host {
              font-size: ${baseFontSize} !important;
            }
            /* Message text */
            [data-thread-turn] p,
            [data-thread-turn] div,
            [data-thread-turn] span:not([class*="icon"]):not([class*="Icon"]) {
              font-size: ${baseFontSize} !important;
            }
            /* Composer input */
            [role="textbox"],
            [contenteditable="true"] {
              font-size: ${baseFontSize} !important;
            }
            /* Thread items */
            article p,
            article div:not([class*="icon"]):not([class*="Icon"]),
            article span:not([class*="icon"]):not([class*="Icon"]) {
              font-size: ${baseFontSize} !important;
            }
            ${hideComposer ? `
            /* Hide ChatKit composer when using custom input */
            [part*="composer"],
            [data-part*="composer"],
            form[part*="composer"],
            form[data-part*="composer"],
            [role="textbox"],
            [contenteditable="true"] {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              max-height: 0 !important;
              overflow: hidden !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            ` : ''}
          `;
          shadow.appendChild(style);
        }

      } catch (e) {
        if (isDev) console.debug('[ChatKitPanel] style injection error:', e);
      }
    };

    // Observe updates in the shadow DOM and apply styles
    let sanitizeTimeout: number | null = null;
    const sanitizeShadow = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>("openai-chatkit");
        const shadow = wc?.shadowRoot;
        if (!shadow) return;
        sanitizeCitationsDeep(shadow);
        sanitizeCitationsDeep(document.body);
        const iframes = shadow.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          try {
            const doc = iframe.contentDocument;
            if (doc) {
              sanitizeCitationsDeep(doc);
            }
          } catch {}
        });
      } catch (error) {
        if (isDev) console.debug("[ChatKitPanel] sanitize shadow error", error);
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
        mo.observe(shadow, {
          childList: true,
          subtree: true,
          characterData: true, // Also observe text content changes
        });
        // Also run periodically during active streaming (every 200ms)
        sanitizeInterval = window.setInterval(() => {
          sanitizeShadow();
        }, 200);
      } catch (e) {
        if (isDev) console.debug('[ChatKitPanel] style observer error:', e);
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
  }, [hideComposer]);

  // Inject dynamic response buttons for assistant questions
  useEffect(() => {
    const rootNode = chatContainerRef.current;
    if (!rootNode) return;

    // Helper function to detect if a message contains a question
    const detectQuestion = (text: string): { isQuestion: boolean; options?: string[] } => {
      const trimmed = text.trim();
      
      // Check for structured response options in JSON format
      // Format: {"response_options": ["Option 1", "Option 2", "Option 3"]}
      const jsonMatch = trimmed.match(/\{"response_options":\s*\[([\s\S]*?)\]\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.response_options) && parsed.response_options.length > 0) {
            return { isQuestion: true, options: parsed.response_options };
          }
        } catch {}
      }

      // Check for markdown-style options
      // Format: - Option 1\n- Option 2\n- Option 3
      const markdownOptions = trimmed.match(/^[-•]\s*(.+)$/gm);
      if (markdownOptions && markdownOptions.length >= 2) {
        const options = markdownOptions.map(m => m.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
        if (options.length >= 2) {
          return { isQuestion: true, options };
        }
      }

      // Check for numbered options
      // Format: 1. Option 1\n2. Option 2\n3. Option 3
      const numberedOptions = trimmed.match(/^\d+\.\s*(.+)$/gm);
      if (numberedOptions && numberedOptions.length >= 2) {
        const options = numberedOptions.map(m => m.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        if (options.length >= 2) {
          return { isQuestion: true, options };
        }
      }

      // Check for "I can:" or "If you'd like, I can:" patterns with options separated by "or" or newlines
      const iCanPattern = /(?:If you['']d like,?\s*)?I can:?\s*([\s\S]+?)(?:\n\n|\nDid that|$)/i;
      const iCanMatch = trimmed.match(iCanPattern);
      if (iCanMatch && iCanMatch[1]) {
        const optionsText = iCanMatch[1];
        // Split by "or" (with optional semicolon), newlines, or both
        let options = optionsText
          .split(/\s*;\s*or\s*|\s+or\s+|\n+/)
          .map(o => o.trim())
          .filter(o => o.length > 0 && o.length < 200 && !/^Did that/i.test(o));
        
        // If we got options, clean them up
        if (options.length >= 2) {
          // Remove trailing punctuation and clean up
          options = options.map(o => o.replace(/[.;,]+$/, '').trim()).filter(Boolean);
          if (options.length >= 2) {
            return { isQuestion: true, options };
          }
        }
      }

      // Check for options separated by "or" in natural language
      const orPattern = /(?:Would you like|Do you want|I can|You can|Choose|Select|Pick|Options?|Choices?)[:：]?\s*([^?]+(?:\s+or\s+[^?]+)+)/i;
      const orMatch = trimmed.match(orPattern);
      if (orMatch && orMatch[1]) {
        const optionsText = orMatch[1];
        const options = optionsText
          .split(/\s+or\s+/i)
          .map(o => o.trim().replace(/[.;,]+$/, ''))
          .filter(o => o.length > 0 && o.length < 200);
        if (options.length >= 2) {
          return { isQuestion: true, options };
        }
      }

      // Simple question detection (ends with ?)
      const hasQuestionMark = /[?？]/.test(trimmed);
      if (hasQuestionMark) {
        // Try to extract options from common patterns
        const optionPatterns = [
          /(?:Would you like|Do you want|Choose|Select|Pick)\s+(?:one of\s+)?(?:the\s+)?(?:following\s+)?(?:options\s+)?[:：]?\s*([^?]+)/i,
          /(?:Options?|Choices?|Answers?)[:：]?\s*([^?]+)/i,
        ];
        
        for (const pattern of optionPatterns) {
          const match = trimmed.match(pattern);
          if (match && match[1]) {
            const optionsText = match[1];
            // Try to split by commas, semicolons, "or", or newlines
            const options = optionsText
              .split(/[,;，；]|\s+or\s+|\n+/i)
              .map(o => o.trim().replace(/[.;,]+$/, ''))
              .filter(o => o.length > 0 && o.length < 200);
            if (options.length >= 2) {
              return { isQuestion: true, options };
            }
          }
        }
        
        return { isQuestion: true };
      }

      // Check for questions without question marks but with options
      // Pattern: "I can:" or "If you'd like:" followed by options
      const questionWithoutMark = /(?:If you['']d like,?\s*)?(?:I can|You can|Would you like|Do you want)[:：]?\s*([\s\S]+)/i;
      const questionMatch = trimmed.match(questionWithoutMark);
      if (questionMatch && questionMatch[1]) {
        const optionsText = questionMatch[1];
        // Try splitting by "or", newlines, or semicolons
        const options = optionsText
          .split(/\s*;\s*or\s*|\s+or\s+|\n+/i)
          .map(o => o.trim().replace(/[.;,]+$/, ''))
          .filter(o => o.length > 0 && o.length < 200 && !/^Did that/i.test(o));
        
        if (options.length >= 2) {
          return { isQuestion: true, options };
        }
      }

      return { isQuestion: false };
    };

    // Inject response buttons after an assistant message
    const injectResponseButtons = (
      messageElement: Element,
      options: string[],
      chatkitInstance: ReturnType<typeof useChatKit>
    ) => {
      // Check if buttons already exist
      if (messageElement.querySelector('[data-fyi-response-buttons]')) {
        return;
      }

      const buttonContainer = document.createElement('div');
      buttonContainer.setAttribute('data-fyi-response-buttons', '1');
      buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
      `;

      options.forEach((option) => {
        const button = document.createElement('button');
        button.textContent = option;
        button.setAttribute('type', 'button');
        button.style.cssText = `
          padding: 8px 16px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
          color: #0f172a;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        `;
        
        button.addEventListener('mouseenter', () => {
          button.style.background = '#f1f5f9';
          button.style.borderColor = '#94a3b8';
        });
        
        button.addEventListener('mouseleave', () => {
          button.style.background = '#ffffff';
          button.style.borderColor = '#cbd5e1';
        });

        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Disable all buttons
          Array.from(buttonContainer.querySelectorAll('button')).forEach(btn => {
            (btn as HTMLButtonElement).style.opacity = '0.6';
            (btn as HTMLButtonElement).style.cursor = 'not-allowed';
            (btn as HTMLButtonElement).disabled = true;
          });

          try {
            // Check if setComposerValue is available
            if (chatkitInstance && typeof chatkitInstance.setComposerValue === 'function') {
              await chatkitInstance.setComposerValue({ text: option });
              if (typeof chatkitInstance.focusComposer === 'function') {
                await chatkitInstance.focusComposer();
              }
            } else {
              // Fallback: try to find the composer and set value directly
              const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
              const shadow = wc?.shadowRoot;
              if (shadow) {
                const composer = shadow.querySelector('[role="textbox"], [contenteditable="true"]') as HTMLElement;
                if (composer) {
                  composer.textContent = option;
                  composer.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
            }
            
            // Remove buttons after a short delay
            setTimeout(() => {
              buttonContainer.remove();
            }, 300);
          } catch (error) {
            if (isDev) console.error('[ChatKitPanel] Failed to set composer value:', error);
            // Re-enable buttons on error
            Array.from(buttonContainer.querySelectorAll('button')).forEach(btn => {
              (btn as HTMLButtonElement).style.opacity = '1';
              (btn as HTMLButtonElement).style.cursor = 'pointer';
              (btn as HTMLButtonElement).disabled = false;
            });
          }
        });

        buttonContainer.appendChild(button);
      });

      // Append to the message element
      messageElement.appendChild(buttonContainer);
    };

    // Process assistant messages and inject buttons
    const processAssistantMessages = (shadow: ShadowRoot) => {
      try {
        // First, sanitize all citations in the shadow DOM
        sanitizeCitationsDeep(shadow);
        
        // Find all assistant messages - try multiple selectors
        let assistantMessages: NodeListOf<Element> | readonly Element[] = shadow.querySelectorAll('[data-thread-turn][data-message-role="assistant"]');
        if (assistantMessages.length === 0) {
          assistantMessages = shadow.querySelectorAll('[data-thread-turn][data-role="assistant"]');
        }
        if (assistantMessages.length === 0) {
          // Try finding any thread turn that's not a user message
          const allTurns = shadow.querySelectorAll('[data-thread-turn]');
          const filtered = Array.from(allTurns).filter((el) => {
            const role = el.getAttribute('data-message-role') || el.getAttribute('data-role');
            return role !== 'user' && role !== null;
          });
          assistantMessages = filtered;
        }
        
        if (isDev) {
          console.log('[ChatKitPanel] Found', assistantMessages.length, 'assistant messages');
        }

        Array.from(assistantMessages).forEach((messageEl, idx) => {
          // Skip if already processed
          if (messageEl.hasAttribute('data-fyi-processed')) {
            if (isDev) console.log('[ChatKitPanel] Message', idx, 'already processed');
            return;
          }

          // Get message text
          const textContent = messageEl.textContent || '';
          if (isDev) {
            console.log('[ChatKitPanel] Processing message', idx, 'length:', textContent.length, 'preview:', textContent.substring(0, 100));
          }
          
          // Detect question and extract options
          const { isQuestion, options } = detectQuestion(textContent);
          if (isDev) {
            console.log('[ChatKitPanel] Message', idx, 'isQuestion:', isQuestion, 'options:', options);
          }

          if (isQuestion && options && options.length > 0 && chatkit) {
            if (isDev) {
              console.log('[ChatKitPanel] ✅ Detected question with options:', options);
            }
            // Mark as processed
            messageEl.setAttribute('data-fyi-processed', '1');
            
            // Inject buttons
            injectResponseButtons(messageEl, options, chatkit);
          } else if (isQuestion) {
            if (isDev) {
              console.log('[ChatKitPanel] ⚠️ Detected question but no options extracted. Text:', textContent.substring(0, 200));
            }
            // Question detected but no options - mark as processed
            messageEl.setAttribute('data-fyi-processed', '1');
          } else if (isDev) {
            console.log('[ChatKitPanel] ❌ Not a question. Text:', textContent.substring(0, 100));
          }
        });
      } catch (error) {
        if (isDev) console.error('[ChatKitPanel] processAssistantMessages error:', error);
      }
    };

    let responseButtonObserver: MutationObserver | null = null;
    let isObserving = false;
    
    const attachResponseButtonObserver = () => {
      try {
        const wc = rootNode.querySelector<HTMLElement>('openai-chatkit');
        const shadow = wc?.shadowRoot;
        
        // Don't wait for chatkit.control - just need shadow root
        if (!shadow) {
          // Retry after a short delay if shadow root doesn't exist yet
          setTimeout(attachResponseButtonObserver, 500);
          return;
        }

        // If already observing, don't set up again
        if (isObserving) return;

        try {
          responseButtonObserver?.disconnect();
        } catch {}

        // Process existing messages
        processAssistantMessages(shadow);

        // Observe for new messages
        responseButtonObserver = new MutationObserver(() => {
          const currentWc = rootNode.querySelector<HTMLElement>('openai-chatkit');
          const currentShadow = currentWc?.shadowRoot;
          if (currentShadow) {
            processAssistantMessages(currentShadow);
          }
        });

        responseButtonObserver.observe(shadow, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        
        isObserving = true;
        if (isDev) console.log('[ChatKitPanel] Response button observer attached successfully');
      } catch (e) {
        if (isDev) console.debug('[ChatKitPanel] response button observer error:', e);
        // Retry on error
        setTimeout(attachResponseButtonObserver, 500);
      }
    };

    // Start trying to attach immediately, retry if needed
    attachResponseButtonObserver();
    setTimeout(attachResponseButtonObserver, 1000);
    setTimeout(attachResponseButtonObserver, 2000);

    // Cleanup
    return () => {
      try {
        responseButtonObserver?.disconnect();
        isObserving = false;
      } catch {}
    };
  }, [chatkit]);

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
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-slate-900/80">
          <div className="text-slate-600 dark:text-slate-400">Loading assistant session...</div>
        </div>
      )}
      {/* Auto-hide loading overlay after timeout to prevent stuck UI */}
      {isInitializingSession && !blockingError && (
        <LoadingTimeoutHandler 
          isActive={isInitializingSession} 
          onTimeout={() => {
            if (isMountedRef.current) {
              setIsInitializingSession(false);
              isInitializingRef.current = false;
            }
          }} 
        />
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

