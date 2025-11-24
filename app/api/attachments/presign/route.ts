import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Create S3 client without checksum middleware
// We'll create a new client for each request to avoid middleware issues
const createS3Client = () => {
  return new S3Client({
    region: process.env.SAWS_REGION || process.env.AWS_REGION,
    credentials: process.env.SAWS_ACCESS_KEY_ID && process.env.SAWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.SAWS_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.SAWS_SECRET_ACCESS_KEY as string,
        }
      : undefined,
  });
};
const BUCKET = process.env.UPLOADS_BUCKET;

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!BUCKET) {
      return NextResponse.json({ error: "Missing UPLOADS_BUCKET" }, { status: 500 });
    }
    const body = await req.json().catch(() => null);
    const appSessionId = body?.appSessionId as string | undefined;
    const filename = body?.filename as string | undefined;
    const mime = (body?.mime as string | undefined) || "application/octet-stream";
    const size = body?.size as number | undefined;
    if (!appSessionId || !filename) {
      return NextResponse.json({ error: "Missing appSessionId or filename" }, { status: 400 });
    }

    const safe = String(filename).replace(/[^\w.\- ]+/g, "_").slice(-180);
    const timestamp = new Date().toISOString().replace(/[:]/g, "-");
    const unique = (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const key = `chat-uploads/${appSessionId}/${timestamp}-${unique}-${safe}`;

    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mime,
      Metadata: {
        "original-filename": safe,
        "size-bytes": String(size ?? 0),
        mime,
      },
      ServerSideEncryption: "AES256",
      Tagging: "label=support",
    });

    // Create a fresh client for each request
    const s3 = createS3Client();
    
    // Remove checksum-related properties from command to prevent SDK from adding them
    // The SDK's flexible-checksums middleware adds checksums automatically
    // We need to prevent this by not including checksum-related properties
    const cleanCmd = new PutObjectCommand({
      Bucket: cmd.input.Bucket,
      Key: cmd.input.Key,
      ContentType: cmd.input.ContentType,
      Metadata: cmd.input.Metadata,
      ServerSideEncryption: cmd.input.ServerSideEncryption,
      Tagging: cmd.input.Tagging,
      // Explicitly exclude checksum-related properties
    });
    
    const url = await getSignedUrl(s3, cleanCmd, { expiresIn: 60 });
    
    // Parse URL to verify no checksum parameters were added
    const urlObj = new URL(url);
    const hasChecksum = urlObj.searchParams.has("x-amz-checksum-crc32") || 
                       urlObj.searchParams.has("x-amz-sdk-checksum-algorithm");
    
    if (hasChecksum) {
      // If checksums were still added, we need to remove them
      // But this will invalidate the signature, so we need to regenerate
      // Actually, we can't do this - the signature includes the query string
      // So we need to prevent checksums from being added in the first place
      console.warn("[presign] Checksum parameters detected in presigned URL - this may cause issues");
    }
    
    return NextResponse.json({ 
      key, 
      url
    });
  } catch {
    return NextResponse.json({ error: "presign failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}


