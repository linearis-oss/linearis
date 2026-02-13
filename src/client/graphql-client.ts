import { LinearClient } from "@linear/sdk";
import { type DocumentNode, print } from "graphql";
import { AuthenticationError, isAuthError } from "../common/errors.js";

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
