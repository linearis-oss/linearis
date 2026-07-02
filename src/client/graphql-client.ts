import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { LinearClient } from "@linear/sdk";
import { print } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";
import { withRetry } from "../common/retry.js";

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

interface GraphQLErrorResponse {
  response?: {
    errors?: Array<{ message: string }>;
  };
  message?: string;
}

export class GraphQLClient {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private createRawClient(
    signal?: AbortSignal,
  ): InstanceType<typeof LinearClient>["client"] {
    const linearClient = new LinearClient({
      apiKey: this.apiToken,
      signal,
      headers: {
        // Request 1-hour signed URLs for file downloads (see file-service.ts)
        "public-file-urls-expire-in": "3600",
      },
    });
    return linearClient.client;
  }

  async request<TResult, TVariables extends Record<string, unknown>>(
    document: TypedDocumentNode<TResult, TVariables>,
    // `NoInfer` pins `TVariables` to the document, so the variables argument is
    // type-checked against it rather than widening the inferred type itself.
    ...[variables]: RequestVariables<NoInfer<TVariables>>
  ): Promise<TResult> {
    try {
      const response = await withRetry(async () => {
        const timeoutController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          timeoutController.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          // Constraining `TVariables extends Record<string, unknown>` lets
          // `variables` satisfy rawRequest's own variables bound directly, so no
          // cast is needed here. `data` stays untyped (`unknown`) and is checked
          // and cast to `TResult` below.
          return await this.createRawClient(
            timeoutController.signal,
          ).rawRequest(print(document), variables);
        } catch (error: unknown) {
          if (
            timeoutController.signal.aborted &&
            error instanceof Error &&
            error.message.toLowerCase().includes("aborted")
          ) {
            throw new Error("Request timed out");
          }
          throw error;
        } finally {
          clearTimeout(timeoutHandle);
        }
      });
      // rawRequest resolves with `data: unknown | undefined`; guard the absent
      // case instead of asserting it away, so a dataless response surfaces as a
      // clear error rather than a `TResult`-typed `undefined`.
      if (response.data == null) {
        throw new Error("GraphQL response contained no data");
      }
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
