"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type TestResult = {
  value: unknown;
  success: boolean;
  description: string;
};

function AssistantDebugContent() {
  const searchParams = useSearchParams();
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isIframe, setIsIframe] = useState(false);

  // Test 8: postMessage listener (separate useEffect)
  useEffect(() => {
    if (!isIframe) return;
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object') {
        const firstName = (event.data as Record<string, unknown>).firstName || (event.data as Record<string, unknown>)['first-name'];
        if (firstName && typeof firstName === 'string') {
          setResults(prev => ({
            ...prev,
            '8_postmessage': {
              value: {
                origin: event.origin,
                data: event.data,
                firstName
              },
              success: true,
              description: 'postMessage from parent window'
            }
          }));
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Request parent to send data via postMessage
    window.parent.postMessage({ type: 'request-parent-url' }, '*');
    
    return () => window.removeEventListener('message', handleMessage);
  }, [isIframe]);

  useEffect(() => {
    const testResults: Record<string, TestResult> = {};
    
    // Test 1: Check if we're in an iframe
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;
    setIsIframe(inIframe);
    testResults['1_in_iframe'] = {
      value: inIframe,
      success: true,
      description: 'Detected if we are in an iframe'
    };

    // Test 2: Direct URL query parameters
    const urlParams = {
      'first-name': searchParams.get('first-name'),
      'firstName': searchParams.get('firstName'),
      'firstname': searchParams.get('firstname'),
    };
    testResults['2_url_query_params'] = {
      value: urlParams,
      success: Object.values(urlParams).some(v => v && !v.includes('{{')),
      description: 'Query parameters from current page URL'
    };

    // Test 3: document.referrer
    try {
      const referrer = typeof document !== 'undefined' ? document.referrer : null;
      let referrerParams: Record<string, string> = {};
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          referrerUrl.searchParams.forEach((value, key) => {
            referrerParams[key] = value;
          });
        } catch (e) {
          referrerParams = { error: String(e) };
        }
      }
      testResults['3_document_referrer'] = {
        value: {
          referrer,
          hostname: referrer ? new URL(referrer).hostname : null,
          params: referrerParams,
          'first-name': referrerParams['first-name'] || referrerParams['first_name']
        },
        success: !!(referrerParams['first-name'] || referrerParams['first_name']),
        description: 'document.referrer (browsers often strip query params)'
      };
    } catch (e) {
      testResults['3_document_referrer'] = {
        value: { error: String(e) },
        success: false,
        description: 'document.referrer (error)'
      };
    }

    // Test 4: window.parent.location (cross-origin)
    if (inIframe) {
      try {
        const parentUrl = window.parent.location.href;
        const parentSearch = window.parent.location.search;
        const parentParams = new URLSearchParams(parentSearch);
        const parentFirstName = parentParams.get('first-name') || parentParams.get('first_name');
        testResults['4_parent_location'] = {
          value: {
            url: parentUrl,
            search: parentSearch,
            'first-name': parentFirstName
          },
          success: !!parentFirstName,
          description: 'window.parent.location (works if same-origin)'
        };
      } catch (e) {
        testResults['4_parent_location'] = {
          value: { 
            error: String(e),
            errorType: e instanceof DOMException ? 'DOMException' : 'Other',
            code: e instanceof DOMException ? e.code : null
          },
          success: false,
          description: 'window.parent.location (cross-origin blocked)'
        };
      }
    } else {
      testResults['4_parent_location'] = {
        value: null,
        success: false,
        description: 'window.parent.location (not in iframe)'
      };
    }

    // Test 5: Cookies set by middleware
    try {
      const cookies = typeof document !== 'undefined' ? document.cookie : '';
      const cookieValue = cookies
        .split('; ')
        .find(row => row.startsWith('assistant-first-name='))
        ?.split('=')[1];
      testResults['5_cookie_from_middleware'] = {
        value: {
          allCookies: cookies,
          'assistant-first-name': cookieValue ? decodeURIComponent(cookieValue) : null
        },
        success: !!cookieValue,
        description: 'Cookie set by middleware (from Referer header)'
      };
    } catch (e) {
      testResults['5_cookie_from_middleware'] = {
        value: { error: String(e) },
        success: false,
        description: 'Cookie reading (error)'
      };
    }

    // Test 6: API endpoint that reads Referer header
    if (inIframe) {
      fetch('/api/get-parent-params')
        .then(res => res.json())
        .then(data => {
          testResults['6_api_referer_header'] = {
            value: data,
            success: !!(data.params && (data.params['first-name'] || data.params['first_name']) && 
                      !data.params['first-name']?.includes('{{')),
            description: 'API endpoint reading Referer header (server-side)'
          };
          setResults(prev => ({ ...prev, ...testResults }));
        })
        .catch(e => {
          testResults['6_api_referer_header'] = {
            value: { error: String(e) },
            success: false,
            description: 'API endpoint (fetch error)'
          };
          setResults(prev => ({ ...prev, ...testResults }));
        });
    } else {
      testResults['6_api_referer_header'] = {
        value: null,
        success: false,
        description: 'API endpoint (not in iframe, skipping)'
      };
    }

    // Test 7: URL hash fragments
    try {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const hashParams: Record<string, string> = {};
      if (hash) {
        const hashSearch = hash.startsWith('#') ? hash.slice(1) : hash;
        const params = new URLSearchParams(hashSearch);
        params.forEach((value, key) => {
          hashParams[key] = value;
        });
      }
      testResults['7_url_hash'] = {
        value: {
          hash,
          params: hashParams,
          'first-name': hashParams['first-name'] || hashParams['first_name']
        },
        success: !!(hashParams['first-name'] || hashParams['first_name']),
        description: 'URL hash fragments (#param=value)'
      };
    } catch (e) {
      testResults['7_url_hash'] = {
        value: { error: String(e) },
        success: false,
        description: 'URL hash (error)'
      };
    }

    // Test 8: postMessage listener (initialized in separate useEffect above)
    testResults['8_postmessage'] = {
      value: { waiting: true },
      success: false,
      description: 'postMessage from parent (waiting for message)'
    };

    // Test 9: window.name (sometimes used to pass data)
    try {
      const windowName = typeof window !== 'undefined' ? window.name : '';
      let nameData: Record<string, unknown> | string | null = null;
      try {
        nameData = windowName ? JSON.parse(windowName) : null;
      } catch {
        nameData = windowName;
      }
      const nameDataObj = nameData && typeof nameData === 'object' ? nameData as Record<string, unknown> : null;
      const firstNameFromName = nameDataObj ? (nameDataObj['first-name'] || nameDataObj.firstName) : null;
      testResults['9_window_name'] = {
        value: {
          name: windowName,
          parsed: nameData
        },
        success: !!(firstNameFromName),
        description: 'window.name property (sometimes used to pass data)'
      };
    } catch (e) {
      testResults['9_window_name'] = {
        value: { error: String(e) },
        success: false,
        description: 'window.name (error)'
      };
    }

    // Test 10: Check if template variables are present
    const hasTemplateVars = Object.values(urlParams).some(v => v && (v.includes('{{') || v.includes('}}')));
    testResults['10_template_variables'] = {
      value: {
        detected: hasTemplateVars,
        variables: Object.entries(urlParams).filter(([, v]) => v && (v.includes('{{') || v.includes('}}')))
      },
      success: !hasTemplateVars,
      description: 'Template variables detected (Zapier not interpolating)'
    };

    setResults(testResults);
  }, [searchParams, isIframe]);

  // Extract the best firstName value found
  const getFirstNameFromValue = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;
    const obj = value as Record<string, unknown>;
    const firstName = obj['first-name'] || obj.firstName || (obj.params && typeof obj.params === 'object' ? (obj.params as Record<string, unknown>)['first-name'] : null);
    return typeof firstName === 'string' ? firstName : null;
  };

  const bestFirstName = (() => {
    // First try: successful result without template variables
    const successResult = Object.values(results).find(r => {
      if (!r?.success) return false;
      const firstName = getFirstNameFromValue(r.value);
      return firstName && !firstName.includes('{{');
    });
    if (successResult) return getFirstNameFromValue(successResult.value);

    // Second try: any result without template variables
    const cleanResult = Object.values(results).find(r => {
      const firstName = getFirstNameFromValue(r.value);
      return firstName && !firstName.includes('{{');
    });
    if (cleanResult) return getFirstNameFromValue(cleanResult.value);

    return null;
  })();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Assistant Parameter Debug Page</h1>
        <p className="text-gray-600 mb-6">
          This page tests all possible methods to read parameters from the parent page URL.
          Embed this page in your Zapier interface to see what works.
        </p>

        {/* Summary */}
        <div className={`mb-6 p-4 rounded-lg border-2 ${
          bestFirstName 
            ? 'bg-green-50 border-green-200' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <h2 className="text-xl font-semibold mb-2">
            {bestFirstName ? '✅ Parameter Found!' : '❌ No Parameter Found'}
          </h2>
          {bestFirstName ? (
            <p className="text-lg">
              <strong>First Name:</strong> <code className="bg-white px-2 py-1 rounded">{bestFirstName}</code>
            </p>
          ) : (
            <p>No valid first-name parameter was found using any method.</p>
          )}
        </div>

        {/* Test Results */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Test Results</h2>
          
          {Object.entries(results)
            .sort(([a], [b]) => parseInt(a.split('_')[0]) - parseInt(b.split('_')[0]))
            .map(([key, result]) => (
            <div
              key={key}
              className={`p-4 rounded-lg border-2 ${
                result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">
                  {result.success ? '✅' : '❌'} {result.description}
                </h3>
                <span className={`px-2 py-1 rounded text-sm ${
                  result.success
                    ? 'bg-green-200 text-green-800'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {result.success ? 'SUCCESS' : 'FAILED'}
                </span>
              </div>
              <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto text-xs">
                {JSON.stringify(result.value, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
            <li>Embed this page in your Zapier interface using an iframe</li>
            <li>Visit the Zapier page with <code>?first-name=John</code> in the URL</li>
            <li>Check which test methods successfully read the parameter</li>
            <li>Use the successful method in the actual assistant page</li>
          </ol>
          <p className="mt-2 text-sm text-blue-700">
            <strong>Current URL:</strong> <code>{typeof window !== 'undefined' ? window.location.href : 'N/A'}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AssistantDebugPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-gray-500">Loading debug page...</div>
        </div>
      }
    >
      <AssistantDebugContent />
    </Suspense>
  );
}

