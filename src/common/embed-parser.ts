/**
 * Utility functions for extracting embedded file URLs from markdown content.
 * Focuses on Linear's private cloud storage URLs (uploads.linear.app).
 *
 * This parser handles both image and link markdown syntax, filtering for
 * Linear-specific URLs and calculating expiration times for signed URLs.
 */

export interface EmbedInfo {
  /** The alt text or link label from markdown */
  label: string;
  /** The direct URL to the Linear uploaded file */
  url: string;
  /** ISO timestamp when the signed URL expires (1 hour from generation) */
  expiresAt: string;
}

/**
 * Strips code contexts from markdown to prevent extracting embeds from code examples.
 *
 * Removes:
 * - Escaped backticks (\`)
 * - Fenced code blocks (```...```)
 * - Inline code (`...`)
 *
 * @param content - Markdown content to clean
 * @returns Content with all code contexts removed
 */
function stripCodeContexts(content: string): string {
  // Remove escaped backticks
  let cleaned = content.replace(/\\`/g, "");

  // Remove fenced code blocks (```...```) - greedy match with dotall behavior
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // Remove inline code (`...`)
  cleaned = cleaned.replace(/`[^`]+`/g, "");

  return cleaned;
}

/**
 * Extracts Linear upload URLs from markdown content.
 *
 * Parses both image syntax `![label](url)` and link syntax `[label](url)`.
 * Only returns URLs from uploads.linear.app domain with calculated expiration times.
 *
 * Automatically strips code blocks and inline code to avoid extracting URLs from
 * code examples or documentation.
 *
 * @param content - Markdown content to parse for embedded files
 * @returns Array of embed information for Linear upload URLs
 *
 * @example
 * ```typescript
 * const content = "Check this screenshot ![test](https://uploads.linear.app/abc/file.png)";
 * const embeds = extractEmbeds(content);
 * // Returns: [{ label: "test", url: "...", expiresAt: "2025-11-07T12:00:00.000Z" }]
 * ```
 */
export function extractEmbeds(content: string): EmbedInfo[] {
  if (!content) {
    return [];
  }

  // Strip code contexts to avoid extracting URLs from code examples
  const cleanedContent = stripCodeContexts(content);

  const embeds: EmbedInfo[] = [];

  // Regex for markdown image syntax: ![label](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  // Regex for markdown link syntax: [label](url)
  const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;

  // Calculate expiration time (1 hour from now)
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  // Extract from image syntax
  let match;
  while ((match = imageRegex.exec(cleanedContent)) !== null) {
    const label = match[1] || "file";
    const url = match[2];

    if (isLinearUploadUrl(url)) {
      embeds.push({ label, url, expiresAt });
    }
  }

  // Extract from link syntax
  while ((match = linkRegex.exec(cleanedContent)) !== null) {
    const label = match[1] || "file";
    const url = match[2];

    if (isLinearUploadUrl(url)) {
      embeds.push({ label, url, expiresAt });
    }
  }

  return embeds;
}

/**
 * Checks if a URL points to Linear's private cloud storage.
 */
export function isLinearUploadUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.hostname === "uploads.linear.app";
  } catch {
    return false;
  }
}

/**
 * Extracts the filename from a Linear upload URL.
 * Used for default output filenames when downloading.
 */
export function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "download";
  } catch {
    return "download";
  }
}
