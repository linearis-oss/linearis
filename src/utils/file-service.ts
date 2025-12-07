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

import { access, mkdir, readFile, stat, writeFile } from "fs/promises";
import { basename, dirname, extname } from "path";
import { extractFilenameFromUrl, isLinearUploadUrl } from "./embed-parser.js";
import { getMimeType } from "./mime-types.js";
import { FILE_UPLOAD_MUTATION, ATTACHMENT_CREATE_MUTATION } from "../queries/issues.js";
import type {
  FileUploadOptions,
  FileUploadResult,
  AttachmentCreateResult,
  UploadPayload,
  AttachmentPayload,
} from "./linear-types.js";

/**
 * Maximum file size for uploads (20MB)
 * This limit is imposed by Linear's fileUpload API.
 * See: https://linear.app/developers/graphql/fileupload
 */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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
          error:
            `File already exists: ${outputPath}. Use --overwrite to replace.`,
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
   * @param options - Upload options including file path
   * @param graphQLService - GraphQL service for executing mutation
   * @returns Upload result with success status, asset URL, or error details
   *
   * @example
   * ```typescript
   * const result = await fileService.uploadFile(
   *   { filePath: "./screenshot.png" },
   *   graphQLService
   * );
   *
   * if (result.success) {
   *   console.log(`Asset URL: ${result.assetUrl}`);
   *   // Use in markdown: ![screenshot](${result.assetUrl})
   * } else {
   *   console.error(`Error: ${result.error}`);
   * }
   * ```
   */
  async uploadFile(
    options: FileUploadOptions,
    graphQLService: any, // GraphQLService - avoid circular dependency
  ): Promise<FileUploadResult> {
    const { filePath, makePublic = false, metaData } = options;

    try {
      // Check file exists and get size
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        return {
          success: false,
          filename: basename(filePath),
          size: 0,
          error: `Path is not a file: ${filePath}`,
        };
      }

      const fileSize = stats.size;
      const filename = basename(filePath);
      const contentType = getMimeType(filename);

      if (fileSize > MAX_FILE_SIZE) {
        const maxMB = MAX_FILE_SIZE / (1024 * 1024);
        const actualMB = fileSize / (1024 * 1024);
        return {
          success: false,
          filename,
          size: fileSize,
          error: `File too large: ${actualMB.toFixed(1)}MB exceeds limit of ${maxMB}MB`,
        };
      }

      // Step 1: Get signed upload URL from Linear
      const response: any = await graphQLService.rawRequest(
        FILE_UPLOAD_MUTATION,
        {
          contentType,
          filename,
          size: fileSize,
          makePublic,
          metaData,
        },
      );

      // GraphQL response is nested under mutation name
      const uploadPayload: UploadPayload = response.fileUpload;

      if (!uploadPayload || !uploadPayload.uploadFile) {
        return {
          success: false,
          filename,
          size: fileSize,
          error: "Failed to get upload URL from Linear API",
        };
      }

      const { uploadUrl, assetUrl, headers } = uploadPayload.uploadFile;

      // Step 2: Read file and upload to signed URL
      const fileBuffer = await readFile(filePath);

      // Follow Linear's official example exactly
      // https://linear.app/developers/how-to-upload-a-file-to-linear
      const uploadHeaders = new Headers();
      uploadHeaders.set("Content-Type", contentType);
      uploadHeaders.set("Cache-Control", "public, max-age=31536000");

      // Add all headers from Linear's response
      for (const header of headers) {
        uploadHeaders.set(header.key, header.value);
      }

      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: uploadHeaders,
          body: fileBuffer,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          return {
            success: false,
            filename,
            size: fileSize,
            error: `Upload failed: HTTP ${uploadResponse.status} - ${errorText.substring(0, 200)}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          filename,
          size: fileSize,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        success: true,
        assetUrl,
        filename,
        size: fileSize,
      };
    } catch (error) {
      return {
        success: false,
        filename: basename(filePath),
        size: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Creates an attachment on a Linear issue using an uploaded file's assetUrl.
   *
   * This is step 3 of the upload process - it creates the attachment metadata
   * that links the uploaded file to an issue.
   *
   * @param issueId - Issue ID to attach the file to
   * @param assetUrl - Asset URL returned from uploadFile()
   * @param filename - Original filename for the attachment title
   * @param graphQLService - GraphQL service for executing mutation
   * @param fileSize - Optional file size for subtitle display
   * @returns Attachment creation result
   *
   * @example
   * ```typescript
   * const result = await fileService.createAttachment(
   *   "issue-uuid",
   *   "https://uploads.linear.app/...",
   *   "document.pdf",
   *   graphQLService,
   *   1024000
   * );
   * ```
   */
  async createAttachment(
    issueId: string,
    assetUrl: string,
    filename: string,
    graphQLService: any,
    fileSize?: number,
  ): Promise<AttachmentCreateResult> {
    try {
      // Format subtitle with file size if available
      let subtitle: string | undefined;
      if (fileSize) {
        const sizeKB = fileSize / 1024;
        const sizeMB = sizeKB / 1024;
        if (sizeMB >= 1) {
          subtitle = `${sizeMB.toFixed(2)} MB`;
        } else {
          subtitle = `${sizeKB.toFixed(2)} KB`;
        }
      }

      const response: any = await graphQLService.rawRequest(
        ATTACHMENT_CREATE_MUTATION,
        {
          issueId,
          title: filename,
          url: assetUrl,
          subtitle,
          metadata: { uploadedBy: "linearis-cli" },
        },
      );

      // GraphQL response is nested under mutation name
      const attachmentPayload: AttachmentPayload = response.attachmentCreate;

      if (!attachmentPayload || !attachmentPayload.attachment) {
        return {
          success: false,
          error: "Failed to create attachment on issue",
        };
      }

      return {
        success: true,
        attachmentId: attachmentPayload.attachment.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Upload files and attach them to a Linear issue.
   *
   * Convenience method that combines file upload and attachment creation.
   * Continues uploading even if some files fail.
   *
   * @param issueId - Issue ID to attach files to
   * @param filePaths - Array of file paths to upload
   * @param graphQLService - GraphQL service for executing mutations
   * @returns Array of upload results (one per file)
   *
   * @example
   * ```typescript
   * const results = await fileService.uploadAndAttachFiles(
   *   "issue-uuid",
   *   ["./doc1.pdf", "./doc2.png"],
   *   graphQLService
   * );
   *
   * // Check for failures
   * const failures = results.filter(r => !r.success);
   * if (failures.length > 0) {
   *   console.error(`${failures.length} files failed to upload`);
   * }
   * ```
   */
  async uploadAndAttachFiles(
    issueId: string,
    filePaths: string[],
    graphQLService: any,
  ): Promise<(FileUploadResult & { attachmentCreated?: boolean })[]> {
    const results: (FileUploadResult & { attachmentCreated?: boolean })[] = [];

    for (const filePath of filePaths) {
      // Step 1 & 2: Upload file
      const uploadResult = await this.uploadFile({ filePath }, graphQLService);

      if (!uploadResult.success || !uploadResult.assetUrl) {
        // Upload failed, add result and continue
        results.push(uploadResult);
        continue;
      }

      // Step 3: Create attachment
      const attachmentResult = await this.createAttachment(
        issueId,
        uploadResult.assetUrl,
        uploadResult.filename,
        graphQLService,
        uploadResult.size,
      );

      // Combine results
      results.push({
        ...uploadResult,
        attachmentCreated: attachmentResult.success,
        error: attachmentResult.success
          ? uploadResult.error
          : `File uploaded but attachment creation failed: ${attachmentResult.error}`,
      });
    }

    return results;
  }
}
