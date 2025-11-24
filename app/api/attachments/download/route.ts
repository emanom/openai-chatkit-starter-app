import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

interface DownloadTokenPayload {
  key: string;
  appSessionId: string;
}

const decodeToken = (token: string): DownloadTokenPayload | null => {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as DownloadTokenPayload;
    if (typeof payload.key === "string" && typeof payload.appSessionId === "string") {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
};

export async function GET(req: Request) {
  try {
    if (!BUCKET) return NextResponse.json({ error: "Missing UPLOADS_BUCKET" }, { status: 500 });
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const wantsJson = url.searchParams.get("format") === "json";

    let key: string | null = null;
    let appSessionId: string | null = null;

    if (token) {
      const payload = decodeToken(token);
      if (payload) {
        key = payload.key;
        appSessionId = payload.appSessionId;
      }
    } else {
      key = url.searchParams.get("key");
      appSessionId = url.searchParams.get("appSessionId");
    }

    if (!key || !appSessionId) {
      return NextResponse.json({ error: "Missing key/appSessionId" }, { status: 400 });
    }

    const prefix = `chat-uploads/${appSessionId}/`;
    if (!key.startsWith(prefix)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 60 });

    if (wantsJson) {
      return NextResponse.json({ url: signed });
    }

    return NextResponse.redirect(signed, 302);
  } catch {
    return NextResponse.json({ error: "download failed" }, { status: 500 });
  }
}


