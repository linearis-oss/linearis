const MAIN_VERSION_RE = /^(\d{4})\.(\d{1,2})\.(\d+)$/;
const NEXT_VERSION_RE = /^(\d{4})\.(\d{1,2})\.(\d+)-next\.(\d+)$/;

function getUtcYearMonth(nowIso) {
  const now = new Date(nowIso ?? new Date().toISOString());
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function parseLastVersion(lastVersion, branchName) {
  if (branchName === "next") {
    const nextMatch = NEXT_VERSION_RE.exec(lastVersion);
    if (nextMatch) {
      return {
        year: Number(nextMatch[1]),
        month: Number(nextMatch[2]),
        patch: Number(nextMatch[3]),
        nextCounter: Number(nextMatch[4]),
        fromPrerelease: true,
      };
    }
  }

  const mainMatch = MAIN_VERSION_RE.exec(
    lastVersion.replace(/-next\.\d+$/, ""),
  );
  if (!mainMatch) {
    throw new Error(`Invalid lastVersion format: ${lastVersion}`);
  }

  return {
    year: Number(mainMatch[1]),
    month: Number(mainMatch[2]),
    patch: Number(mainMatch[3]),
    nextCounter: 0,
    fromPrerelease: false,
  };
}

function computeCalverVersion({ lastVersion, branchName, nowIso }) {
  const now = getUtcYearMonth(nowIso);
  const last = parseLastVersion(lastVersion, branchName);

  const sameMonth = last.year === now.year && last.month === now.month;

  if (branchName === "next") {
    if (!sameMonth) {
      return `${now.year}.${now.month}.1-next.1`;
    }

    const patch = last.fromPrerelease ? last.patch : last.patch + 1;
    const counter = last.fromPrerelease ? last.nextCounter + 1 : 1;
    return `${now.year}.${now.month}.${patch}-next.${counter}`;
  }

  const patch = sameMonth ? last.patch + 1 : 1;
  return `${now.year}.${now.month}.${patch}`;
}

module.exports = {
  computeCalverVersion,
};
