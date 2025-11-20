"use client";

import { useCallback, Suspense, useEffect, useRef, useMemo, useState } from "react";
import { useChatKit, ChatKit } from "@openai/chatkit-react";
import { useSearchParams } from "next/navigation";
import { CREATE_SESSION_ENDPOINT, WORKFLOW_ID } from "@/lib/config";

function AssistantWithFormContent() {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  
  // Get first-name from query parameters (try multiple variations)
  const firstNameFromUrl = searchParams.get("first-name") || 
                          searchParams.get("firstName") ||
                          searchParams.get("firstname");
  
  useEffect(() => {
    if (firstNameFromUrl && !firstNameFromUrl.includes('{{')) {
      setFirstName(firstNameFromUrl);
      
      // Build Zapier form URL with the parameter
      const zapierFormUrl = new URL("https://fyi-support-centre.zapier.app/support-request-form");
      zapierFormUrl.searchParams.set("first-name", firstNameFromUrl);
      setIframeSrc(zapierFormUrl.toString());
    } else {
      // Default Zapier form URL without parameter
      setIframeSrc("https://fyi-support-centre.zapier.app/support-request-form");
    }
  }, [firstNameFromUrl]);
  
  // Create personalized greeting
  const greeting = useMemo(() => {
    if (firstName) {
      return `Hi ${firstName}! How can I help you today?`;
    }
    return "Hi! How can I help you today?";
  }, [firstName]);

  const { chatKit, sessionId } = useChatKit({
    endpoint: CREATE_SESSION_ENDPOINT,
    workflowId: WORKFLOW_ID,
    greeting,
  });

  const handleWidgetAction = useCallback(
    async (action: { type: string; [key: string]: unknown }) => {
      console.log("[AssistantWithForm] Widget action:", action);
    },
    []
  );

  const handleResponseEnd = useCallback(() => {
    console.log("[AssistantWithForm] Response ended");
  }, []);

  // Also try to send firstName to Zapier form via postMessage (if it supports it)
  useEffect(() => {
    if (firstName && iframeSrc) {
      // Wait for iframe to load, then try to send postMessage
      const timer = setTimeout(() => {
        const iframe = document.querySelector('iframe[title="Support Request Form"]') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          try {
            iframe.contentWindow.postMessage(
              { firstName, 'first-name': firstName },
              'https://fyi-support-centre.zapier.app'
            );
            console.log('[AssistantWithForm] Sent firstName to Zapier form via postMessage:', firstName);
          } catch (e) {
            console.debug('[AssistantWithForm] Could not send postMessage to Zapier form:', e);
          }
        }
      }, 2000); // Wait 2 seconds for iframe to load
      
      return () => clearTimeout(timer);
    }
  }, [firstName, iframeSrc]);

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Chatbot Section */}
      <div className="flex-1 flex flex-col min-h-0" ref={chatContainerRef}>
        <div className="flex-1 overflow-hidden">
          {chatKit && (
            <ChatKit
              chatKit={chatKit}
              onWidgetAction={handleWidgetAction}
              onResponseEnd={handleResponseEnd}
            />
          )}
        </div>
      </div>
      
      {/* Zapier Form Section */}
      <div className="border-t border-gray-200" style={{ height: '600px', minHeight: '600px' }}>
        <div className="h-full w-full">
          {iframeSrc && (
            <iframe
              title="Support Request Form"
              src={iframeSrc}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
              allow="forms"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssistantWithFormPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    }>
      <AssistantWithFormContent />
    </Suspense>
  );
}

