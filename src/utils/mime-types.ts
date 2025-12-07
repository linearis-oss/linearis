/**
 * Simple MIME type detection based on file extensions.
 * Covers common file types without external dependencies.
 */

const MIME_TYPES: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",

  // Text
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "application/toml",
  ".ini": "text/plain",
  ".log": "text/plain",

  // Archives
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".gzip": "application/gzip",
  ".bz2": "application/x-bzip2",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",

  // Media
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".oga": "audio/ogg",
  ".wma": "audio/x-ms-wma",
  ".m4a": "audio/mp4",

  // Code
  ".py": "text/x-python",
  ".java": "text/x-java-source",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".h": "text/x-c",
  ".hpp": "text/x-c++",
  ".cs": "text/x-csharp",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".rb": "text/x-ruby",
  ".php": "text/x-php",
  ".swift": "text/x-swift",
  ".kt": "text/x-kotlin",
  ".scala": "text/x-scala",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
  ".zsh": "text/x-shellscript",
  ".fish": "text/x-shellscript",
  ".ps1": "text/x-powershell",
  ".bat": "text/x-msdos-batch",
  ".cmd": "text/x-msdos-batch",

  // Other
  ".sql": "application/sql",
  ".db": "application/x-sqlite3",
  ".sqlite": "application/x-sqlite3",
  ".wasm": "application/wasm",
};

/**
 * Get MIME type from file extension
 *
 * @param filename - File name or path
 * @returns MIME type string, defaults to 'application/octet-stream' for unknown extensions
 *
 * @example
 * ```typescript
 * getMimeType('document.pdf')    // 'application/pdf'
 * getMimeType('photo.PNG')       // 'image/png' (case insensitive)
 * getMimeType('data.unknown')    // 'application/octet-stream'
 * ```
 */
export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext && MIME_TYPES[ext]) {
    return MIME_TYPES[ext];
  }
  return "application/octet-stream"; // Generic binary fallback
}
