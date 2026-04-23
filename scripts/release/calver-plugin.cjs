const commitAnalyzer = require("@semantic-release/commit-analyzer");
const { computeCalverVersion, isMonthRollover } = require("./calver.cjs");

function mapCalverReleaseType({
  branchName,
  releaseType,
  lastVersion,
  nowIso,
}) {
  if (!releaseType) {
    return null;
  }

  if (branchName !== "main" && branchName !== "next") {
    return releaseType;
  }

  if (isMonthRollover({ lastVersion, branchName, nowIso })) {
    return "minor";
  }

  return "patch";
}

async function analyzeCommits(pluginConfig, context) {
  const releaseType = await commitAnalyzer.analyzeCommits(
    pluginConfig,
    context,
  );

  const branchName = context.branch?.name ?? "main";
  const lastVersion = context.lastRelease?.version ?? "1970.1.0";
  const nowIso = new Date().toISOString();

  const mappedReleaseType = mapCalverReleaseType({
    branchName,
    releaseType,
    lastVersion,
    nowIso,
  });

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
      `calver-plugin: semantic-release computed ${semanticVersion} but calver requires ${expectedVersion}`,
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
