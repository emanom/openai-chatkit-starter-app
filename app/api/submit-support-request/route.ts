import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UserMetadata, UserMetadataKey } from "@/types/userMetadata";
import { USER_METADATA_KEYS } from "@/types/userMetadata";

export const runtime = "nodejs";

interface SupportRequestBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  userEmail?: string;
  description?: string;
  videoLink?: string;
  relatedPageLink?: string;
  otherDetails?: string;
  files?: string[];
  chatSessionId?: string;
  threadId?: string;
  conversationId?: string;
  conversationLink?: string;
  isConversationRequest?: boolean;
  metadata?: UserMetadata | null;
}

type NormalizedMetadata = Record<UserMetadataKey, string>;

const sanitizeInputValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const createEmptyMetadata = (): NormalizedMetadata => {
  const base = {} as NormalizedMetadata;
  for (const key of USER_METADATA_KEYS) {
    base[key] = "";
  }
  return base;
};

const normalizeMetadata = (input: UserMetadata | null | undefined): NormalizedMetadata => {
  const normalized = createEmptyMetadata();
  if (!input) {
    return normalized;
  }
  for (const key of USER_METADATA_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      normalized[key] = value.trim();
    }
  }
  return normalized;
};

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const AWS_REGION = process.env.SAWS_REGION || process.env.AWS_REGION;
let s3Client: S3Client | null = null;

const getS3Client = (): S3Client | null => {
  if (!UPLOADS_BUCKET) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials:
        process.env.SAWS_ACCESS_KEY_ID && process.env.SAWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.SAWS_ACCESS_KEY_ID as string,
              secretAccessKey: process.env.SAWS_SECRET_ACCESS_KEY as string,
            }
          : undefined,
    });
  }
  return s3Client;
};

const trimTrailingSlash = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const resolveBaseUrl = (request: NextRequest): string | undefined => {
  const envUrl = trimTrailingSlash(process.env.NEXT_PUBLIC_BASE_URL?.trim());
  if (envUrl) return envUrl;

  const originHeader = trimTrailingSlash(request.headers.get("origin"));
  if (originHeader) return originHeader;

  const hostHeader = request.headers.get("host");
  if (hostHeader) {
    const protocol = hostHeader.includes("localhost") ? "http" : "https";
    return `${protocol}://${hostHeader}`;
  }

  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  if (vercelUrl) return trimTrailingSlash(vercelUrl);

  return undefined;
};

const createProxyDownloadUrl = (
  key: string,
  sessionId: string | undefined,
  baseUrl: string | undefined
): string | null => {
  if (!sessionId || !baseUrl) {
    return null;
  }

  const sessionPrefix = `chat-uploads/${sessionId}/`;
  if (key.startsWith(sessionPrefix)) {
    const filePart = key.slice(sessionPrefix.length);
    if (filePart && !filePart.includes("..") && !filePart.includes("//")) {
      const params = new URLSearchParams({
        session: sessionId,
        file: filePart,
      });
      return `${baseUrl}/api/attachments/download?${params.toString()}`;
    }
  }

  const payload = Buffer.from(
    JSON.stringify({ key, appSessionId: sessionId }),
    "utf8"
  ).toString("base64url");
  return `${baseUrl}/api/attachments/download?token=${payload}`;
};

interface AttachmentLinkSet {
  key: string;
  proxyUrl?: string;
  s3Url?: string;
}

const generateAttachmentLinks = async (
  keys: unknown,
  options: { sessionId?: string; baseUrl?: string },
  maxAgeSeconds = 60 * 60 * 24 * 7
): Promise<AttachmentLinkSet[]> => {
  if (!Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  const normalizedKeys = keys.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (normalizedKeys.length === 0) {
    return [];
  }

  const client = getS3Client();
  const results = await Promise.all(
    normalizedKeys.map(async (rawValue) => {
      const value = rawValue.trim();
      const link: AttachmentLinkSet = { key: value };

      if (value.startsWith("http://") || value.startsWith("https://")) {
        link.s3Url = value;
        return link;
      }

      if (value.startsWith("chat-uploads/") && UPLOADS_BUCKET && AWS_REGION && client) {
        try {
          const command = new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: value });
          const signed = await getSignedUrl(client, command, { expiresIn: maxAgeSeconds });
          link.s3Url = signed;
        } catch (error) {
          console.error("[submit-support-request] Failed to sign attachment download URL", {
            key: value,
            error,
          });
        }
      }

      const proxyUrl = createProxyDownloadUrl(value, options.sessionId, options.baseUrl);
      if (proxyUrl) {
        link.proxyUrl = proxyUrl;
      }

      return link;
    })
  );

  return results;
};

