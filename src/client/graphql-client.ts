import { LinearClient } from "@linear/sdk";
import { print, type DocumentNode } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";

interface GraphQLErrorResponse {
  response?: {
    errors?: Array<{ message: string }>;
  };
  message?: string;
}

/**
 * Typed GraphQL client for Linear API operations.
 *
 * Wraps Linear SDK's raw client to provide type-safe GraphQL operations
 * using generated DocumentNode types from codegen. Handles authentication
 * and error transformation automatically.
 *
 * @example
 * ```typescript
 * const client = new GraphQLClient(apiToken);
 * const result = await client.request<GetIssuesQuery>(
 *   GetIssuesDocument,
 *   { first: 10 }
 * );
 * ```
 */
export class GraphQLClient {
  private rawClient: InstanceType<typeof LinearClient>["client"];

  /**
   * Initialize GraphQL client with API token.
   *
   * @param apiToken - Linear API token for authentication
   */
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

  /**
   * Execute a typed GraphQL operation.
   *
   * @param document - GraphQL DocumentNode from codegen
   * @param variables - Query/mutation variables
   * @returns Typed result matching the operation's return type
   * @throws Error with descriptive message if GraphQL operation fails
   */
  async request<TResult>(
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<TResult> {
    try {
      const response = await this.rawClient.rawRequest(
        print(document),
        variables,
      );
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
