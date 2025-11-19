import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentKit demo",
  description: "Demo of ChatKit with hosted workflow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="chatkit-ces-shim" strategy="beforeInteractive">
          {`(() => {
  if (typeof window === "undefined" || typeof window.fetch !== "function" || window.__chatkitCesShimApplied) {
    return;
  }
  window.__chatkitCesShimApplied = true;
  const CES_PATH_PREFIX = "/ces/v1/projects/";
  const allowedHosts = ["chatgpt.com", "chatgpt-staging.com"];
  const matchesCesEndpoint = (target) => {
    if (!target) return false;
    try {
      const parsed = new URL(target, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      const isChatgptHost =
        allowedHosts.some((domain) => host === domain || host.endsWith("." + domain));
      if (!isChatgptHost) return false;
      return parsed.pathname.startsWith(CES_PATH_PREFIX);
    } catch {
      return false;
    }
  };
  const responseInit = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  };
  const payload = JSON.stringify({ enabled: false });
  const originalFetch = window.fetch.bind(window);
  let warned = false;
  window.fetch = function patchedFetch(input, init) {
    try {
      const target =
        typeof input === "string"
          ? input
          : typeof Request !== "undefined" && input instanceof Request
          ? input.url
          : input && typeof input === "object"
          ? input.url
          : null;
      if (matchesCesEndpoint(target)) {
        if (!warned && window.console?.warn) {
          warned = true;
          window.console.warn("[ChatKit] CES fetch blocked to avoid cross-origin errors.");
        }
        return Promise.resolve(new Response(payload, responseInit));
      }
    } catch {
      // fall through
    }
    return originalFetch(input, init);
  };
})();`}
        </Script>
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
