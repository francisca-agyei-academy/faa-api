import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env, r2Configured } from "../config/env.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

const log = logger.child({ module: "storage" });

// R2 speaks the S3 API; the endpoint is per Cloudflare account.
const client = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    })
  : null;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Resizes an uploaded photo to at most 1600px wide, converts it to WebP and stores it in R2.
 * Returns the public URL. Re-encoding also strips EXIF data such as GPS location.
 */
export async function uploadCourseImage(file: { buffer: Buffer; mimetype: string }, courseId: string) {
  if (!client) {
    throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Image uploads aren't set up yet. Add the R2_* settings to the API.");
  }
  if (!ACCEPTED.has(file.mimetype)) {
    throw new AppError(400, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG, WebP or AVIF image.");
  }

  let body: Buffer;
  try {
    body = await sharp(file.buffer)
      .rotate() // honour the camera's orientation before EXIF is dropped
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(400, "UNREADABLE_IMAGE", "That file couldn't be read as an image.");
  }

  const key = `courses/${courseId}/${Date.now()}-${randomBytes(4).toString("hex")}.webp`;
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: "image/webp",
      // Each upload gets a new key, so it can be cached forever.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  log.info({ courseId, key, bytes: body.length }, "course image uploaded");
  return `${env.R2_PUBLIC_URL}/${key}`;
}

/** Best-effort removal of a replaced image; a failure is logged, never thrown. */
export async function deleteStoredImage(url: string | null | undefined) {
  if (!client || !url || !env.R2_PUBLIC_URL || !url.startsWith(`${env.R2_PUBLIC_URL}/`)) return;
  const key = url.slice(env.R2_PUBLIC_URL.length + 1);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch (err) {
    log.warn({ err, key }, "could not delete old course image");
  }
}
