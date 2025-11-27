"use client";

import { useState, useCallback, useRef, useEffect, useMemo, DragEvent } from "react";
import type { UserMetadata, UserMetadataKey } from "@/types/userMetadata";
import { USER_METADATA_KEYS } from "@/types/userMetadata";

interface SupportRequestFormProps {
  firstName?: string | null;
  sessionId?: string;
  conversationId?: string | null;
  threadId?: string | null;
  conversationLink?: string;
  onClose: () => void;
  onSuccess?: () => void;
  metadata?: UserMetadata;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  description: string;
  videoLink: string;
  relatedPageLink: string;
  files: File[];
}

export default function SupportRequestForm({
  firstName,
  sessionId,
  conversationId,
  threadId,
  conversationLink,
  onClose,
  onSuccess,
  metadata,
}: SupportRequestFormProps) {
  const [formData, setFormData] = useState<FormData>(() => ({
    firstName: firstName || metadata?.first_name || "",
    lastName: metadata?.last_name || "",
    email: metadata?.user_email || "",
    description: "",
    videoLink: "",
    relatedPageLink: metadata?.link_url || "",
    files: [],
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData((prev) => {
      const nextFirstName = prev.firstName || metadata?.first_name || "";
      const nextLastName = prev.lastName || metadata?.last_name || "";
      const nextEmail = prev.email || metadata?.user_email || "";
      const nextRelatedLink = prev.relatedPageLink || metadata?.link_url || "";
      if (
        nextFirstName === prev.firstName &&
        nextLastName === prev.lastName &&
        nextEmail === prev.email &&
        nextRelatedLink === prev.relatedPageLink
      ) {
        return prev;
      }
      return {
        ...prev,
        firstName: nextFirstName,
        lastName: nextLastName,
        email: nextEmail,
        relatedPageLink: nextRelatedLink,
      };
    });
  }, [
    metadata?.first_name,
    metadata?.last_name,
    metadata?.user_email,
    metadata?.link_url,
  ]);

  const metadataPayload = useMemo(() => {
    const payload: UserMetadata = {};
    const assign = (key: UserMetadataKey, value?: string | null) => {
      if (typeof value === "string" && value.trim()) {
        payload[key] = value.trim();
      }
    };
    assign("first_name", formData.firstName || metadata?.first_name);
    assign("last_name", formData.lastName || metadata?.last_name);
    assign("user_email", formData.email || metadata?.user_email);
    assign("link_url", formData.relatedPageLink || metadata?.link_url);
    assign("user_subscription_plan", metadata?.user_subscription_plan);
    assign("user_admin_status", metadata?.user_admin_status);
    assign("fyi_region", metadata?.fyi_region);
    assign("practice_mgmt", metadata?.practice_mgmt);
    assign("fyi_age", metadata?.fyi_age);
    return payload;
  }, [formData.firstName, formData.lastName, formData.email, formData.relatedPageLink, metadata]);

  const hiddenMetadataKeys = useMemo<UserMetadataKey[]>(
    () =>
      USER_METADATA_KEYS.filter(
        (key): key is UserMetadataKey => key !== "user_email"
      ),
    []
  );

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

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
            // This header must be sent because the presigned URL signs SSE usage.
            "x-amz-server-side-encryption": "AES256",
          };
          
          // Don't send checksum headers - the presigned URL should not have checksum parameters
          // If it does, they've been removed server-side because they weren't in the signed headers
          // Sending checksum headers would cause "headers not signed" errors
          
          console.log("[SupportRequestForm] Uploading file with headers:", Object.keys(headers));
          
          // Upload file to S3
          const uploadResponse = await fetch(url, {
            method: "PUT",
            body: file,
            headers,
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text().catch(() => "Unknown error");
            console.error("[SupportRequestForm] Upload failed:", uploadResponse.status, errorText);
            throw new Error(`Failed to upload file: ${uploadResponse.status} ${errorText}`);
          }

          // Store the S3 key/URL (you may want to construct a public URL)
          fileUrls.push(key);
        }
      }

      // Submit form data to Zapier webhook
      const response = await fetch("/api/submit-support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          description: formData.description,
          videoLink: formData.videoLink,
          relatedPageLink: formData.relatedPageLink || metadata?.link_url || "",
          files: fileUrls,
          chatSessionId: sessionId,
          threadId: threadId,
          conversationId: conversationId,
          conversationLink: conversationLink,
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
    } catch (error) {
      console.error("[SupportRequestForm] Submission error:", error);
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to submit form. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-xl">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
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

        <p className="text-gray-600 mb-4">
          Share a detailed description of the issue or question so our team has the full context.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {hiddenMetadataKeys.map((key) => (
            <input
              key={key}
              type="hidden"
              name={`meta.${key}`}
              value={metadataPayload[key] ?? ""}
              readOnly
            />
          ))}
          <input type="hidden" name="firstName" value={formData.firstName} readOnly />
          <input type="hidden" name="lastName" value={formData.lastName} readOnly />

          {/* Related FYI Page Link */}
          <div>
            <label htmlFor="relatedPageLink" className="block text-sm font-medium text-gray-700 mb-2">
              Related FYI Page Link
            </label>
            <input
              type="url"
              id="relatedPageLink"
              value={formData.relatedPageLink}
              onChange={(e) => setFormData({ ...formData, relatedPageLink: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              placeholder="https://..."
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Include any information to help us resolve your request. (step-by-step instructions to replicate, number of users affected...)
            </p>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              placeholder="Enter description with details..."
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">Your registered email address.</p>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
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

          {/* Screenshots or Files */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Screenshots or Files
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
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
                className="mx-auto h-10 w-10 text-gray-400 mb-4"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 01-7.78-7.78l8.49-8.49a3.5 3.5 0 014.95 4.95l-8.49 8.49a1.5 1.5 0 01-2.12-2.12l7.78-7.78"
                  strokeWidth={1.8}
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
              <div className="mt-3 space-y-2">
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
          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex gap-4 pt-3">
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

