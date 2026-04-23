const commitAnalyzer = require("@semantic-release/commit-analyzer");
const { computeCalverVersion } = require("./calver.cjs");

function mapCalverReleaseType(branchName, releaseType) {
  if (!releaseType) {
    return null;
  }

  if (branchName === "main" || branchName === "next") {
    return "patch";
  }

  return releaseType;
}

async function analyzeCommits(pluginConfig, context) {
  const releaseType = await commitAnalyzer.analyzeCommits(
    pluginConfig,
    context,
  );
  const branchName = context.branch?.name ?? "main";

  const mappedReleaseType = mapCalverReleaseType(branchName, releaseType);

  if (releaseType !== mappedReleaseType) {
    context.logger.log(
      `calver-plugin: mapped release type ${releaseType} -> ${mappedReleaseType} on ${branchName}`,
    );
  }

  return mappedReleaseType;
}

async function verifyRelease(_, context) {
  const lastVersion = context.lastRelease?.version ?? "1970.1.0";
  const branchName = context.branch?.name ?? "main";
  const semanticVersion = context.nextRelease?.version;

  if (!semanticVersion) {
    throw new Error("calver-plugin: missing context.nextRelease.version");
  }

  const expectedVersion = computeCalverVersion({
    lastVersion,
    branchName,
    nowIso: new Date().toISOString(),
  });

  if (semanticVersion !== expectedVersion) {
    throw new Error(
      `calver-plugin: semantic-release computed ${semanticVersion} but calver requires ${expectedVersion}. ` +
        "Current semantic-release version model cannot represent this calver transition.",
    );
  }

  context.logger.log(
    `calver-plugin: verified semantic-release version ${semanticVersion}`,
  );
}

module.exports = {
  analyzeCommits,
  mapCalverReleaseType,
  verifyRelease,
};
