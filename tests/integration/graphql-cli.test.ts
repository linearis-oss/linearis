import { beforeAll, describe, expect, it } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Integration tests for graphql CLI command
 *
 * These tests verify the graphql command works end-to-end with the compiled CLI.
 *
 * Note: Some tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, those tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("GraphQL CLI Command", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping integration tests\n" +
          "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
      );
    }
  });

  describe("graphql --help", () => {
    it("should display help text", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} graphql --help`);

      expect(stdout).toContain("Usage: linearis graphql");
      expect(stdout).toContain("Execute a raw GraphQL query");
      expect(stdout).toContain("--file");
      expect(stdout).toContain("--vars");
    });
  });

  describe("graphql inline query", () => {
    it.skipIf(!hasApiToken)(
      "should execute inline query and return JSON",
      async () => {
        const { stdout } = await execAsync(
          `node ${CLI_PATH} graphql '{ viewer { id } }'`,
        );

        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("viewer");
        expect(result.viewer).toHaveProperty("id");
      },
    );

    it.skipIf(!hasApiToken)(
      "should return viewer details with multiple fields",
      async () => {
        const { stdout } = await execAsync(
          `node ${CLI_PATH} graphql '{ viewer { id name email } }'`,
        );

        const result = JSON.parse(stdout);
        expect(result.viewer).toHaveProperty("id");
        expect(result.viewer).toHaveProperty("name");
        expect(result.viewer).toHaveProperty("email");
      },
    );
  });

  describe("graphql --file", () => {
    it.skipIf(!hasApiToken)("should read query from file", async () => {
      const tmpFile = join(tmpdir(), `linearis-test-${Date.now()}.graphql`);
      writeFileSync(tmpFile, "{ viewer { id } }");

      try {
        const { stdout } = await execAsync(
          `node ${CLI_PATH} graphql --file ${tmpFile}`,
        );

        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("viewer");
        expect(result.viewer).toHaveProperty("id");
      } finally {
        unlinkSync(tmpFile);
      }
    });
  });

  describe("graphql --vars", () => {
    it.skipIf(!hasApiToken)(
      "should accept variables for parameterized queries",
      async () => {
        // Use a query that accepts variables but doesn't require a specific ID
        const { stdout } = await execAsync(
          `node ${CLI_PATH} graphql 'query($first: Int) { teams(first: $first) { nodes { id } } }' --vars '{"first": 1}'`,
        );

        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("teams");
        expect(result.teams).toHaveProperty("nodes");
      },
    );
  });

  describe("error handling", () => {
    it.skipIf(!hasApiToken)(
      "should return error for invalid query",
      async () => {
        try {
          await execAsync(`node ${CLI_PATH} graphql '{ invalidField }'`);
          expect.fail("Should have thrown an error");
        } catch (error: any) {
          const result = JSON.parse(error.stderr);
          expect(result).toHaveProperty("error");
          expect(result.error).toContain("Cannot query field");
        }
      },
    );

    it("should return error for invalid --vars JSON", async () => {
      // This test doesn't need API token since it fails before API call
      try {
        await execAsync(
          `node ${CLI_PATH} graphql '{ viewer { id } }' --vars 'not valid json'`,
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        const result = JSON.parse(error.stderr);
        expect(result).toHaveProperty("error");
        expect(result.error).toContain("Invalid JSON in --vars");
      }
    });
  });
});
