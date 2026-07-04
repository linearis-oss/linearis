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
const hasApiToken = !!process.env["LINEAR_API_TOKEN"];

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

    it("should list the management subcommands", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams --help`);

      expect(stdout).toContain("create");
      expect(stdout).toContain("update");
      expect(stdout).toContain("members");
      expect(stdout).toContain("add-member");
      expect(stdout).toContain("remove-member");
    });
  });

  describe("teams create --help", () => {
    it("should document create flags", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} teams create --help`,
      );

      expect(stdout).toContain("--key");
      expect(stdout).toContain("--estimation-type");
      expect(stdout).toContain("--parent");
    });
  });

  describe("teams add-member --help", () => {
    it("should document the --user flag", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} teams add-member --help`,
      );

      expect(stdout).toContain("--user");
    });
  });

  describe("teams list", () => {
    it.skipIf(!hasApiToken)("should list teams without error", async () => {
      const { stdout, stderr } = await execAsync(`node ${CLI_PATH} teams list`);

      // Should not have errors
      expect(stderr).not.toContain("error");

      // Should return valid JSON
      const response = JSON.parse(stdout);
      expect(Array.isArray(response.nodes)).toBe(true);
    });

    it.skipIf(!hasApiToken)("should return valid team structure", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams list`);
      const response = JSON.parse(stdout);

      // Should have at least one team
      expect(response.nodes.length).toBeGreaterThan(0);

      const team = response.nodes[0];

      // Verify team has expected fields
      expect(team).toHaveProperty("id");
      expect(team).toHaveProperty("key");
      expect(team).toHaveProperty("name");
      // Note: description omitted in new architecture for token optimization
    });

    it.skipIf(!hasApiToken)("should return teams sorted by name", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} teams list`);
      const response = JSON.parse(stdout);

      if (response.nodes.length > 1) {
        // Verify alphabetical order
        for (let i = 1; i < response.nodes.length; i++) {
          const prev = response.nodes[i - 1].name.toLowerCase();
          const curr = response.nodes[i].name.toLowerCase();
          expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
      }
    });
  });
});
