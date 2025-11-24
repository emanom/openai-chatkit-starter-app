"use client";

import { useState, useCallback, useRef, useEffect, useMemo, DragEvent } from "react";
import type { UserMetadata, UserMetadataKey } from "@/types/userMetadata";
import { USER_METADATA_KEYS } from "@/types/userMetadata";

interface ConversationSupportFormProps {
  sessionId?: string;
  conversationId?: string | null;
  threadId?: string | null;
  conversationLink?: string;
  onClose: () => void;
  onSuccess?: () => void;
  metadata?: UserMetadata;
  firstName?: string | null;
  lastName?: string | null;
}

interface FormData {
  email: string;
  videoLink: string;
  otherDetails: string;
  files: File[];
}

export default function ConversationSupportForm({
  sessionId,
  conversationId,
  threadId,
  conversationLink,
  onClose,
  onSuccess,
  metadata,
  firstName,
  lastName,
}: ConversationSupportFormProps) {
  const [formData, setFormData] = useState<FormData>({
    email: metadata?.user_email || "",
    videoLink: "",
    otherDetails: "",
    files: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolvedFirstName = useMemo(() => {
    const fromProp = typeof firstName === "string" ? firstName.trim() : "";
    if (fromProp) return fromProp;
    return typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
  }, [firstName, metadata?.first_name]);

  const resolvedLastName = useMemo(() => {
    const fromProp = typeof lastName === "string" ? lastName.trim() : "";
    if (fromProp) return fromProp;
    return typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
  }, [lastName, metadata?.last_name]);

  useEffect(() => {
    setFormData((prev) => {
      const nextEmail = prev.email || metadata?.user_email || "";
      if (nextEmail === prev.email) {
        return prev;
      }
      return {
        ...prev,
        email: nextEmail,
      };
    });
  }, [metadata?.user_email]);

  const metadataPayload = useMemo(() => {
    const payload: UserMetadata = {};
    const assign = (key: UserMetadataKey, value?: string | null) => {
      if (typeof value === "string" && value.trim()) {
        payload[key] = value.trim();
      }
    };
    assign("first_name", resolvedFirstName || metadata?.first_name);
    assign("last_name", resolvedLastName || metadata?.last_name);
    assign("user_email", formData.email || metadata?.user_email);
    assign("link_url", metadata?.link_url);
    assign("user_subscription_plan", metadata?.user_subscription_plan);
    assign("user_admin_status", metadata?.user_admin_status);
    assign("fyi_region", metadata?.fyi_region);
    assign("practice_mgmt", metadata?.practice_mgmt);
    assign("fyi_age", metadata?.fyi_age);
    return payload;
  }, [formData.email, metadata, resolvedFirstName, resolvedLastName]);

  const hiddenMetadataKeys = useMemo<UserMetadataKey[]>(
    () =>
      USER_METADATA_KEYS.filter(
        (key): key is UserMetadataKey => key !== "user_email"
      ),
    []
  );

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Validate file size (max 10MB per file)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }
      validFiles.push(file);
    }

    setFormData((prev) => ({
      ...prev,
      files: [...prev.files, ...validFiles],
    }));
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setError("");

    try {
      // Upload files first if any
      const fileUrls: string[] = [];
      if (formData.files.length > 0) {
        for (const file of formData.files) {
          // Get presigned URL
          const presignResponse = await fetch("/api/attachments/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appSessionId: sessionId || "form-submission",
              filename: file.name,
              mime: file.type,
              size: file.size,
            }),
          });

          if (!presignResponse.ok) {
            throw new Error("Failed to get upload URL");
          }

          const { url, key } = await presignResponse.json();

          // Parse the presigned URL to extract required headers from query params
          const urlObj = new URL(url);
          const headers: Record<string, string> = {
            "Content-Type": file.type,
            // SSE is part of the signed headers, so we must include it here.
            "x-amz-server-side-encryption": "AES256",
          };
          
          // Don't send checksum headers - the presigned URL should not have checksum parameters
          // If it does, they've been removed server-side because they weren't in the signed headers
          // Sending checksum headers would cause "headers not signed" errors
          
          // Upload file to S3
          const uploadResponse = await fetch(url, {
            method: "PUT",
            body: file,
            headers,
          });

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload file");
          }

          // Store the S3 key/URL
          fileUrls.push(key);
        }
      }

      // Submit form data to Zapier webhook
      const response = await fetch("/api/submit-support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: formData.email || metadata?.user_email || "",
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          videoLink: formData.videoLink,
          otherDetails: formData.otherDetails,
          files: fileUrls,
          chatSessionId: sessionId,
          threadId: threadId,
          conversationId: conversationId,
          conversationLink: conversationLink,
          isConversationRequest: true, // Flag to indicate this is from conversation
          metadata: metadataPayload,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit form");
      }

      // Success
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      console.error("[ConversationSupportForm] Submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-lg shadow-xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Support Request</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          Add any extra details to help our team resolve your request faster, the chat history will already be included.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {hiddenMetadataKeys.map((key) => (
            <input
              key={key}
              type="hidden"
              name={`meta.${key}`}
              value={metadataPayload[key] ?? ""}
              readOnly
            />
          ))}

          {/* Contact Email */}
          <div>
            <label htmlFor="conversation-email" className="block text-sm font-medium text-gray-700 mb-2">
              Contact Email <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              We&apos;ll use this address to follow up on your request.
            </p>
            <input
              type="email"
              id="conversation-email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required={!metadata?.user_email}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              placeholder="you@practice.com"
            />
          </div>

          {/* Video Recording Link */}
          <div>
            <label htmlFor="videoLink" className="block text-sm font-medium text-gray-700 mb-2">
              Video Recording Link
            </label>
            <p className="text-xs text-gray-500 mb-2">
              <a
                href="https://go.fyi.app/recordme/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-700 underline"
              >
                Click here
              </a>{" "}
              to record a video of your issue in FYI and paste the link here.
            </p>
            <input
              type="url"
              id="videoLink"
              value={formData.videoLink}
              onChange={(e) => setFormData({ ...formData, videoLink: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              placeholder="https://..."
            />
          </div>

          {/* Upload Screenshots */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Screenshots
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging ? "border-green-500 bg-green-50" : "border-gray-300"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
              />
              <svg
                className="mx-auto h-12 w-12 text-gray-400 mb-4"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 8M9 32h10m-10 0v10a4 4 0 004 4h10m-14-14v-10"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-sm text-gray-600 mb-2">
                Drag your files here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-green-600 hover:text-green-700 font-medium"
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-gray-500">Maximum 10MB per file</p>
            </div>

            {/* File list */}
            {formData.files.length > 0 && (
              <div className="mt-4 space-y-2">
                {formData.files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded border"
                  >
                    <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                    <span className="text-xs text-gray-500 mr-2">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Details */}
          <div>
            <label htmlFor="otherDetails" className="block text-sm font-medium text-gray-700 mb-2">
              Other Details
            </label>
            <p className="text-xs text-gray-500 mb-2">
              <strong>Suggestions:</strong> Include steps to reproduce, when it started, how many users are affected, or example links.
            </p>
            <textarea
              id="otherDetails"
              value={formData.otherDetails}
              onChange={(e) => setFormData({ ...formData, otherDetails: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              placeholder="Enter additional details..."
            />
          </div>

          {/* Hidden fields for conversation data */}
          {sessionId && (
            <input type="hidden" name="chat-session-id" value={sessionId} />
          )}
          {threadId && <input type="hidden" name="thread-id" value={threadId} />}
          {conversationId && (
            <input type="hidden" name="openai-conversation-id" value={conversationId} />
          )}
          {conversationLink && (
            <input type="hidden" name="conversation-link" value={conversationLink} />
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

