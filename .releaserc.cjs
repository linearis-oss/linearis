module.exports = {
  repositoryUrl:
    process.env.SEMANTIC_RELEASE_REPOSITORY_URL ??
    "git@github.com:linearis-oss/linearis.git",
  branches: ["main", { name: "next", prerelease: "next" }],
  tagFormat: `v\${version}`,
  plugins: [
    [
      "./scripts/release/calver-plugin.cjs",
      {
        preset: "conventionalcommits",
        releaseRules: [
          // Suppress non-deliverable commits.
          // Releasable commits (feat/fix/perf/revert/breaking) still trigger release,
          // then calver-plugin maps analyzer output to patch cadence.
          { type: "refactor", release: false },
          { type: "chore", release: false },
          { type: "ci", release: false },
          { type: "docs", release: false },
          { type: "style", release: false },
          { type: "test", release: false },
          { type: "build", release: false },
          { scope: "ci", release: false },
          { scope: "release", release: false },
          { scope: "workflow", release: false },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: false, pkgRoot: "." }],
    [
      "@semantic-release/exec",
      {
        // Publish in two explicit stages so a failed `npm publish` FAILS the
        // release. `clean-publish --without-publish` only strips the configured
        // package.json fields into a deterministic `.clean-pkg` dir (it swallows
        // exit codes, so it must NOT own the publish); the real `npm publish`
        // then runs directly, and its non-zero exit propagates to this plugin.
        // Auth is npm OIDC trusted publishing (no NODE_AUTH_TOKEN in CI).
        // Runs under `/bin/sh -c` (POSIX) via @semantic-release/exec shell:true.
        publishCmd: [
          "set -e",
          "npx clean-publish --without-publish --temp-dir .clean-pkg",
          'VERSION="$(node -p "require(\'./.clean-pkg/package.json\').version")"',
          'TAG="$([ "$GITHUB_REF_NAME" = next ] && echo next || echo latest)"',
          'npm publish ./.clean-pkg --provenance --access public --tag "$TAG"',
          // Read-back guard: the original outage was a publish that "succeeded"
          // while nothing reached the registry. Fail loudly if the version is
          // not actually visible (retry for read-after-write lag).
          "for i in $(seq 1 6); do",
          '  if npm view "linearis@$VERSION" version; then FOUND=1; break; fi',
          '  echo "waiting for registry to reflect $VERSION ($i/6)"; sleep 5',
          "done",
          '[ "$FOUND" = 1 ] || { echo "publish verification failed: linearis@$VERSION not on registry"; exit 1; }',
          "rm -rf .clean-pkg",
        ].join("\n"),
      },
    ],
    ["@semantic-release/github", { successComment: false, failComment: false }],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "package-lock.json", "CHANGELOG.md"],
        message: `chore(release): \${nextRelease.version} [skip ci]\n\n\${nextRelease.notes}`,
      },
    ],
  ],
};
