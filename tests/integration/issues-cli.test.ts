/**
 * Integration tests for issues CLI commands
 *
 * These tests require LINEAR_API_TOKEN to be set in environment.
 * If not set, tests will be skipped.
 *
 * NOTE: These tests document expected behavior but are skipped by default
 * to avoid creating test data in production Linear workspaces.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { describe, it } from "vitest";

const _execAsync = promisify(exec);
const _CLI_PATH = "dist/main.js";
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

if (!hasApiToken) {
  console.warn(
    "\n⚠️  LINEAR_API_TOKEN not set - skipping issues integration tests\n" +
      "   To run these tests, set LINEAR_API_TOKEN in your environment\n",
  );
}

describe("Issues CLI - Milestone Resolution", () => {
  it.skip("should resolve milestone name to issue's current project when updating", async () => {
    // This test documents the expected behavior for ZCO-1578
    // When a user updates an issue with --project-milestone "name",
    // the system should:
    // 1. First check if --project is provided, use that project's milestone
    // 2. If no --project, check the issue's current project for the milestone
    // 3. Only fall back to global search if not found in either

    // Example scenario:
    // - Project A has milestone "2025.11.2"
    // - Project B has milestone "2025.11.2"
    // - Issue ZCO-1569 is in Project A
    // - Command: issues update ZCO-1569 --project-milestone "2025.11.2"
    // - Expected: Uses milestone from Project A (not Project B)

    if (!hasApiToken) return;

    // This would require:
    // 1. Finding or creating two projects with same milestone name
    // 2. Creating an issue in one project
    // 3. Attempting to set milestone by name
    // 4. Verifying correct project's milestone was used

    // Skipped to avoid creating test data in production workspace
  });

  it.skip("should use specified project's milestone when --project is provided", async () => {
    // This test documents that explicit --project should take precedence
    // Command: issues update ZCO-1569 --project "Project B" --project-milestone "2025.11.2"
    // Expected: Uses milestone from Project B (even if issue is in Project A)

    if (!hasApiToken) return;

    // Skipped to avoid creating test data in production workspace
  });
});
