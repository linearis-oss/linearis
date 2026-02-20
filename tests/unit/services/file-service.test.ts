// tests/unit/services/file-service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileService } from "../../../src/services/file-service.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock embed-parser
vi.mock("../../../src/common/embed-parser.js", () => ({
  isLinearUploadUrl: vi.fn(),
  extractFilenameFromUrl: vi.fn(),
}));

import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import {
  extractFilenameFromUrl,
  isLinearUploadUrl,
} from "../../../src/common/embed-parser.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TEST_TOKEN = "lin_api_test_token";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadFile", () => {
  it("rejects non-linear URLs", async () => {
    vi.mocked(isLinearUploadUrl).mockReturnValue(false);

    const service = new FileService(TEST_TOKEN);
    const result = await service.downloadFile("https://example.com/file.png");

    expect(result).toEqual({
      success: false,
      error: "URL must be from uploads.linear.app domain",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("downloads file successfully", async () => {
    vi.mocked(isLinearUploadUrl).mockReturnValue(true);
    vi.mocked(extractFilenameFromUrl).mockReturnValue("image.png");
    vi.mocked(access).mockRejectedValue(new Error("ENOENT")); // file doesn't exist
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const fileContent = new ArrayBuffer(8);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(fileContent),
    });

    const service = new FileService(TEST_TOKEN);
    const result = await service.downloadFile(
      "https://uploads.linear.app/org/file.png",
    );

    expect(result).toEqual({
      success: true,
      filePath: "image.png",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://uploads.linear.app/org/file.png",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      },
    );
    expect(writeFile).toHaveBeenCalled();
  });

  it("rejects when file already exists", async () => {
    vi.mocked(isLinearUploadUrl).mockReturnValue(true);
    vi.mocked(extractFilenameFromUrl).mockReturnValue("image.png");
    vi.mocked(access).mockResolvedValue(undefined); // file exists

    const service = new FileService(TEST_TOKEN);
    const result = await service.downloadFile(
      "https://uploads.linear.app/org/file.png",
    );

    expect(result).toEqual({
      success: false,
      error: "File already exists: image.png. Use --overwrite to replace.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles HTTP error", async () => {
    vi.mocked(isLinearUploadUrl).mockReturnValue(true);
    vi.mocked(extractFilenameFromUrl).mockReturnValue("image.png");
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const service = new FileService(TEST_TOKEN);
    const result = await service.downloadFile(
      "https://uploads.linear.app/org/file.png",
    );

    expect(result).toEqual({
      success: false,
      error: "HTTP 403: Forbidden",
      statusCode: 403,
    });
  });
});

describe("uploadFile", () => {
  it("returns error when file not found", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    const service = new FileService(TEST_TOKEN);
    const result = await service.uploadFile("/path/to/missing.png");

    expect(result).toEqual({
      success: false,
      error: "File not found: /path/to/missing.png",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error when file too large", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({
      size: 25 * 1024 * 1024, // 25MB
    } as Awaited<ReturnType<typeof stat>>);

    const service = new FileService(TEST_TOKEN);
    const result = await service.uploadFile("/path/to/large.png");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/File too large/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uploads file successfully", async () => {
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({
      size: 1024,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(readFile).mockResolvedValue(Buffer.from("file-content"));

    // First fetch: GraphQL fileUpload mutation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            fileUpload: {
              success: true,
              uploadFile: {
                uploadUrl: "https://storage.example.com/upload",
                assetUrl: "https://uploads.linear.app/org/asset.png",
                headers: [{ key: "x-amz-header", value: "some-value" }],
              },
            },
          },
        }),
    });

    // Second fetch: PUT to pre-signed URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const service = new FileService(TEST_TOKEN);
    const result = await service.uploadFile("/path/to/image.png");

    expect(result).toEqual({
      success: true,
      assetUrl: "https://uploads.linear.app/org/asset.png",
      filename: "image.png",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify GraphQL call
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.linear.app/graphql",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_TOKEN,
        },
      }),
    );

    // Verify PUT call
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://storage.example.com/upload",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          "x-amz-header": "some-value",
        },
      }),
    );
  });
});
