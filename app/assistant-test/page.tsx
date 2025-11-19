"use client";

import { useState } from "react";

export default function AssistantTestPage() {
  const [firstName, setFirstName] = useState("John");
  const [iframeKey, setIframeKey] = useState(0);

  const buildAssistantUrl = () => {
    const params = new URLSearchParams();
    if (firstName.trim()) {
      params.set("first-name", firstName.trim());
    }
    return `/assistant${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const updateIframe = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Assistant Embed Test Page
          </h1>
          <p className="text-gray-600">
            Test the embedded assistant page with query parameters. The assistant
            will be displayed in an iframe below.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Test Parameters
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="first-name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                First Name
              </label>
              <input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter first name"
              />
              <p className="mt-1 text-sm text-gray-500">
                This will be used in the chat greeting message
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={updateIframe}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Update Assistant
              </button>
              <a
                href={buildAssistantUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium inline-flex items-center"
              >
                Open in New Tab
                <svg
                  className="ml-2 w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-1">
                <strong>Current URL:</strong>
              </p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 break-all">
                {buildAssistantUrl()}
              </code>
            </div>
          </div>
        </div>

        {/* Embedded Assistant */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700">
              Embedded Assistant
            </h3>
          </div>
          <iframe
            key={iframeKey}
            src={buildAssistantUrl()}
            width="100%"
            height="800"
            style={{ border: "none" }}
            allow="clipboard-read; clipboard-write"
            title="FYI Support Assistant"
            className="w-full"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            How to use:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Enter a first name in the input field above</li>
            <li>Click &quot;Update Assistant&quot; to reload the iframe with new parameters</li>
            <li>Or click &quot;Open in New Tab&quot; to view the assistant page directly</li>
            <li>
              The greeting message will personalize based on the first-name
              parameter
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

