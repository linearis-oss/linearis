module.exports = {
  repositoryUrl:
    process.env.SEMANTIC_RELEASE_REPOSITORY_URL ??
    "git@github.com:linearis-oss/linearis.git",
  branches: ["main", { name: "next", prerelease: "next" }],
  tagFormat: `v\${version}`,
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
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
