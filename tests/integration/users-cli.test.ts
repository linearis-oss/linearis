import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * Integration tests for users CLI commands
 *
 * These tests verify the users command works end-to-end with the compiled CLI.
 *
 * Note: These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Users CLI Commands", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping integration tests\n" +
          "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
      );
    }
  });

  describe("users --help", () => {
    it("should display help text", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} users --help`);

      expect(stdout).toContain("Usage: linearis users");
      expect(stdout).toContain("User operations");
      expect(stdout).toContain("list");
    });
  });

  describe("users list", () => {
    it.skipIf(!hasApiToken)("should list users without error", async () => {
      const { stdout, stderr } = await execAsync(`node ${CLI_PATH} users list`);

      // Should not have errors
      expect(stderr).not.toContain("error");

      // Should return valid JSON
      const users = JSON.parse(stdout);
      expect(Array.isArray(users)).toBe(true);
    });

    it.skipIf(!hasApiToken)("should return valid user structure", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} users list`);
      const users = JSON.parse(stdout);

      // Should have at least one user
      expect(users.length).toBeGreaterThan(0);

      const user = users[0];

      // Verify user has expected fields
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("active");
      // Note: displayName omitted in new architecture for token optimization
    });

    it.skipIf(!hasApiToken)("should filter active users only", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} users list --active`,
      );
      const users = JSON.parse(stdout);

      // All returned users should be active
      for (const user of users) {
        expect(user.active).toBe(true);
      }
    });

    it.skipIf(!hasApiToken)("should return users sorted by name", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} users list`);
      const users = JSON.parse(stdout);

      if (users.length > 1) {
        // Verify alphabetical order
        for (let i = 1; i < users.length; i++) {
          const prev = users[i - 1].name.toLowerCase();
          const curr = users[i].name.toLowerCase();
          expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
      }
    });
  });
});
