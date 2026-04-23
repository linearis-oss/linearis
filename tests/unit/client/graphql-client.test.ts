import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLClient } from "../../../src/client/graphql-client.js";
import { AuthenticationError } from "../../../src/common/errors.js";

// We test the error handling logic by mocking the underlying rawRequest
// The constructor creates a real LinearClient, so we mock at module level
vi.mock("@linear/sdk", () => {
  const mockRawRequest = vi.fn();
  const mockConstructorCalls: Array<{ signal?: AbortSignal }> = [];
  return {
    // biome-ignore lint/complexity/useArrowFunction: vitest v4 requires regular function for constructor mocks
    LinearClient: vi.fn().mockImplementation(function (options?: {
      signal?: AbortSignal;
    }) {
      mockConstructorCalls.push(options ?? {});
      return { client: { rawRequest: mockRawRequest } };
    }),
    __mockRawRequest: mockRawRequest,
    __mockConstructorCalls: mockConstructorCalls,
  };
});

describe("GraphQLClient", () => {
  it("can be constructed with an API token", () => {
    const client = new GraphQLClient("test-token");
    expect(client).toBeDefined();
  });

  describe("request", () => {
    let mockRawRequest: ReturnType<typeof vi.fn>;
    let mockConstructorCalls: Array<{ signal?: AbortSignal }>;

    beforeEach(async () => {
      const sdk = (await import("@linear/sdk")) as unknown as {
        __mockRawRequest: ReturnType<typeof vi.fn>;
        __mockConstructorCalls: Array<{ signal?: AbortSignal }>;
      };
      mockRawRequest = sdk.__mockRawRequest;
      mockConstructorCalls = sdk.__mockConstructorCalls;
      mockRawRequest.mockReset();
      mockConstructorCalls.length = 0;
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

    it("clears timeout timer when request succeeds before timeout", async () => {
      vi.useFakeTimers();
      try {
        mockRawRequest.mockResolvedValueOnce({ data: { ok: true } });

        const client = new GraphQLClient("good-token");
        const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
          typeof client.request
        >[0];

        const result = await client.request<{ ok: boolean }>(fakeDoc);

        expect(result).toEqual({ ok: true });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears timeout timer on non-retryable GraphQL error", async () => {
      vi.useFakeTimers();
      try {
        mockRawRequest.mockRejectedValueOnce({
          response: {
            errors: [{ message: "Entity not found" }],
          },
        });

        const client = new GraphQLClient("good-token");
        const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
          typeof client.request
        >[0];

        await expect(client.request(fakeDoc)).rejects.toThrow(
          "Entity not found",
        );
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("aborts in-flight request when timeout elapses", async () => {
      vi.useFakeTimers();
      try {
        mockRawRequest.mockImplementation(() => {
          const call = mockConstructorCalls.at(-1);
          return new Promise((_, reject) => {
            call?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted-by-signal"));
            });
          });
        });

        const client = new GraphQLClient("good-token");
        const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
          typeof client.request
        >[0];

        const promise = client.request(fakeDoc);
        const rejection = expect(promise).rejects.toThrow("Request timed out");
        await vi.runAllTimersAsync();

        await rejection;
        expect(mockConstructorCalls.at(-1)?.signal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("retries on 429 and succeeds on next attempt", async () => {
      const rateLimitError = { response: { status: 429 } };
      mockRawRequest
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: { foo: "bar" } });

      const client = new GraphQLClient("good-token");
      const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
        typeof client.request
      >[0];

      vi.useFakeTimers();
      try {
        const promise = client.request(fakeDoc);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ foo: "bar" });
        expect(mockRawRequest).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears timeout timers across retry attempts", async () => {
      vi.useFakeTimers();
      try {
        const rateLimitError = { response: { status: 429 } };
        mockRawRequest
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce({ data: { foo: "bar" } });

        const client = new GraphQLClient("good-token");
        const fakeDoc = { kind: "Document", definitions: [] } as Parameters<
          typeof client.request
        >[0];

        const promise = client.request(fakeDoc);

        // Advance only the first retry backoff (500ms), without draining unrelated timers.
        await vi.advanceTimersByTimeAsync(500);

        await expect(promise).resolves.toEqual({ foo: "bar" });
        expect(mockRawRequest).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
