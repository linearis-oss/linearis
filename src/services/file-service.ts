/**
 * Service for file operations with Linear's private cloud storage.
 * Handles authentication, signed URLs, and file I/O operations.
 *
 * Features:
 * - File upload via GraphQL fileUpload mutation
 * - File download with automatic authentication
 * - Signed URL detection (skips Bearer token for signed URLs)
 * - Directory creation and file existence checks
 * - Comprehensive error handling and status reporting
 */

import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { print } from "graphql";
import {
  extractFilenameFromUrl,
  isLinearUploadUrl,
} from "../common/embed-parser.js";
import { FileUploadDocument } from "../gql/graphql.js";

/**
 * Maximum file size for uploads (20MB)
 * This limit is imposed by Linear's fileUpload API.
 * See: https://linear.app/developers/graphql/fileupload
 */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Common MIME types by file extension
 * Used for Content-Type header when uploading files
 */
const MIME_TYPES: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".md": "text/markdown",
  // Archives
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  // Video/Audio
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/**
 * Get MIME type for a file based on extension
 * @param filePath - Path to file
 * @returns MIME type string, defaults to application/octet-stream
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export interface DownloadOptions {
  /** Custom output file path (defaults to filename from URL) */
  output?: string;
  /** Whether to overwrite existing files (default: false) */
  overwrite?: boolean;
}

export interface DownloadResult {
  /** Whether the download was successful */
  success: boolean;
  /** Full path to the downloaded file (only if successful) */
  filePath?: string;
  /** Error message if download failed */
  error?: string;
  /** HTTP status code if HTTP request failed */
  statusCode?: number;
}

export interface UploadResult {
  /** Whether the upload was successful */
  success: boolean;
  /** Asset URL for the uploaded file (usable in markdown) */
  assetUrl?: string;
  /** Original filename */
  filename?: string;
  /** Error message if upload failed */
  error?: string;
  /** HTTP status code if HTTP request failed */
  statusCode?: number;
}

/**
 * File service for Linear cloud storage operations
 *
 * Handles authentication and file operations for Linear's private storage.
 * Supports both uploads (via GraphQL fileUpload mutation) and downloads.
 * Automatically detects signed URLs and adjusts authentication accordingly.
 */
export class FileService {
  private apiToken: string;

