const { computeCalverVersion } = require("./calver.cjs");

module.exports = {
  verifyRelease: async (_, context) => {
    const lastVersion = context.lastRelease?.version ?? "1970.1.0";
    const branchName = context.branch?.name ?? "main";

    const nextVersion = computeCalverVersion({
      lastVersion,
      branchName,
      nowIso: new Date().toISOString(),
    });

    context.logger.log(
      `calver-plugin: forcing next release version to ${nextVersion}`,
    );
    context.nextRelease.version = nextVersion;
  },
};
