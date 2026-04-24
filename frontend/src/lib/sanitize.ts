import DOMPurify from "dompurify";

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Use this before any dangerouslySetInnerHTML rendering.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
    ADD_TAGS: ["style"],
    ADD_ATTR: ["class", "style", "target", "rel"],
  });
}

/**
 * Sanitize plain text input (strips all HTML).
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}

/** Max file sizes for uploads */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
export const MAX_FILE_SIZE_LABEL = "25MB";

/** Allowed MIME types for document uploads */
export const ALLOWED_DOC_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Validate a file for document upload */
export function validateDocumentFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size exceeds ${MAX_FILE_SIZE_LABEL}. Please choose a smaller file.`;
  }
  if (!ALLOWED_DOC_MIME_TYPES.includes(file.type)) {
    return "Only PDF and DOCX files are allowed.";
  }
  return null;
}
