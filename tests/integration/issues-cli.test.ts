import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);
const CLI_PATH = "./dist/main.js";
const hasApiToken = !!process.env["LINEAR_API_TOKEN"];

interface CliResult {
  stdout: string;
  stderr: string;
}

async function runCli(command: string): Promise<CliResult> {
  const { stdout, stderr } = await execAsync(`node ${CLI_PATH} ${command}`);
  return { stdout, stderr };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

describe("Issues CLI lifecycle", () => {
  beforeAll(() => {
    if (!hasApiToken) {
      console.warn(
        "\n⚠️  LINEAR_API_TOKEN not set - skipping issues lifecycle integration tests\n",
      );
    }
  });

  it("shows lifecycle subcommands in issues help", async () => {
    const { stdout } = await runCli("issues --help");

    expect(stdout).toContain("archive");
    expect(stdout).toContain("unarchive");
    expect(stdout).toContain("delete");
  });

  it.skipIf(!hasApiToken)(
    "creates temporary issue and runs archive/unarchive/delete lifecycle",
    { timeout: 90000 },
    async () => {
      const teamsResult = await runCli("teams list --limit 1");
      const teams = parseJson<{ nodes: Array<{ key: string }> }>(
        teamsResult.stdout,
      );

      expect(teams.nodes.length).toBeGreaterThan(0);
      const teamKey = teams.nodes[0]?.key;

      const title = `issue-lifecycle-e2e-${Date.now()}`;
      const createdResult = await runCli(
        `issues create "${title}" --team ${teamKey}`,
      );
      const createdIssue = parseJson<{ id: string; identifier: string }>(
        createdResult.stdout,
      );

      expect(createdIssue.id).toBeTruthy();
      expect(createdIssue.identifier).toMatch(
        new RegExp(`^${teamKey}-\\d+$`, "i"),
      );

      const archivedResult = await runCli(
        `issues archive ${createdIssue.identifier}`,
      );
      const archivedIssue = parseJson<{
        id: string;
        archivedAt?: string | null;
      }>(archivedResult.stdout);

      expect(archivedIssue.id).toBe(createdIssue.id);

      const unarchivedResult = await runCli(
        `issues unarchive ${createdIssue.id}`,
      );
      const unarchivedIssue = parseJson<{
        id: string;
        archivedAt?: string | null;
      }>(unarchivedResult.stdout);

      expect(unarchivedIssue.id).toBe(createdIssue.id);

      const deletedResult = await runCli(
        `issues delete ${createdIssue.identifier}`,
      );
      const deletedPayload = parseJson<{ id: string; success: boolean }>(
        deletedResult.stdout,
      );

      expect(deletedPayload).toEqual({ id: createdIssue.id, success: true });
    },
  );
});
