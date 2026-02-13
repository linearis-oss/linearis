import { LinearClient } from "@linear/sdk";

export class LinearSdkClient {
  readonly sdk: LinearClient;

  constructor(apiToken: string) {
    this.sdk = new LinearClient({ apiKey: apiToken });
  }
}
