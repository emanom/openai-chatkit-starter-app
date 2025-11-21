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
  if (typeof window === "undefined" || window.__chatkitCesShimApplied) {
    return;
  }
  window.__chatkitCesShimApplied = true;
  
  // Suppress console errors for ChatKit CORS issues
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  const shouldSuppress = (message) => {
    if (typeof message !== 'string') {
      try {
        message = String(message);
      } catch {
        return false;
      }
    }
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('chatgpt.com/ces/v1/projects/oai/settings') ||
      lowerMessage.includes('ces/v1/projects/oai/settings') ||
      lowerMessage.includes('chatgpt.com/ces/v1') ||
      lowerMessage.includes('cors policy') ||
      lowerMessage.includes('access-control-allow-origin') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.includes('err_failed 403') ||
      lowerMessage.includes('err_failed') ||
      lowerMessage.includes('403 (forbidden)') ||
      lowerMessage.includes('net::err_failed') ||
      lowerMessage.includes('get https://chatgpt.com/ces') ||
      lowerMessage.includes('index-di-n-trp.js') ||
      lowerMessage.includes('index-bycafqq_.js') ||
      (lowerMessage.includes('access to fetch') && lowerMessage.includes('chatgpt.com')) ||
      (lowerMessage.includes('blocked by cors') && lowerMessage.includes('chatgpt.com')) ||
      (lowerMessage.includes('from origin') && lowerMessage.includes('cdn.platform.openai.com') && lowerMessage.includes('chatgpt.com')) ||
      (lowerMessage.includes('cdn.platform.openai.com') && lowerMessage.includes('chatgpt.com') && (lowerMessage.includes('blocked') || lowerMessage.includes('cors'))) ||
      (lowerMessage.includes('cdn.platform.openai.com/deployments/chatkit/index-') && lowerMessage.includes('chatgpt.com'))
    );
  };
  
  const formatMessage = (...args) => {
    try {
      return args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg && typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
    } catch {
      return String(args);
    }
  };
  
  console.error = function(...args) {
    const message = formatMessage(...args);
    if (shouldSuppress(message)) {
      return;
    }
    originalError.apply(console, args);
  };
  
  console.warn = function(...args) {
    const message = formatMessage(...args);
    if (shouldSuppress(message)) {
      return;
    }
    originalWarn.apply(console, args);
  };
  
  console.log = function(...args) {
    const message = formatMessage(...args);
    if (shouldSuppress(message)) {
      return;
    }
    originalLog.apply(console, args);
  };
  
  // Also catch unhandled errors and promise rejections
  window.addEventListener('error', function(event) {
    const message = event.message || String(event.error || '');
    if (shouldSuppress(message)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true);
  
  window.addEventListener('unhandledrejection', function(event) {
    const message = event.reason ? String(event.reason) : '';
    if (shouldSuppress(message)) {
      event.preventDefault();
      return false;
    }
  });
  
  // CES endpoint blocking
  if (typeof window.fetch === "function") {
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
          return Promise.resolve(new Response(payload, responseInit));
        }
      } catch {
        // fall through
      }
      return originalFetch(input, init);
    };
  }
})();`}
        </Script>
        <link
          rel="preload"
          href="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          as="script"
          crossOrigin="anonymous"
        />
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
