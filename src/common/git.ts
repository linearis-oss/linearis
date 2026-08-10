import { execFileSync } from "node:child_process";
import { invalidParameterError } from "./errors.js";

/**
 * Reads the checked-out branch name.
 *
 * Uses `execFileSync` rather than `exec` so nothing reaches a shell. Both a
 * missing/failing `git` and a detached HEAD surface as the same actionable
 * error, because from the caller's point of view they are the same situation:
 * there is no branch to infer, so name one explicitly.
 *
 * @throws Error if the current directory has no checked-out branch
 */
export function getCurrentBranch(): string {
  let branch: string;

  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw invalidParameterError(
      "branch",
      "could not be read from git — pass a branch name explicitly",
    );
  }

  // `rev-parse --abbrev-ref HEAD` prints "HEAD" when the checkout is detached.
  if (branch === "" || branch === "HEAD") {
    throw invalidParameterError(
      "branch",
      "is not available (detached HEAD) — pass a branch name explicitly",
    );
  }

  return branch;
}
