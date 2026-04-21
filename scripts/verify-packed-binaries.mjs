import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

async function run(command, args, cwd) {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      cwd,
      env: process.env,
      shell: false,
    });

    if (stdout) {
      process.stdout.write(stdout);
    }

    if (stderr) {
      process.stderr.write(stderr);
    }

    return { stdout, stderr };
  } catch (error) {
    const err = error;

    if (typeof err?.stdout === "string" && err.stdout.length > 0) {
      process.stdout.write(err.stdout);
    }

    if (typeof err?.stderr === "string" && err.stderr.length > 0) {
      process.stderr.write(err.stderr);
    }

    throw new Error(
      `Command failed: ${command} ${args.join(" ")} (exit code ${String(err?.code ?? "unknown")})`,
    );
  }
}

async function main() {
  const repoRoot = process.cwd();
  let tempProject;
  let tarballPath;

  try {
    const packed = await run("npm", ["pack", "--json"], repoRoot);
    const jsonStart =
      packed.stdout.lastIndexOf("\n[") >= 0
        ? packed.stdout.lastIndexOf("\n[") + 1
        : packed.stdout.indexOf("[");

    if (jsonStart < 0) {
      throw new Error("npm pack output did not contain JSON metadata");
    }

    const packMeta = JSON.parse(packed.stdout.slice(jsonStart).trim());

    if (!Array.isArray(packMeta) || packMeta.length === 0) {
      throw new Error("npm pack returned no metadata");
    }

    const firstEntry = packMeta[0];
    if (
      !firstEntry ||
      typeof firstEntry.filename !== "string" ||
      firstEntry.filename.length === 0
    ) {
      throw new Error("npm pack did not return tarball filename");
    }

    tarballPath = join(repoRoot, firstEntry.filename);
    tempProject = await mkdtemp(join(tmpdir(), "linearis-pack-verify-"));

    await run("npm", ["init", "-y"], tempProject);
    await run("npm", ["install", tarballPath], tempProject);
    await run("npx", ["--no-install", "linearis", "usage"], tempProject);
    await run("npx", ["--no-install", "linear", "usage"], tempProject);

    console.log("✅ Packed artifact exposes both binaries: linearis + linear");
  } finally {
    if (tempProject) {
      await rm(tempProject, { recursive: true, force: true });
    }

    if (tarballPath) {
      await rm(tarballPath, { force: true });
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Binary verification failed: ${message}`);
  process.exit(1);
});
