/**
 * Compress a signature image before uploading to storage.
 * Resizes to max 800px wide and uses JPEG at 0.7 quality.
 */
export async function compressSignatureImage(dataUrl: string, maxWidth = 800, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context failed"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("Compression failed")),
        "image/png",
        quality
      );
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
