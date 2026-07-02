import { execFileSync } from "node:child_process";

// WHY THIS EXISTS — do not remove the CI guard.
//
// npm runs the `prepare` lifecycle script on every `npm ci` / `npm install`.
// Our `generate` step (graphql-codegen) introspects the LIVE Linear schema at
// https://api.linear.app/graphql (see codegen.config.ts). If `prepare` ran in
// CI, every job's `npm ci` — roughly eight installs per pipeline run — would
// make a network call to Linear's API, coupling build/test/release reliability
// to Linear's uptime and adding latency plus flakiness. `lefthook install`
// (local git hooks) is also pointless inside CI.
//
// So: skip both when running in CI. Every CI job that actually needs the
// generated types runs `npm run build` explicitly (its `prebuild` runs
// `generate`) or `npm pack` (whose `prepack` builds) — codegen still happens
// where it's needed, just not on install. Locally (no CI env var) `prepare`
// behaves normally: generate types + install git hooks. GitHub Actions sets
// CI=true automatically, as do most other CI providers.
if (process.env.CI) {
  console.log(
    "CI detected — skipping generate + lefthook install (see scripts/prepare.mjs)",
  );
  process.exit(0);
}

// `shell: true` so npm/npx resolve on Windows, where they are `.cmd` shims
// that cannot be launched without a shell.
execFileSync("npm", ["run", "generate"], { stdio: "inherit", shell: true });
execFileSync("npx", ["lefthook", "install"], { stdio: "inherit", shell: true });
