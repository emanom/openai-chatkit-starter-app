"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Loader page that receives parameters from Zapier and embeds the assistant iframe
 * 
 * Usage in Zapier:
 * Redirect to: https://main.d2xcz3k9ugtvab.amplifyapp.com/assistant-loader?first_name={{query.first_name}}
 * 
 * This page will then embed the assistant iframe with the parameter properly set
 */
function AssistantLoaderContent() {
  const searchParams = useSearchParams();
  const [iframeSrc, setIframeSrc] = useState<string>("");
  
  useEffect(() => {
    const rawFirstName = searchParams.get("first_name") || 
                     searchParams.get("first-name") ||
                     searchParams.get("firstName") || 
                     searchParams.get("firstname");
    const firstName =
      rawFirstName && !rawFirstName.includes("{{") && !rawFirstName.includes("}}")
        ? rawFirstName
        : null;
    
    // Build iframe URL with parameter
    const assistantUrl = new URL("/assistant", window.location.origin);
    if (firstName) {
      assistantUrl.searchParams.set("first_name", firstName);
    }
    
    setIframeSrc(assistantUrl.toString());
  }, [searchParams]);
  
  if (!iframeSrc) {
    return (
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh",
        fontSize: "18px"
      }}>
        Loading assistant...
      </div>
    );
  }
  
  return (
    <div style={{ width: "100%", height: "100vh", margin: 0, padding: 0 }}>
      <iframe
        src={iframeSrc}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          border: "none",
        }}
        title="FYI Support Assistant"
      />
    </div>
  );
}

export default function AssistantLoaderPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh",
        fontSize: "18px"
      }}>
        Loading...
      </div>
    }>
      <AssistantLoaderContent />
    </Suspense>
  );
}

