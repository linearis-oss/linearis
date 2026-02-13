import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * Integration tests for teams CLI commands
 *
 * These tests verify the teams command works end-to-end with the compiled CLI.
 *
 * Note: These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Teams CLI Commands", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping integration tests\n" +
          "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
      );
    }
  });

  describe("teams --help", () => {
    it("should display help text", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams --help`);

      expect(stdout).toContain("Usage: linearis teams");
      expect(stdout).toContain("Team operations");
      expect(stdout).toContain("list");
    });
  });

  describe("teams list", () => {
    it.skipIf(!hasApiToken)("should list teams without error", async () => {
      const { stdout, stderr } = await execAsync(`node ${CLI_PATH} teams list`);

      // Should not have errors
      expect(stderr).not.toContain("error");

      // Should return valid JSON
      const teams = JSON.parse(stdout);
      expect(Array.isArray(teams)).toBe(true);
    });

    it.skipIf(!hasApiToken)("should return valid team structure", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams list`);
      const teams = JSON.parse(stdout);

      // Should have at least one team
      expect(teams.length).toBeGreaterThan(0);

      const team = teams[0];

      // Verify team has expected fields
      expect(team).toHaveProperty("id");
      expect(team).toHaveProperty("key");
      expect(team).toHaveProperty("name");
      // Note: description omitted in new architecture for token optimization
    });

    it.skipIf(!hasApiToken)("should return teams sorted by name", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams list`);
      const teams = JSON.parse(stdout);

      if (teams.length > 1) {
        // Verify alphabetical order
        for (let i = 1; i < teams.length; i++) {
          const prev = teams[i - 1].name.toLowerCase();
          const curr = teams[i].name.toLowerCase();
          expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
      }
    });
  });
});
