import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLClient } from "../../../src/client/graphql-client.js";
import { AuthenticationError } from "../../../src/common/errors.js";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

function fakeDocument(): Parameters<GraphQLClient["request"]>[0] {
  return { kind: "Document", definitions: [] } as Parameters<
    GraphQLClient["request"]
  >[0];
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

describe("GraphQLClient", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("can be constructed with an API token", () => {
    const client = new GraphQLClient("test-token");
    expect(client).toBeDefined();
  });

  describe("request", () => {
    it("calls fetch with the Linear GraphQL endpoint", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

      const client = new GraphQLClient("test-token");
      await client.request(fakeDocument());

      expect(fetchMock).toHaveBeenCalledWith(
        LINEAR_GRAPHQL_ENDPOINT,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("sends POST, expected headers, and expected JSON body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

      const client = new GraphQLClient("test-token");
      await client.request(fakeDocument(), { issueId: "LIN-123" });

      expect(fetchMock).toHaveBeenCalledWith(
        LINEAR_GRAPHQL_ENDPOINT,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "test-token",
            "public-file-urls-expire-in": "3600",
          }),
          body: JSON.stringify({
            query: "",
            variables: { issueId: "LIN-123" },
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("returns data from successful GraphQL responses", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { foo: "bar" } }));

      const client = new GraphQLClient("good-token");
      const result = await client.request<{ foo: string }>(fakeDocument());

      expect(result).toEqual({ foo: "bar" });
    });

    it("throws AuthenticationError on 'Authentication required' GraphQL error", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: "Authentication required" }] }),
      );

      const client = new GraphQLClient("bad-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws AuthenticationError on 'Unauthorized' GraphQL error", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: "Unauthorized" }] }),
      );

      const client = new GraphQLClient("bad-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("throws regular Error on non-auth GraphQL errors", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: "Entity not found" }] }),
      );

      const client = new GraphQLClient("good-token");

      try {
        await client.request(fakeDocument());
        expect.fail("Should have thrown");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect((error as Error).message).toBe("Entity not found");
      }
    });

    it("clears timeout timer when request succeeds before timeout", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

      const client = new GraphQLClient("good-token");
      const result = await client.request<{ ok: boolean }>(fakeDocument());

      expect(result).toEqual({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears timeout timer on non-retryable GraphQL error", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: "Entity not found" }] }),
      );

      const client = new GraphQLClient("good-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        "Entity not found",
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears timeout timer on non-retryable HTTP error", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { errors: [{ message: "Bad request" }] },
          { status: 400, statusText: "Bad Request" },
        ),
      );

      const client = new GraphQLClient("good-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        "Bad request",
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("aborts in-flight fetch when timeout elapses", async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;
      fetchMock.mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          capturedSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            capturedSignal?.addEventListener("abort", () => {
              reject(new Error("aborted-by-signal"));
            });
          });
        },
      );

      const client = new GraphQLClient("good-token");
      const promise = client.request(fakeDocument());
      const rejection = expect(promise).rejects.toThrow("Request timed out");

      await vi.runAllTimersAsync();

      await rejection;
      expect(capturedSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("maps timeout abort to Request timed out", async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          const signal = init?.signal;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(
                new DOMException("This operation was aborted", "AbortError"),
              );
            });
          });
        },
      );

      const client = new GraphQLClient("good-token");
      const promise = client.request(fakeDocument());
      const rejection = expect(promise).rejects.toThrow("Request timed out");

      await vi.runAllTimersAsync();
      await rejection;
    });

    it("retries on HTTP 429 and succeeds on next attempt", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            { errors: [{ message: "Rate limited" }] },
            { status: 429, statusText: "Too Many Requests" },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ data: { foo: "bar" } }));

      const client = new GraphQLClient("good-token");
      const promise = client.request(fakeDocument());
      const expectation = expect(promise).resolves.toEqual({ foo: "bar" });
      void expectation.catch(() => undefined);

      await vi.runAllTimersAsync();
      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("retries on HTTP 5xx and succeeds on next attempt", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            { message: "Upstream unavailable" },
            { status: 502, statusText: "Bad Gateway" },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

      const client = new GraphQLClient("good-token");
      const promise = client.request(fakeDocument());
      const expectation = expect(promise).resolves.toEqual({ ok: true });
      void expectation.catch(() => undefined);

      await vi.runAllTimersAsync();
      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears timeout timers across retry attempts", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            { errors: [{ message: "Rate limited" }] },
            { status: 429, statusText: "Too Many Requests" },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ data: { foo: "bar" } }));

      const client = new GraphQLClient("good-token");
      const promise = client.request(fakeDocument());
      const expectation = expect(promise).resolves.toEqual({ foo: "bar" });
      void expectation.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(500);

      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("uses a useful HTTP error for non-2xx invalid JSON", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("not-json", { status: 502, statusText: "Bad Gateway" }),
      );

      const client = new GraphQLClient("good-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        "GraphQL request failed: HTTP 502 Bad Gateway",
      );
    });

    it("uses a useful HTTP error for non-2xx empty JSON", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("", { status: 502, statusText: "Bad Gateway" }),
      );

      const client = new GraphQLClient("good-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        "GraphQL request failed: HTTP 502 Bad Gateway",
      );
    });

    it("wraps 2xx invalid JSON as a GraphQL request failure", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("not-json", { status: 200 }),
      );

      const client = new GraphQLClient("good-token");

      await expect(client.request(fakeDocument())).rejects.toThrow(
        "GraphQL request failed: Invalid JSON response",
      );
    });
  });
});
