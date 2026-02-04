import { LinearClient } from "@linear/sdk";

/**
 * Wrapper for Linear SDK client.
 *
 * Provides access to Linear's official SDK for operations that benefit
 * from the SDK's built-in types and helper methods. Used primarily in
 * the resolver layer for ID resolution and lookups.
 *
 * @example
 * ```typescript
 * const client = new LinearSdkClient(apiToken);
 * const teams = await client.sdk.teams({ filter: { key: { eq: "ENG" } } });
 * ```
 */
export class LinearSdkClient {
  readonly sdk: LinearClient;

  /**
   * Initialize SDK client with API token.
   *
   * @param apiToken - Linear API token for authentication
   */
  constructor(apiToken: string) {
    this.sdk = new LinearClient({ apiKey: apiToken });
  }
}
