import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";

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

export async function GET(req: Request) {
  try {
    if (!BUCKET) return NextResponse.json({ error: "Missing UPLOADS_BUCKET" }, { status: 500 });
    const url = new URL(req.url);
    const appSessionId = url.searchParams.get("appSessionId");
    if (!appSessionId) return NextResponse.json({ error: "Missing appSessionId" }, { status: 400 });

    const prefix = `chat-uploads/${appSessionId}/`;
    const results: Array<{ key: string; name: string; size?: number; mime?: string }> = [];
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const obj of page.Contents ?? []) {
        const Key = obj.Key!;
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
        const name = head.Metadata?.["original-filename"] ?? Key.split("/").pop()!;
        results.push({ key: Key, name, size: obj.Size, mime: head.ContentType ?? head.Metadata?.mime });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "list failed" }, { status: 500 });
  }
}


