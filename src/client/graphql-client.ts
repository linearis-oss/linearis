import { LinearClient } from "@linear/sdk";
import { print, type DocumentNode } from "graphql";

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
      if (gqlError.response?.errors?.[0]) {
        throw new Error(gqlError.response.errors[0].message || "GraphQL query failed");
      }
      throw new Error(
        `GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
