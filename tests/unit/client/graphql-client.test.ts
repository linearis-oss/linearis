import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLClient } from "../../../src/client/graphql-client.js";
import { AuthenticationError } from "../../../src/common/errors.js";

// We test the error handling logic by mocking the underlying rawRequest
// The constructor creates a real LinearClient, so we mock at module level
vi.mock("@linear/sdk", () => {
  const mockRawRequest = vi.fn();
  return {
    LinearClient: vi.fn().mockImplementation(() => ({
      client: { rawRequest: mockRawRequest },
    })),
    __mockRawRequest: mockRawRequest,
  };
});

describe("GraphQLClient", () => {
  it("can be constructed with an API token", () => {
    const client = new GraphQLClient("test-token");
    expect(client).toBeDefined();
  });

  describe("request", () => {
    let mockRawRequest: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const sdk = (await import("@linear/sdk")) as unknown as {
        __mockRawRequest: ReturnType<typeof vi.fn>;
      };
      mockRawRequest = sdk.__mockRawRequest;
      mockRawRequest.mockReset();
    });

    it("throws AuthenticationError on 'Authentication required' error", async () => {
      mockRawRequest.mockRejectedValueOnce({
        response: {
          errors: [{ message: "Authentication required" }],
        },
      });

      const client = new GraphQLClient("bad-token");
      const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
        typeof client.request
      >[0];

      await expect(client.request(fakeDoc)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws AuthenticationError on 'Unauthorized' error message", async () => {
      mockRawRequest.mockRejectedValueOnce({
        response: {
          errors: [{ message: "Unauthorized" }],
        },
      });

      const client = new GraphQLClient("bad-token");
      const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
        typeof client.request
      >[0];

      await expect(client.request(fakeDoc)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws regular Error on non-auth errors", async () => {
      mockRawRequest.mockRejectedValueOnce({
        response: {
          errors: [{ message: "Entity not found" }],
        },
      });

      const client = new GraphQLClient("good-token");
      const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
        typeof client.request
      >[0];

      try {
        await client.request(fakeDoc);
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect((error as Error).message).toBe("Entity not found");
      }
    });
  });
});
