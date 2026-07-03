import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLClient } from "../../../src/client/graphql-client.js";
import { AuthenticationError } from "../../../src/common/errors.js";

// A stand-in document for the error-path tests. Typing its variables as
// `Record<string, never>` makes `request`'s variables argument optional, so
// these calls can invoke it without variables.
function fakeDocument<TResult = unknown>(): TypedDocumentNode<
  TResult,
  Record<string, never>
> {
  return {
    kind: "Document",
    definitions: [],
  } as unknown as TypedDocumentNode<TResult, Record<string, never>>;
}

// Build a minimal `fetch` Response stand-in. Only the fields the transport
// touches (`ok`, `status`, `json`) are populated.
function fakeResponse(
  init: { ok: boolean; status: number },
  body: unknown,
): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => body,
  } as unknown as Response;
}

describe("GraphQLClient", () => {
  it("can be constructed with an API token", () => {
    const client = new GraphQLClient("test-token");
    expect(client).toBeDefined();
  });

  describe("request", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("sends the expected request to the Linear GraphQL endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse({ ok: true, status: 200 }, { data: { ok: true } }),
      );

      const client = new GraphQLClient("test-token");
      const fakeDoc = fakeDocument<{ ok: boolean }>();

      await client.request(fakeDoc);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit & { headers: Record<string, string> },
      ];
      expect(url).toBe("https://api.linear.app/graphql");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe("test-token");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers["public-file-urls-expire-in"]).toBe("3600");
      const body = JSON.parse(options.body as string);
      expect(body).toHaveProperty("query");
    });

    it("throws AuthenticationError on 'Authentication required' error", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse(
          { ok: false, status: 400 },
          { errors: [{ message: "Authentication required" }] },
        ),
      );

      const client = new GraphQLClient("bad-token");
      const fakeDoc = fakeDocument();

      await expect(client.request(fakeDoc)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws AuthenticationError on 'Unauthorized' error message", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse(
          { ok: false, status: 401 },
          { errors: [{ message: "Unauthorized" }] },
        ),
      );

      const client = new GraphQLClient("bad-token");
      const fakeDoc = fakeDocument();

      await expect(client.request(fakeDoc)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws regular Error on non-auth errors", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse(
          { ok: false, status: 400 },
          { errors: [{ message: "Entity not found" }] },
        ),
      );

      const client = new GraphQLClient("good-token");
      const fakeDoc = fakeDocument();

      try {
        await client.request(fakeDoc);
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect((error as Error).message).toBe("Entity not found");
      }
    });

    it("throws regular Error on GraphQL errors returned with HTTP 200", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse(
          { ok: true, status: 200 },
          { errors: [{ message: "Entity not found" }] },
        ),
      );

      const client = new GraphQLClient("good-token");
      const fakeDoc = fakeDocument();

      await expect(client.request(fakeDoc)).rejects.toThrow("Entity not found");
    });

    it("throws when the response contains no data", async () => {
      mockFetch.mockResolvedValueOnce(
        fakeResponse({ ok: true, status: 200 }, { data: undefined }),
      );

      const client = new GraphQLClient("good-token");
      const fakeDoc = fakeDocument();

      await expect(client.request(fakeDoc)).rejects.toThrow(
        "GraphQL response contained no data",
      );
    });

    it("clears timeout timer when request succeeds before timeout", async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValueOnce(
          fakeResponse({ ok: true, status: 200 }, { data: { ok: true } }),
        );

        const client = new GraphQLClient("good-token");
        const fakeDoc = fakeDocument<{ ok: boolean }>();

        const result = await client.request(fakeDoc);

        expect(result).toEqual({ ok: true });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears timeout timer on non-retryable GraphQL error", async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValueOnce(
          fakeResponse(
            { ok: false, status: 400 },
            { errors: [{ message: "Entity not found" }] },
          ),
        );

        const client = new GraphQLClient("good-token");
        const fakeDoc = fakeDocument();

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
        let capturedSignal: AbortSignal | undefined;
        mockFetch.mockImplementation(
          (_url: string, options: { signal?: AbortSignal }) => {
            capturedSignal = options.signal;
            return new Promise((_, reject) => {
              options.signal?.addEventListener("abort", () => {
                reject(new Error("This operation was aborted"));
              });
            });
          },
        );

        const client = new GraphQLClient("good-token");
        const fakeDoc = fakeDocument();

        const promise = client.request(fakeDoc);
        const rejection = expect(promise).rejects.toThrow("Request timed out");
        await vi.runAllTimersAsync();

        await rejection;
        expect(capturedSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("retries on 429 and succeeds on next attempt", async () => {
      mockFetch
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 429 }, {}))
        .mockResolvedValueOnce(
          fakeResponse({ ok: true, status: 200 }, { data: { foo: "bar" } }),
        );

      const client = new GraphQLClient("good-token");
      const fakeDoc = fakeDocument();

      vi.useFakeTimers();
      try {
        const promise = client.request(fakeDoc);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result).toEqual({ foo: "bar" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears timeout timers across retry attempts", async () => {
      vi.useFakeTimers();
      try {
        mockFetch
          .mockResolvedValueOnce(fakeResponse({ ok: false, status: 429 }, {}))
          .mockResolvedValueOnce(
            fakeResponse({ ok: true, status: 200 }, { data: { foo: "bar" } }),
          );

        const client = new GraphQLClient("good-token");
        const fakeDoc = fakeDocument();

        const promise = client.request(fakeDoc);

        // Advance only the first retry backoff (500ms), without draining unrelated timers.
        await vi.advanceTimersByTimeAsync(500);

        await expect(promise).resolves.toEqual({ foo: "bar" });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
