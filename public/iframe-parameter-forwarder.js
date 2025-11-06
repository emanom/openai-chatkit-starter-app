/**
 * Auto-forward URL parameters from parent page to iframe
 * 
 * Usage:
 * 1. Add an id to your iframe: <iframe id="chatkit-iframe" ...>
 * 2. Include this script after the iframe
 * 3. All URL parameters from the parent page will be forwarded to the iframe
 */

(function() {
  function forwardParamsToIframe(iframeId) {
    const iframe = document.getElementById(iframeId);
    if (!iframe) {
      console.warn(`[ParamForwarder] Iframe with id "${iframeId}" not found`);
      return;
    }

    const parentParams = new URLSearchParams(window.location.search);
    
    // If parent page has parameters, pass them to iframe
    if (parentParams.toString()) {
      const iframeUrl = new URL(iframe.src, window.location.origin);
      parentParams.forEach((value, key) => {
        iframeUrl.searchParams.set(key, value);
      });
      iframe.src = iframeUrl.toString();
      console.log(`[ParamForwarder] Forwarded parameters to iframe: ${parentParams.toString()}`);
    }
  }

  // Auto-run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => forwardParamsToIframe('chatkit-iframe'));
  } else {
    forwardParamsToIframe('chatkit-iframe');
  }
})();

