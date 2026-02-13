import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStoredToken } from "./token-storage.js";

export interface CommandOptions {
  apiToken?: string;
}

export type TokenSource = "flag" | "env" | "stored" | "legacy";

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

/** @throws Error if no token found in any source */
export function resolveApiToken(options: CommandOptions): ResolvedToken {
  // 1. CLI flag
  if (options.apiToken) {
    return { token: options.apiToken, source: "flag" };
  }

  // 2. Environment variable
  if (process.env.LINEAR_API_TOKEN) {
    return { token: process.env.LINEAR_API_TOKEN, source: "env" };
  }

  // 3. Encrypted stored token (~/.linearis/token)
  const storedToken = getStoredToken();
  if (storedToken) {
    return { token: storedToken, source: "stored" };
  }

  // 4. Legacy plaintext file (~/.linear_api_token) — deprecated
  const legacyFile = path.join(os.homedir(), ".linear_api_token");
  if (fs.existsSync(legacyFile)) {
    console.error(
      "Warning: ~/.linear_api_token is deprecated. Run 'linearis auth' to migrate.",
    );
    return {
      token: fs.readFileSync(legacyFile, "utf8").trim(),
      source: "legacy",
    };
  }

  throw new Error(
    "No API token found. Run 'linearis auth' to set up authentication.",
  );
}

export function getApiToken(options: CommandOptions): string {
  const { token } = resolveApiToken(options);
  return token;
}
