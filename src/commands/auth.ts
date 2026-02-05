import { Command } from "commander";
import { exec } from "node:child_process";
import { createInterface } from "node:readline";
import { GraphQLClient } from "../client/graphql-client.js";
import { GetViewerDocument, type GetViewerQuery } from "../gql/graphql.js";
import { resolveApiToken, type CommandOptions, type TokenSource } from "../common/auth.js";
import { saveToken, getStoredToken, clearToken } from "../common/token-storage.js";
import { formatDomainUsage, type DomainMeta } from "../common/usage.js";

const LINEAR_API_KEY_URL = "https://linear.app/settings/account/security/api-keys/new";

export const AUTH_META: DomainMeta = {
  name: "auth",
  summary: "authenticate with Linear API",
  context: [
    "linearis requires a Linear API token for all operations.",
    "the auth command guides you through creating and storing a token.",
    "tokens are encrypted and stored in ~/.linearis/token.",
    "token resolution order: --api-token flag, LINEAR_API_TOKEN env,",
    "~/.linearis/token (encrypted), ~/.linear_api_token (deprecated).",
  ].join("\n"),
  arguments: {},
  seeAlso: [],
};

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  exec(cmd, () => {
    // Browser open failed — URL is already printed, user can open manually
  });
}

function promptToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    process.stderr.write("Paste your Linear API token: ");

    if (process.stdin.isTTY) {
      // Raw mode: read character by character, mask with *
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      let token = "";
      const onData = (char: string): void => {
        if (char === "\n" || char === "\r") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          rl.close();
          resolve(token.trim());
        } else if (char === "\u0003") {
          // Ctrl+C
          process.stdin.setRawMode?.(false);
          rl.close();
          reject(new Error("Cancelled"));
        } else if (char === "\u007F" || char === "\b") {
          // Backspace
          if (token.length > 0) {
            token = token.slice(0, -1);
            process.stderr.write("\b \b");
          }
        } else {
          token += char;
          process.stderr.write("*");
        }
      };
      process.stdin.on("data", onData);
    } else {
      // Non-TTY: read line normally (piped input)
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function validateToken(token: string): Promise<{ id: string; name: string; email: string }> {
  const client = new GraphQLClient(token);
  const result = await client.request<GetViewerQuery>(GetViewerDocument);
  return result.viewer;
}

export function setupAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authenticate with Linear API");

  // Show auth help when no subcommand
  auth.action(() => {
    auth.help();
  });

  auth
    .command("login")
    .description("set up or refresh authentication")
    .option("--force", "reauthenticate even if already authenticated")
    .action(async (options: { force?: boolean }) => {
      try {
        // Check existing authentication
        if (!options.force) {
          const existingToken = getStoredToken();
          if (existingToken) {
            try {
              const viewer = await validateToken(existingToken);
              console.error(
                `Already authenticated as ${viewer.name} (${viewer.email}).`,
              );
              console.error("Run with --force to reauthenticate.");
              return;
            } catch {
              // Token is invalid, proceed with new auth
              console.error("Stored token is invalid. Starting new authentication...");
            }
          }
        }

        // Guide user
        console.error("");
        console.error("To authenticate, create a new Linear API key:");
        console.error("");
        console.error("  1. Open the link below (or it will open automatically)");
        console.error("  2. Set key name to: linearis-cli");
        console.error("  3. Keep 'Full access' selected (default)");
        console.error("  4. Keep 'All teams' selected (default)");
        console.error("  5. Click 'Create'");
        console.error("  6. Copy the generated token");
        console.error("");
        console.error(`  ${LINEAR_API_KEY_URL}`);
        console.error("");

        openBrowser(LINEAR_API_KEY_URL);

        // Prompt for token
        const token = await promptToken();

        if (!token) {
          console.error("No token provided. Authentication cancelled.");
          process.exit(1);
        }

        // Validate token
        console.error("Validating token...");
        let viewer: { id: string; name: string; email: string };
        try {
          viewer = await validateToken(token);
        } catch {
          console.error("Token rejected. Check it's correct and try again.");
          process.exit(1);
        }

        // Store token
        saveToken(token);

        console.error("");
        console.error(`Authentication successful. Logged in as ${viewer.name} (${viewer.email}).`);
        console.error("Token encrypted and stored in ~/.linearis/token");
      } catch (error) {
        console.error(
          `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  auth
    .command("status")
    .description("check current authentication status")
    .action(async (_options: Record<string, unknown>, command: Command) => {
      const rootOpts = command.parent!.parent!.opts() as CommandOptions;

      const sourceLabels: Record<TokenSource, string> = {
        flag: "--api-token flag",
        env: "LINEAR_API_TOKEN env var",
        stored: "~/.linearis/token",
        legacy: "~/.linear_api_token (deprecated)",
      };

      let token: string;
      let source: TokenSource;
      try {
        const resolved = await resolveApiToken(rootOpts);
        token = resolved.token;
        source = resolved.source;
      } catch {
        console.log(JSON.stringify({
          authenticated: false,
          message: "No API token found. Run 'linearis auth login' to authenticate.",
        }, null, 2));
        return;
      }

      try {
        const viewer = await validateToken(token);
        console.log(JSON.stringify({
          authenticated: true,
          source: sourceLabels[source],
          user: { id: viewer.id, name: viewer.name, email: viewer.email },
        }, null, 2));
      } catch {
        console.log(JSON.stringify({
          authenticated: false,
          source: sourceLabels[source],
          message: "Token is invalid or expired. Run 'linearis auth login' to reauthenticate.",
        }, null, 2));
      }
    });

  auth
    .command("logout")
    .description("remove stored authentication token")
    .action(async () => {
      clearToken();
      console.error("Authentication token removed.");
    });

  auth
    .command("usage")
    .description("show detailed usage for auth")
    .action(() => {
      console.log(formatDomainUsage(auth, AUTH_META));
    });
}
