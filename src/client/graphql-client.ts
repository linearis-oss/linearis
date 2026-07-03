import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { print } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";
import { withRetry } from "../common/retry.js";

/** Linear's GraphQL API endpoint. */
const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

/** Default timeout for GraphQL API requests (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Variable-less operations generate `Exact<{ [key: string]: never }>` for their
 * variables type. Make the variables argument optional in exactly that case and
 * required otherwise, so callers infer both types from the document alone.
 */
type RequestVariables<TVariables> =
  TVariables extends Record<string, never>
    ? [variables?: TVariables]
    : [variables: TVariables];

interface GraphQLError {
  message: string;
}

interface GraphQLResponseBody {
  data?: unknown;
  errors?: GraphQLError[];
}

interface GraphQLErrorResponse {
  response?: {
    errors?: GraphQLError[];
  };
  message?: string;
}

/**
 * Transport-level error carrying an HTTP status and any GraphQL errors. The
 * `response` shape mirrors what `withRetry`/`isRetryable` and the `request()`
 * catch block expect, so retry and error-mapping behavior stay unchanged after
 * dropping the SDK's `rawRequest`.
 */
interface TransportErrorResponse {
  status: number;
  errors?: GraphQLError[] | undefined;
}

class GraphQLTransportError extends Error {
  readonly response: TransportErrorResponse;

  constructor(message: string, response: TransportErrorResponse) {
    super(message);
    this.name = "GraphQLTransportError";
    this.response = response;
  }
}

export class GraphQLClient {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Perform a single GraphQL request over native `fetch`. Returns the raw
   * `data` payload (typed `unknown`, validated by the caller) or throws a
   * `GraphQLTransportError` for HTTP failures and GraphQL-level errors.
   */
  private async execute(
    document: TypedDocumentNode<unknown, Record<string, unknown>>,
    variables: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        // Personal API keys are sent as the raw Authorization value (matching
        // the SDK, which forwards `apiKey` verbatim).
        Authorization: this.apiToken,
        // Request 1-hour signed URLs for file downloads (see file-service.ts)
        "public-file-urls-expire-in": "3600",
      },
      body: JSON.stringify({ query: print(document), variables }),
    });

    // Parse defensively: a non-JSON body (e.g. an HTML error page) should not
    // mask the underlying HTTP status.
    let body: GraphQLResponseBody | undefined;
    try {
      body = (await response.json()) as GraphQLResponseBody;
    } catch {
      body = undefined;
    }

    const errors = body?.errors;

    if (!response.ok) {
      // Surface HTTP failures with their status so `isRetryable` can retry 429
      // and 5xx responses.
      const message =
        errors?.[0]?.message ?? `Request failed with status ${response.status}`;
      throw new GraphQLTransportError(message, {
        status: response.status,
        errors,
      });
    }

    if (errors && errors.length > 0) {
      // GraphQL errors are returned with HTTP 200; propagate them the same way.
      throw new GraphQLTransportError(errors[0]?.message ?? "", {
        status: response.status,
        errors,
      });
    }

    return body?.data;
  }

  async request<TResult, TVariables extends Record<string, unknown>>(
    document: TypedDocumentNode<TResult, TVariables>,
    // `NoInfer` pins `TVariables` to the document, so the variables argument is
    // type-checked against it rather than widening the inferred type itself.
    ...[variables]: RequestVariables<NoInfer<TVariables>>
  ): Promise<TResult> {
    try {
      const data = await withRetry(async () => {
        const timeoutController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          timeoutController.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          // `TVariables extends Record<string, unknown>` lets `variables` widen
          // to the `execute` bound directly. `data` stays untyped (`unknown`)
          // and is checked and cast to `TResult` below.
          return await this.execute(
            document as TypedDocumentNode<unknown, Record<string, unknown>>,
            variables,
            timeoutController.signal,
          );
        } catch (error: unknown) {
          if (
            timeoutController.signal.aborted &&
            error instanceof Error &&
            error.message.toLowerCase().includes("abort")
          ) {
            throw new Error("Request timed out");
          }
          throw error;
        } finally {
          clearTimeout(timeoutHandle);
        }
      });
      // A successful response with no `data` (and no errors) is unexpected;
      // guard it instead of returning a `TResult`-typed `undefined`.
      if (data == null) {
        throw new Error("GraphQL response contained no data");
      }
      return data as TResult;
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
