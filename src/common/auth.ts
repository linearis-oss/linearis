import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getStoredToken } from "./token-storage.js";

export interface CommandOptions {
  apiToken?: string;
}

/**
 * Retrieves Linear API token from multiple sources.
 *
 * Checks sources in priority order:
 * 1. --api-token command flag
 * 2. LINEAR_API_TOKEN environment variable
 * 3. ~/.linearis/token (encrypted)
 * 4. ~/.linear_api_token (legacy, deprecated)
 *
 * @throws Error if no token found in any source
 */
export async function getApiToken(options: CommandOptions): Promise<string> {
  // 1. CLI flag
  if (options.apiToken) {
    return options.apiToken;
  }

  // 2. Environment variable
  if (process.env.LINEAR_API_TOKEN) {
    return process.env.LINEAR_API_TOKEN;
  }

  // 3. Encrypted stored token (~/.linearis/token)
  const storedToken = getStoredToken();
  if (storedToken) {
    return storedToken;
  }

  // 4. Legacy plaintext file (~/.linear_api_token) — deprecated
  const legacyFile = path.join(os.homedir(), ".linear_api_token");
  if (fs.existsSync(legacyFile)) {
    console.error(
      "Warning: ~/.linear_api_token is deprecated. Run 'linearis auth' to migrate.",
    );
    return fs.readFileSync(legacyFile, "utf8").trim();
  }

  throw new Error(
    "No API token found. Run 'linearis auth' to set up authentication.",
  );
}
