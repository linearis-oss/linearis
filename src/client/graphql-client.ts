import { LinearClient } from "@linear/sdk";
import { type DocumentNode, print } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";
import { withRetry } from "../common/retry.js";

/** Default timeout for GraphQL API requests (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

interface GraphQLErrorResponse {
  response?: {
    errors?: Array<{ message: string }>;
  };
  message?: string;
}

export class GraphQLClient {
  private rawClient: InstanceType<typeof LinearClient>["client"];

  constructor(apiToken: string) {
    const linearClient = new LinearClient({
      apiKey: apiToken,
      headers: {
        // Request 1-hour signed URLs for file downloads (see file-service.ts)
        "public-file-urls-expire-in": "3600",
      },
    });
    this.rawClient = linearClient.client;
  }

  async request<TResult>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<TResult> {
    return withRetry(async () => {
      try {
        const response = await Promise.race([
          this.rawClient.rawRequest(print(document), variables),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Request timed out")),
              REQUEST_TIMEOUT_MS,
            ),
          ),
        ]);
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
    });
  }
}
