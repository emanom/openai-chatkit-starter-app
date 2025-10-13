import { NextResponse } from "next/server";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const BUCKET = process.env.UPLOADS_BUCKET;

function buildS3(): S3Client {
  return new S3Client({
    region: process.env.SAWS_REGION || process.env.AWS_REGION,
    credentials:
      process.env.SAWS_ACCESS_KEY_ID && process.env.SAWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.SAWS_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.SAWS_SECRET_ACCESS_KEY as string,
          }
        : undefined,
  });
}

export async function POST(): Promise<Response> {
  if (!BUCKET) {
    return NextResponse.json({ error: "Missing UPLOADS_BUCKET" }, { status: 500 });
  }

  try {
    const s3 = buildS3();
    // Apply EXACT configuration requested by user
    const AllowedOrigins = [
      "http://localhost:3000",
      "https://main.d1m1p4jeb6ymp7.amplifyapp.com",
    ];

    const cmd = new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ["PUT", "GET", "HEAD", "OPTIONS"],
            AllowedHeaders: ["*"],
            AllowedOrigins,
            ExposeHeaders: ["ETag", "x-amz-request-id"],
            MaxAgeSeconds: 300,
          },
        ],
      },
    });

    await s3.send(cmd);
    return NextResponse.json({ ok: true, bucket: BUCKET, AllowedOrigins });
  } catch (e) {
    return NextResponse.json({ error: "Failed to set bucket CORS", details: String(e) }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}


