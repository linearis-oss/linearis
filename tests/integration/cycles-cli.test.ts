import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * Integration tests for cycles CLI commands
 *
 * These tests verify the cycles command works end-to-end with the compiled CLI.
 * They test the fixes from PR #4:
 * - No GraphQL complexity errors
 * - All command flags work correctly
 * - JSON output is valid and structured
 *
 * Note: These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Cycles CLI Commands", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping integration tests\n" +
          "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
      );
    }
  });

  describe("cycles --help", () => {
    it("should display help text", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} cycles --help`);

      expect(stdout).toContain("Usage: linearis cycles");
      expect(stdout).toContain("Cycle operations");
      expect(stdout).toContain("list");
      expect(stdout).toContain("read");
    });
  });

  describe("cycles list", () => {
    it.skipIf(!hasApiToken)("should list cycles without error", async () => {
      const { stdout, stderr } = await execAsync(
        `node ${CLI_PATH} cycles list`,
      );

      // Should not have complexity errors
      expect(stderr).not.toContain("query too complex");
      expect(stderr).not.toContain("complexity");

      // Should return valid JSON
      const cycles = JSON.parse(stdout);
      expect(Array.isArray(cycles)).toBe(true);
    });

    it.skipIf(!hasApiToken)("should return valid cycle structure", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} cycles list`);
      const cycles = JSON.parse(stdout);

      if (cycles.length > 0) {
        const cycle = cycles[0];

        // Verify cycle has expected fields
        expect(cycle).toHaveProperty("id");
        expect(cycle).toHaveProperty("number");
        expect(cycle).toHaveProperty("isActive");
        expect(cycle).toHaveProperty("name");
        expect(cycle).toHaveProperty("startsAt");
        expect(cycle).toHaveProperty("endsAt");

        // Note: Team data is not included in list view for token optimization
      }
    });

    it.skipIf(!hasApiToken)("should filter by active cycles", async () => {
      // First, get a team key from teams list
      const { stdout: teamsOutput } = await execAsync(
        `node ${CLI_PATH} teams list`,
      );
      const teams = JSON.parse(teamsOutput);

      if (teams.length > 0) {
        const teamKey = teams[0].key;

        // Now test active filter
        const { stdout } = await execAsync(
          `node ${CLI_PATH} cycles list --active --team ${teamKey}`,
        );
        const activeCycles = JSON.parse(stdout);

        // All returned cycles should be active
        activeCycles.forEach((cycle: { isActive: boolean }) => {
          expect(cycle.isActive).toBe(true);
        });
      }
    });

    it.skipIf(!hasApiToken)(
      "should work with --window flag",
      async () => {
        // First, get a team key from teams list
        const { stdout: teamsOutput } = await execAsync(
          `node ${CLI_PATH} teams list`,
        );
        const teams = JSON.parse(teamsOutput);

        if (teams.length > 0) {
          const teamKey = teams[0].key;

          // Test window (may fail if no active cycle, which is ok)
          try {
            const { stdout, stderr } = await execAsync(
              `node ${CLI_PATH} cycles list --window 3 --team ${teamKey}`,
            );

            // Should not have complexity errors
            expect(stderr).not.toContain("query too complex");

            const cycles = JSON.parse(stdout);
            expect(Array.isArray(cycles)).toBe(true);
          } catch (error: unknown) {
            // It's ok if there's no active cycle
            const execError = error as { stderr?: string };
            if (!execError.stderr?.includes("No active cycle")) {
              throw error;
            }
          }
        }
      },
      { timeout: 30000 },
    );

    it("should require --team when using --window", async () => {
      try {
        await execAsync(`node ${CLI_PATH} cycles list --window 3`);
        expect.fail("Should have thrown an error");
      } catch (error: unknown) {
        expect((error as { stderr: string }).stderr).toContain(
          "--window requires --team",
        );
      }
    });
  });

  describe("cycles read", () => {
    it.skipIf(!hasApiToken)("should read cycle by ID", async () => {
      // First get a cycle ID
      const { stdout: listOutput } = await execAsync(
        `node ${CLI_PATH} cycles list`,
      );
      const cycles = JSON.parse(listOutput);

      if (cycles.length > 0) {
        const cycleId = cycles[0].id;

        const { stdout, stderr } = await execAsync(
          `node ${CLI_PATH} cycles read ${cycleId}`,
        );

        // Should not have complexity errors
        expect(stderr).not.toContain("query too complex");

        const cycle = JSON.parse(stdout);

        // Verify cycle details structure
        expect(cycle).toHaveProperty("id");
        expect(cycle).toHaveProperty("issues");
        expect(Array.isArray(cycle.issues)).toBe(true);

        // Note: name field is optional - not all cycles have names
      }
    });

    it.skipIf(!hasApiToken)("should read cycle by name with team", async () => {
      // Get team key from teams list
      const { stdout: teamsOutput } = await execAsync(
        `node ${CLI_PATH} teams list`,
      );
      const teams = JSON.parse(teamsOutput);

      if (teams.length === 0) {
        console.log("Skipping: No teams found in workspace");
        return;
      }

      const teamKey = teams[0].key;

      // Get cycles for this team
      const { stdout: listOutput } = await execAsync(
        `node ${CLI_PATH} cycles list --team ${teamKey}`,
      );
      const cycles = JSON.parse(listOutput);

      // Find a cycle that has a name
      const cycleWithName = cycles.find((c: { name?: string }) => c.name);

      if (cycleWithName) {
        const cycleName = cycleWithName.name;

        const { stdout, stderr } = await execAsync(
          `node ${CLI_PATH} cycles read "${cycleName}" --team ${teamKey}`,
        );

        // Should not have complexity errors
        expect(stderr).not.toContain("query too complex");

        const cycle = JSON.parse(stdout);
        expect(cycle.name).toBe(cycleName);
      } else {
        // Skip if no cycles have names - this is ok
        console.log("Skipping: No cycles with names found in workspace");
      }
    });
  });

  describe("Cycles CLI - Error Cases", () => {
    it("should reject --window without --team", async () => {
      if (!hasApiToken) return;

      await expect(
        execAsync(`node ${CLI_PATH} cycles list --window 3`),
      ).rejects.toThrow(/--window requires --team/);
    });

    it.skipIf(!hasApiToken)(
      "should reject --window with non-numeric value",
      async () => {
        // Get a real team key
        const { stdout: teamsOutput } = await execAsync(
          `node ${CLI_PATH} teams list`,
        );
        const teams = JSON.parse(teamsOutput);

        if (teams.length > 0) {
          const teamKey = teams[0].key;

          try {
            await execAsync(
              `node ${CLI_PATH} cycles list --window abc --team ${teamKey}`,
            );
            expect.fail("Should have thrown an error");
          } catch (error: unknown) {
            const execError = error as { stdout?: string; stderr?: string };
            const output = JSON.parse(
              execError.stdout || execError.stderr || "{}",
            );
            expect(output.error).toContain("requires a non-negative integer");
          }
        }
      },
    );

    it.skipIf(!hasApiToken)(
      "should reject --window with negative value",
      async () => {
        // Get a real team key
        const { stdout: teamsOutput } = await execAsync(
          `node ${CLI_PATH} teams list`,
        );
        const teams = JSON.parse(teamsOutput);

        if (teams.length > 0) {
          const teamKey = teams[0].key;

          try {
            await execAsync(
              `node ${CLI_PATH} cycles list --window -5 --team ${teamKey}`,
            );
            expect.fail("Should have thrown an error");
          } catch (error: unknown) {
            const execError = error as { stdout?: string; stderr?: string };
            const output = JSON.parse(
              execError.stdout || execError.stderr || "{}",
            );
            expect(output.error).toContain("requires a non-negative integer");
          }
        }
      },
    );
  });
});