  /**
   * Initialize file service with authentication token
   *
   * @param apiToken - Linear API token for authentication
   */
  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Downloads a file from Linear's private cloud storage.
   *
   * Automatically handles authentication for Linear URLs and creates directories
   * as needed. Detects signed URLs to skip Bearer token authentication.
   *
   * @param url - URL to Linear file (uploads.linear.app domain)
   * @param options - Download options including output path and overwrite behavior
   * @returns Download result with success status, file path, or error details
   *
   * @example
   * ```typescript
   * const result = await fileService.downloadFile(
   *   "https://uploads.linear.app/abc/file.png",
   *   { output: "screenshots/image.png", overwrite: true }
   * );
   *
   * if (result.success) {
   *   console.log(`Downloaded to: ${result.filePath}`);
   * } else {
   *   console.error(`Error: ${result.error}`);
   * }
   * ```
   */
  async downloadFile(
    url: string,
    options: DownloadOptions = {},
  ): Promise<DownloadResult> {
    // Validate URL is from Linear storage
    if (!isLinearUploadUrl(url)) {
      return {
        success: false,
        error: "URL must be from uploads.linear.app domain",
      };
    }

    // Determine output path
    const outputPath = options.output || extractFilenameFromUrl(url);

    // Check if file already exists (unless overwrite is enabled)
    if (!options.overwrite) {
      try {
        await access(outputPath);
        return {
          success: false,
          error: `File already exists: ${outputPath}. Use --overwrite to replace.`,
        };
      } catch {
        // File doesn't exist, we can proceed
      }
    }

    try {
      // Check if URL already has a signature (signed URL)
      const urlObj = new URL(url);
      const isSignedUrl = urlObj.searchParams.has("signature");

      // Make HTTP request (with Bearer token only if not a signed URL)
      const headers: Record<string, string> = {};
      if (!isSignedUrl) {
        headers.Authorization = `Bearer ${this.apiToken}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      // Handle non-200 responses
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        };
      }

      // Get file content
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create output directory if needed
      const outputDir = dirname(outputPath);
      if (outputDir !== ".") {
        await mkdir(outputDir, { recursive: true });
      }

      // Write file to disk
      await writeFile(outputPath, buffer);

      return {
        success: true,
        filePath: outputPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Uploads a file to Linear's cloud storage.
   *
   * Uses Linear's fileUpload GraphQL mutation to get a pre-signed URL,
   * then PUTs the file content to that URL. Returns the asset URL for
   * use in markdown (comments, descriptions, etc.).
   *
   * @param filePath - Path to the local file to upload
   * @returns Upload result with success status, asset URL, or error details
   *
   * @example
   * ```typescript
   * const result = await fileService.uploadFile("./screenshot.png");
   *
   * if (result.success) {
   *   console.log(`Asset URL: ${result.assetUrl}`);
   *   // Use in markdown: ![screenshot](${result.assetUrl})
   * } else {
   *   console.error(`Error: ${result.error}`);
   * }
   * ```
   */
  async uploadFile(filePath: string): Promise<UploadResult> {
    const filename = basename(filePath);

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    // Get file size and validate
    let fileSize: number;
    try {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    } catch (error) {
      return {
        success: false,
        error: `Cannot read file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (fileSize > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / (1024 * 1024);
      const actualMB = fileSize / (1024 * 1024);
      return {
        success: false,
        error: `File too large: ${actualMB.toFixed(
          1,
        )}MB exceeds limit of ${maxMB}MB`,
      };
    }

    const contentType = getMimeType(filePath);

    try {
      // Make GraphQL request
      const graphqlResponse = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiToken,
        },
        body: JSON.stringify({
          query: print(FileUploadDocument),
          variables: {
            contentType,
            filename,
            size: fileSize,
          },
        }),
      });

      if (!graphqlResponse.ok) {
        return {
          success: false,
          error: `GraphQL request failed: HTTP ${graphqlResponse.status}`,
          statusCode: graphqlResponse.status,
        };
      }

      const data = await graphqlResponse.json();

      // Check for GraphQL errors
      if (data.errors) {
        const errorMsg = data.errors[0]?.message || "GraphQL error";
        return {
          success: false,
          error: `Failed to request upload URL: ${errorMsg}`,
        };
      }

      const fileUpload = data.data?.fileUpload;
      if (!fileUpload?.success) {
        return {
          success: false,
          error: "Failed to request upload URL: success=false",
        };
      }

      const uploadFile = fileUpload.uploadFile;
      const uploadUrl = uploadFile?.uploadUrl;
      const assetUrl = uploadFile?.assetUrl;
      const headersList = uploadFile?.headers || [];

      if (!uploadUrl || !assetUrl) {
        return {
          success: false,
          error: "Missing uploadUrl or assetUrl in response",
        };
      }

      // Step 2: PUT file content to pre-signed URL
      const fileBuffer = await readFile(filePath);
      // Convert Buffer to Uint8Array for fetch body compatibility
      const fileContent = new Uint8Array(fileBuffer);

      const putHeaders: Record<string, string> = {
        "Content-Type": contentType,
      };
      for (const header of headersList) {
        putHeaders[header.key] = header.value;
      }

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: putHeaders,
        body: fileContent,
      });

      if (!putResponse.ok) {
        return {
          success: false,
          error: `File upload failed: HTTP ${putResponse.status}`,
          statusCode: putResponse.status,
        };
      }

      return {
        success: true,
        assetUrl,
        filename,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
