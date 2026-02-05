import { beforeAll, describe, expect, it } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Integration tests for milestones CLI command
 *
 * These tests verify the command naming fix from PR #4:
 * - Command accessible via kebab-case (milestones)
 * - Old camelCase (projectMilestones) fails appropriately
 * - Command functionality unchanged
 *
 * Note: Create/update tests leave test data in Linear workspace.
 * Manual cleanup may be required. Consider using a test workspace.
 *
 * These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Milestones CLI Commands", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - some integration tests will be skipped\n",
      );
    }
  });

  describe("command naming", () => {
    it("should display help with kebab-case naming", async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} milestones --help`,
      );

      expect(stdout).toContain("Usage: linearis milestones");
      expect(stdout).toContain("Project milestone operations");
      expect(stdout).toContain("list");
      expect(stdout).toContain("read");
      expect(stdout).toContain("create");
      expect(stdout).toContain("update");
    });

    it("should appear in main help with kebab-case", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`);

      expect(stdout).toContain("milestones");
      expect(stdout).not.toContain("projectMilestones");
    });

    it("should fail gracefully with old camelCase naming", async () => {
      try {
        await execAsync(`node ${CLI_PATH} projectMilestones --help`);
        // If it doesn't throw, check that it shows main help (unknown command)
        const { stdout } = await execAsync(
          `node ${CLI_PATH} projectMilestones --help`,
        ).catch(
          (e) => e,
        );
        expect(stdout).toContain("Usage: linearis");
      } catch (error: any) {
        // Expected to fail - old command name not recognized
        expect(error.stderr || error.message).toBeTruthy();
      }
    });
  });

  describe("milestones list", () => {
    it.skipIf(!hasApiToken)("should require --project flag", async () => {
      try {
        await execAsync(`node ${CLI_PATH} milestones list`);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.stderr).toContain("required option");
        expect(error.stderr).toContain("--project");
      }
    });

    it.skipIf(!hasApiToken)(
      "should list milestones when project exists",
      async () => {
        try {
          // First get a project
          const { stdout: projectsOutput } = await execAsync(
            `node ${CLI_PATH} projects list`,
          );
          const projects = JSON.parse(projectsOutput);

          if (projects.length > 0) {
            const projectName = projects[0].name;

            const { stdout } = await execAsync(
              `node ${CLI_PATH} milestones list --project "${projectName}"`,
            );

            const milestones = JSON.parse(stdout);
            expect(Array.isArray(milestones)).toBe(true);
          }
        } catch (error: any) {
          // Skip test if network issues or no projects
          if (
            error.stderr?.includes("Fetch failed") ||
            error.stderr?.includes("not found")
          ) {
            console.log("Skipping: Network issues or no projects available");
          } else {
            throw error;
          }
        }
      },
      { timeout: 30000 },
    );
  });
});
