import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.SAWS_REGION || process.env.AWS_REGION,
  credentials: process.env.SAWS_ACCESS_KEY_ID && process.env.SAWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.SAWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.SAWS_SECRET_ACCESS_KEY as string,
      }
    : undefined,
});
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

    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    return NextResponse.json({ key, url });
  } catch (e) {
    return NextResponse.json({ error: "presign failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}


