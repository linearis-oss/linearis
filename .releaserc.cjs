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
        // Two stages so a failed publish fails the release: clean-publish
        // swallows exit codes, so it only stages .clean-pkg (--without-publish)
        // and the real `npm publish` runs separately and can propagate failure.
        publishCmd: [
          "set -e",
          "npx clean-publish --without-publish --temp-dir .clean-pkg",
          'VERSION="$(node -p "require(\'./.clean-pkg/package.json\').version")"',
          'TAG="$([ "$GITHUB_REF_NAME" = next ] && echo next || echo latest)"',
          'npm publish ./.clean-pkg --provenance --access public --tag "$TAG"',
          // Read-back guard: fail if the version is not visible on the
          // registry (the outage was a publish that "succeeded" but published
          // nothing); retry for read-after-write lag.
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
