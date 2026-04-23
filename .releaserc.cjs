module.exports = {
  repositoryUrl:
    process.env.SEMANTIC_RELEASE_REPOSITORY_URL ??
    "git@github.com:linearis-oss/linearis.git",
  branches: ["main", { name: "next", prerelease: "next" }],
  tagFormat: `v\${version}`,
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          // Calver plugin controls final version string.
          // major/minor/patch here only control releasability/prioritization.
          { breaking: true, release: "major" },
          { revert: true, release: "patch" },
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
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
    "./scripts/release/calver-plugin.cjs",
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: false, pkgRoot: "." }],
    [
      "@semantic-release/exec",
      {
        publishCmd:
          'npx clean-publish --access public --tag $( [ "$GITHUB_REF_NAME" = "next" ] && echo next || echo latest ) -- --provenance',
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