export async function POST(request: NextRequest) {
  try {
    const body: SupportRequestBody = await request.json();
    const normalizedMetadata = normalizeMetadata(body.metadata);
    const baseUrl = resolveBaseUrl(request);
    const attachmentLinks = await generateAttachmentLinks(body.files, {
      sessionId: body.chatSessionId,
      baseUrl,
    });
    const proxyLinks = attachmentLinks
      .map((link) => link.proxyUrl || link.s3Url || link.key)
      .filter(Boolean);
    const directLinks = attachmentLinks
      .map((link) => link.s3Url || link.proxyUrl || link.key)
      .filter(Boolean);

    // Validate required fields based on form type
    if (body.isConversationRequest) {
      // Conversation form doesn't require name/email
    } else {
      // Full form requires name and email (allow metadata fallback)
      const hasFirstName = sanitizeInputValue(body.firstName) || normalizedMetadata.first_name;
      const hasLastName = sanitizeInputValue(body.lastName) || normalizedMetadata.last_name;
      const hasEmail =
        sanitizeInputValue(body.email) ||
        sanitizeInputValue(body.userEmail) ||
        normalizedMetadata.user_email;
      if (!hasFirstName || !hasLastName || !hasEmail) {
        return NextResponse.json(
          { error: "Missing required fields: firstName, lastName, email" },
          { status: 400 }
        );
      }
    }

    // Get Zapier webhook URL from environment variable
    // Support separate webhooks for conversation requests vs full form requests
    const zapierWebhookUrl = body.isConversationRequest
      ? (process.env.ZAPIER_CONVERSATION_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL)
      : (process.env.ZAPIER_FULL_FORM_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL);
    
    if (!zapierWebhookUrl) {
      const missingVar = body.isConversationRequest
        ? "ZAPIER_CONVERSATION_WEBHOOK_URL or ZAPIER_WEBHOOK_URL"
        : "ZAPIER_FULL_FORM_WEBHOOK_URL or ZAPIER_WEBHOOK_URL";
      console.error(`[submit-support-request] ${missingVar} not configured`);
      return NextResponse.json(
        { 
          error: "Webhook URL not configured",
          details: `Please set ${missingVar} environment variable in AWS Amplify`
        },
        { status: 500 }
      );
    }

    // Prepare data for Zapier webhook
    // Map to new table structure with headers:
    // modified-date, created-date, first-name, last-name, user-email, video-link, upload-files,
    // link-url, user-subscription-plan, user-admin-status, ticket-subject, ticket-description,
    // extra-details, transcript, transcript-summary, chatbot-session-id, use-conversation,
    // conversation-link, thread-id, date, Status, ticket-id
    
    const now = new Date().toISOString();
    const dateOnly = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const zapierData: Record<string, unknown> = {
      // Date fields
      "created-date": now,
      "modified-date": now,
      "date": dateOnly,
      
      // Conversation metadata
      "chatbot-session-id": body.chatSessionId || "",
      "thread-id": body.threadId || "",
      "conversation-link": body.conversationLink || "",
      "use-conversation": body.isConversationRequest || false,
      
      // Transcript fields (populated by Zapier automation triggered by new rows)
      "transcript": "",
      "transcript-summary": "",
      
      // User metadata (populated by Zapier automation if user data is available)
      "user-subscription-plan": "",
      "user-admin-status": "",
      "fyi-region": "",
      "practice-mgmt": "",
      "fyi-age": "",
      
      // Status (set by Zapier automation/workflow)
      "Status": "",
      
      // Ticket ID (generated by Zapier automation)
      "ticket-id": "",
      
      // Ticket subject (set by Zapier automation triggered by new rows)
      "ticket-subject": "",
    };

    const resolvedFirstName =
      sanitizeInputValue(body.firstName) || normalizedMetadata.first_name;
    const resolvedLastName =
      sanitizeInputValue(body.lastName) || normalizedMetadata.last_name;
    const resolvedEmail =
      sanitizeInputValue(body.email) ||
      sanitizeInputValue(body.userEmail) ||
      normalizedMetadata.user_email;
    const resolvedLinkUrl =
      sanitizeInputValue(body.relatedPageLink) || normalizedMetadata.link_url;

    zapierData["first-name"] = resolvedFirstName;
    zapierData["last-name"] = resolvedLastName;
    zapierData["user-email"] = resolvedEmail;
    zapierData["link-url"] = resolvedLinkUrl;
    zapierData["user-subscription-plan"] = normalizedMetadata.user_subscription_plan;
    zapierData["user-admin-status"] = normalizedMetadata.user_admin_status;
    zapierData["fyi-region"] = normalizedMetadata.fyi_region;
    zapierData["practice-mgmt"] = normalizedMetadata.practice_mgmt;
    zapierData["fyi-age"] = normalizedMetadata.fyi_age;

    if (body.isConversationRequest) {
      // Conversation form fields - minimal data since context comes from conversation
      zapierData["video-link"] = body.videoLink || "";
      zapierData["upload-files"] =
        proxyLinks.length > 0
          ? proxyLinks.join(", ")
          : Array.isArray(body.files)
            ? body.files.join(", ")
            : body.files || "";
      zapierData["upload-files-direct"] =
        directLinks.length > 0
          ? directLinks.join(", ")
          : Array.isArray(body.files)
            ? body.files.join(", ")
            : body.files || "";
      zapierData["ticket-description"] = "";
      zapierData["extra-details"] = body.otherDetails || "";
    } else {
      // Full form fields - complete user information
      zapierData["video-link"] = body.videoLink || "";
      zapierData["upload-files"] =
        proxyLinks.length > 0
          ? proxyLinks.join(", ")
          : Array.isArray(body.files)
            ? body.files.join(", ")
            : body.files || "";
      zapierData["upload-files-direct"] =
        directLinks.length > 0
          ? directLinks.join(", ")
          : Array.isArray(body.files)
            ? body.files.join(", ")
            : body.files || "";
      zapierData["ticket-description"] = body.description || "";
      zapierData["extra-details"] = "";
    }

    // Log the data being sent (for debugging)
    console.log("[submit-support-request] Sending data to Zapier:", JSON.stringify(zapierData, null, 2));
    
    // Send to Zapier webhook
    const response = await fetch(zapierWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(zapierData),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[submit-support-request] Zapier webhook error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to submit to Zapier: ${response.status}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[submit-support-request] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

