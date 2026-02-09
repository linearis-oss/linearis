export interface EmbedInfo {
  label: string;
  url: string;
  /** ISO timestamp when the signed URL expires (1 hour from generation) */
  expiresAt: string;
}

/** Removes code blocks and inline code to avoid extracting URLs from code examples. */
function stripCodeContexts(content: string): string {
  // Remove escaped backticks
  let cleaned = content.replace(/\\`/g, "");

  // Remove fenced code blocks (```...```) - greedy match with dotall behavior
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // Remove inline code (`...`)
  cleaned = cleaned.replace(/`[^`]+`/g, "");

  return cleaned;
}

/** Extracts Linear upload URLs from markdown image and link syntax. */
export function extractEmbeds(content: string): EmbedInfo[] {
  if (!content) {
    return [];
  }

  // Strip code contexts to avoid extracting URLs from code examples
  const cleanedContent = stripCodeContexts(content);

  const embeds: EmbedInfo[] = [];
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  // Match both image ![label](url) and link [label](url) syntax
  const patterns = [
    /!\[([^\]]*)\]\(([^)]+)\)/g, // images
    /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, // links
  ];

  for (const regex of patterns) {
    for (const match of cleanedContent.matchAll(regex)) {
      const label = match[1] || "file";
      const url = match[2];

      if (isLinearUploadUrl(url)) {
        embeds.push({ label, url, expiresAt });
      }
    }
  }

  return embeds;
}

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

export function extractFilenameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    return parts[parts.length - 1] || "download";
  } catch {
    return "download";
  }
}
