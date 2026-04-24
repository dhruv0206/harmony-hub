import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Downloads a file from Supabase Storage as an ArrayBuffer.
 * Always uses signed URLs for private buckets.
 */
export async function downloadStorageFile(
  fileUrl: string,
  bucket = "document-templates"
): Promise<ArrayBuffer> {
  // Extract the storage path from a full Supabase URL
  let filePath = fileUrl;
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  
  if (filePath.includes(publicMarker)) {
    filePath = decodeURIComponent(filePath.split(publicMarker)[1]);
  } else if (filePath.includes(signedMarker)) {
    // Already a signed URL — fetch directly
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
    return response.arrayBuffer();
  }

  // Use Supabase SDK download (handles auth automatically)
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (!error && data) {
    return data.arrayBuffer();
  }

  // Fallback: try creating a signed URL
  const { data: signedData } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);
  
  if (signedData?.signedUrl) {
    const response = await fetch(signedData.signedUrl);
    if (response.ok) return response.arrayBuffer();
  }

  throw new Error(`Failed to download file from ${bucket}/${filePath}`);
}

/**
 * Get a signed URL for viewing a file (1 hour expiry).
 */
export async function getSignedUrl(
  filePath: string,
  bucket = "document-templates"
): Promise<string | null> {
  if (filePath.startsWith("http")) {
    // Already a full URL — check if it needs re-signing
    const marker = `/storage/v1/object/public/${bucket}/`;
    if (filePath.includes(marker)) {
      filePath = decodeURIComponent(filePath.split(marker)[1]);
    } else {
      return filePath; // external URL
    }
  }
  
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);
  
  return data?.signedUrl || null;
}
