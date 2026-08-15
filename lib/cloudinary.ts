// ============================================================
// Cloudinary uploads — the file-storage layer for documents.
//
// Replaces Firebase Storage, which requires the paid Blaze plan.
// Uploads go straight from the browser to Cloudinary's unsigned
// upload endpoint, so no API secret is ever shipped to the client
// and no server route is needed in between.
//
// Config comes from NEXT_PUBLIC_* env vars (see .env.example).
// Following the same posture as lib/firebase.ts: missing config is
// *not* a module-load crash — the app still renders in "demo/local"
// mode and only an actual upload attempt fails, with a clear message.
// ============================================================

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/** True when both Cloudinary env vars are present — mirrors isFirebaseConfigured. */
export const isCloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export interface CloudinaryUploadResult {
  /** Public HTTPS URL of the stored file — what gets saved as DocumentMeta.fileURL. */
  url: string;
  /** Cloudinary public_id, kept so the file can be deleted/transformed later. */
  publicId: string;
}

/**
 * Uploads one file to Cloudinary under `folder` and returns its URL.
 *
 * resource_type "auto" lets a single endpoint handle PDFs, images and
 * Office files (docx/xlsx) — Cloudinary classifies each one itself
 * rather than us having to route image/ vs raw/ uploads separately.
 */
export async function uploadToCloudinary(file: File, folder: string): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary isn't configured — set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and " +
        "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.local. The upload preset must be " +
        'created in the Cloudinary dashboard with Signing Mode "Unsigned" (see .env.example).'
    );
  }

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", folder);

  // Don't set Content-Type — the browser adds the multipart boundary.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    // Cloudinary returns { error: { message } } on failure; fall back to
    // the status text so the caller never surfaces an empty error.
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // Non-JSON error body — keep the status-based detail.
    }
    throw new Error(`Couldn't upload "${file.name}" to Cloudinary: ${detail}`);
  }

  const data = await res.json();
  if (!data?.secure_url) {
    throw new Error(`Cloudinary didn't return a URL for "${file.name}".`);
  }

  return { url: data.secure_url as string, publicId: data.public_id as string };
}

export default uploadToCloudinary;
