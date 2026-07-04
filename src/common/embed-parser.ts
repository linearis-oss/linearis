export function isLinearUploadUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.hostname === "uploads.linear.app";
  } catch {
    // URL constructor throws on malformed input — not a Linear upload URL
    return false;
  }
}

export function extractFilenameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    return parts[parts.length - 1] || "download";
  } catch {
    // URL constructor throws on malformed input — fall back to generic filename
    return "download";
  }
}
