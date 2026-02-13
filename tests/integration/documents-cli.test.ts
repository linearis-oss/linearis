import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * Integration tests for documents CLI commands
 *
 * These tests verify the documents command works end-to-end with the compiled CLI.
 *
 * Note: These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 */

const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Documents CLI Commands", () => {
  beforeAll(async () => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping integration tests\n" +
          "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
      );
    }
  });

  describe("documents --help", () => {
    it("should display help text", async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} documents --help`);

      expect(stdout).toContain("Usage: linearis documents");
      expect(stdout).toContain("Document operations");
      expect(stdout).toContain("create");
      expect(stdout).toContain("update");
      expect(stdout).toContain("read");
      expect(stdout).toContain("list");
      expect(stdout).toContain("delete");
    });
  });

  describe("documents list", () => {
    it.skipIf(!hasApiToken)("should list documents without error", async () => {
      const { stdout, stderr } = await execAsync(
        `node ${CLI_PATH} documents list`,
      );

      // Should not have errors
      expect(stderr).not.toContain("error");

      // Should return valid JSON array
      const documents = JSON.parse(stdout);
      expect(Array.isArray(documents)).toBe(true);
    });

    it.skipIf(!hasApiToken)(
      "should return valid document structure when documents exist",
      async () => {
        const { stdout } = await execAsync(`node ${CLI_PATH} documents list`);
        const documents = JSON.parse(stdout);

        // If there are documents, verify structure
        if (documents.length > 0) {
          const doc = documents[0];
          expect(doc).toHaveProperty("id");
          expect(doc).toHaveProperty("title");
          expect(doc).toHaveProperty("slugId");
          expect(doc).toHaveProperty("url");
          expect(doc).toHaveProperty("createdAt");
          expect(doc).toHaveProperty("updatedAt");
        }
      },
    );
  });

  describe("documents error cases", () => {
    it.skipIf(!hasApiToken)(
      "should return error for non-existent document read",
      async () => {
        try {
          await execAsync(
            `node ${CLI_PATH} documents read nonexistent-uuid-12345`,
          );
          expect.fail("Should have thrown an error");
        } catch (error: unknown) {
          const execError = error as { stdout?: string; stderr?: string };
          const output = JSON.parse(
            execError.stdout || execError.stderr || "{}",
          );
          expect(output.error).toBeDefined();
        }
      },
    );

    it.skipIf(!hasApiToken)(
      "should return error for invalid --limit value",
      async () => {
        try {
          await execAsync(`node ${CLI_PATH} documents list --limit abc`);
          expect.fail("Should have thrown an error");
        } catch (error: unknown) {
          const execError = error as { stdout?: string; stderr?: string };
          const output = JSON.parse(
            execError.stdout || execError.stderr || "{}",
          );
          expect(output.error).toContain("Invalid limit");
        }
      },
    );

    it.skipIf(!hasApiToken)(
      "should return error for negative --limit value",
      async () => {
        try {
          await execAsync(`node ${CLI_PATH} documents list --limit -5`);
          expect.fail("Should have thrown an error");
        } catch (error: unknown) {
          const execError = error as { stdout?: string; stderr?: string };
          const output = JSON.parse(
            execError.stdout || execError.stderr || "{}",
          );
          expect(output.error).toContain("Invalid limit");
        }
      },
    );
  });

  describe("documents CRUD operations", () => {
    let createdDocumentId: string | null = null;

    it.skipIf(!hasApiToken)(
      "should create, read, update, and delete a document",
      async () => {
        // Get a team to use for document creation
        const { stdout: teamsOutput } = await execAsync(
          `node ${CLI_PATH} teams list`,
        );
        const teams = JSON.parse(teamsOutput);
        expect(teams.length).toBeGreaterThan(0);
        const teamKey = teams[0].key;

        // CREATE
        const { stdout: createOutput } = await execAsync(
          `node ${CLI_PATH} documents create --title "Test Document from Vitest" --team "${teamKey}"`,
        );
        const createdDoc = JSON.parse(createOutput);

        expect(createdDoc).toHaveProperty("id");
        expect(createdDoc.title).toBe("Test Document from Vitest");
        expect(createdDoc).toHaveProperty("url");
        createdDocumentId = createdDoc.id;

        // READ
        const { stdout: readOutput } = await execAsync(
          `node ${CLI_PATH} documents read ${createdDocumentId}`,
        );
        const readDoc = JSON.parse(readOutput);

        expect(readDoc.id).toBe(createdDocumentId);
        expect(readDoc.title).toBe("Test Document from Vitest");

        // UPDATE
        const { stdout: updateOutput } = await execAsync(
          `node ${CLI_PATH} documents update ${createdDocumentId} --title "Updated Test Document"`,
        );
        const updatedDoc = JSON.parse(updateOutput);

        expect(updatedDoc.id).toBe(createdDocumentId);
        expect(updatedDoc.title).toBe("Updated Test Document");

        // DELETE (trash)
        const { stdout: deleteOutput } = await execAsync(
          `node ${CLI_PATH} documents delete ${createdDocumentId}`,
        );
        const deleteResult = JSON.parse(deleteOutput);

        expect(deleteResult.success).toBe(true);

        // Verify document is trashed
        const { stdout: verifyOutput } = await execAsync(
          `node ${CLI_PATH} documents read ${createdDocumentId}`,
        );
        const trashedDoc = JSON.parse(verifyOutput);
        expect(trashedDoc.trashed).toBe(true);
      },
    );
  });
});
