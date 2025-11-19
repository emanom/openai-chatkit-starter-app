/**
 * Assistant Embed Helper
 * 
 * This script automatically passes query parameters from the parent page
 * to the embedded assistant iframe.
 * 
 * Usage:
 * 1. Include this script in your page
 * 2. Add data-assistant-url attribute to your iframe with the base URL
 * 3. The script will automatically append query parameters
 * 
 * Example:
 * <iframe 
 *   id="assistant-iframe"
 *   data-assistant-url="https://your-domain.com/assistant"
 *   width="100%" 
 *   height="800"
 * ></iframe>
 * 
 * <script src="assistant-embed-helper.js"></script>
 */

(function() {
  'use strict';

  /**
   * Get query parameters from the current page URL
   * @returns {URLSearchParams} Search params object
   */
  function getParentQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams;
  }

  /**
   * Build the iframe URL with query parameters from parent page
   * @param {string} baseUrl - Base URL for the assistant page
   * @param {Array<string>} allowedParams - Array of parameter names to pass through (optional)
   * @returns {string} Complete URL with query parameters
   */
  function buildIframeUrl(baseUrl, allowedParams) {
    const parentParams = getParentQueryParams();
    const iframeParams = new URLSearchParams();
    
    // If allowedParams is specified, only pass those parameters
    // Otherwise, pass all parameters
    const paramsToPass = allowedParams || Array.from(parentParams.keys());
    
    paramsToPass.forEach(key => {
      const value = parentParams.get(key);
      if (value) {
        // Map first_name to first-name if needed (for backward compatibility)
        if (key === 'first_name') {
          iframeParams.set('first-name', value);
        } else {
          iframeParams.set(key, value);
        }
      }
    });
    
    const queryString = iframeParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  /**
   * Initialize all assistant iframes on the page
   */
  function initAssistantIframes() {
    // Find all iframes with data-assistant-url attribute
    const iframes = document.querySelectorAll('iframe[data-assistant-url]');
    
    iframes.forEach(iframe => {
      const baseUrl = iframe.getAttribute('data-assistant-url');
      if (!baseUrl) return;
      
      // Get allowed parameters from data attribute (comma-separated)
      const allowedParamsAttr = iframe.getAttribute('data-allowed-params');
      const allowedParams = allowedParamsAttr 
        ? allowedParamsAttr.split(',').map(p => p.trim())
        : null;
      
      // Build URL with query parameters
      const urlWithParams = buildIframeUrl(baseUrl, allowedParams);
      
      // Update iframe src
      iframe.setAttribute('src', urlWithParams);
    });
  }

  /**
   * Initialize when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAssistantIframes);
  } else {
    // DOM is already ready
    initAssistantIframes();
  }

  // Also expose a function for manual initialization
  window.initAssistantIframes = initAssistantIframes;
  window.buildAssistantUrl = buildIframeUrl;
})();

