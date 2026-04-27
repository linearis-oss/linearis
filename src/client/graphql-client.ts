import { type DocumentNode, print } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";
import { withRetry } from "../common/retry.js";

/** Default timeout for GraphQL API requests (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;
const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

interface GraphQLResponseError {
  message: string;
}

interface GraphQLResponseBody {
  data?: unknown;
  errors?: GraphQLResponseError[];
  message?: string;
}

interface GraphQLErrorResponse {
  response?: {
    status?: number;
    errors?: GraphQLResponseError[];
  };
  message?: string;
}

class GraphQLTransportError extends Error {
  readonly response: {
    status?: number;
    errors?: GraphQLResponseError[];
  };

  constructor(
    message: string,
    response: { status?: number; errors?: GraphQLResponseError[] },
  ) {
    super(message);
    this.name = "GraphQLTransportError";
    this.response = response;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toGraphQLErrors(value: unknown): GraphQLResponseError[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const errors = value.flatMap((entry): GraphQLResponseError[] => {
    if (!isRecord(entry) || typeof entry.message !== "string") return [];
    return [{ message: entry.message }];
  });

  return errors.length > 0 ? errors : undefined;
}

async function parseJsonResponse(
  response: Response,
): Promise<GraphQLResponseBody | undefined> {
  const text = await response.text();
  if (text.trim() === "") return undefined;

  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) return undefined;

  return {
    data: parsed.data,
    errors: toGraphQLErrors(parsed.errors),
    message: typeof parsed.message === "string" ? parsed.message : undefined,
  };
}

async function parseResponseBody(
  response: Response,
): Promise<GraphQLResponseBody | undefined> {
  try {
    return await parseJsonResponse(response);
  } catch (_error: unknown) {
    if (response.ok) throw new Error("Invalid JSON response");
    return undefined;
  }
}

function httpErrorMessage(
  response: Response,
  body: GraphQLResponseBody | undefined,
): string {
  return (
    body?.errors?.[0]?.message ??
    body?.message ??
    `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
  );
}

function isAbortAfterTimeout(signal: AbortSignal, error: unknown): boolean {
  if (!signal.aborted) return false;
  if (!(error instanceof Error)) return true;

  const message = error.message.toLowerCase();
  return error.name === "AbortError" || message.includes("aborted");
}

export class GraphQLClient {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async request<TResult>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<TResult> {
    try {
      const response = await withRetry(async () => {
        const timeoutController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          timeoutController.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          const fetchResponse = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: this.apiToken,
              // Request 1-hour signed URLs for file downloads (see file-service.ts)
              "public-file-urls-expire-in": "3600",
            },
            body: JSON.stringify({ query: print(document), variables }),
            signal: timeoutController.signal,
          });

          const body = await parseResponseBody(fetchResponse);

          if (!fetchResponse.ok) {
            throw new GraphQLTransportError(
              httpErrorMessage(fetchResponse, body),
              {
                status: fetchResponse.status,
                errors: body?.errors,
              },
            );
          }

          if (body?.errors?.[0]) {
            throw new GraphQLTransportError(body.errors[0].message, {
              errors: body.errors,
            });
          }

          if (!body) throw new Error("Invalid JSON response");

          return { data: body.data };
        } catch (error: unknown) {
          if (isAbortAfterTimeout(timeoutController.signal, error)) {
            throw new Error("Request timed out");
          }
          throw error;
        } finally {
          clearTimeout(timeoutHandle);
        }
      });
      return response.data as TResult;
    } catch (error: unknown) {
      const gqlError = error as GraphQLErrorResponse;
      const errorMessage = gqlError.response?.errors?.[0]?.message ?? "";

      if (isAuthError(new Error(errorMessage))) {
        throw new AuthenticationError(errorMessage || undefined);
      }

      if (errorMessage) {
        throw new Error(errorMessage);
      }
      throw new Error(
        `GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
