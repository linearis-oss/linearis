import fs from "node:fs";
import path from "node:path";
import { ensureTokenDir, getTokenDir } from "./token-storage.js";

/**
 * Passive "update available" notifier, run inline before every command.
 *
 * Design constraints (Linearis emits JSON on stdout for agents):
 * - The hint is written to **stderr only**, never stdout, so it can never
 *   corrupt the JSON contract that agents parse.
 * - It is shown only on interactive runs (`process.stdout.isTTY`). Agents and
 *   scripts pipe stdout, so they are never nagged and make no network calls.
 * - The registry lookup is cached on disk; only a stale cache (older than
 *   CHECK_INTERVAL_MS) triggers a network call, so the common path is instant.
 * - Every operation fails silently; a version check must never affect a command.
 */

const CACHE_FILE = "update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const NPM_DIST_TAGS_URL =
  "https://registry.npmjs.org/-/package/linearis/dist-tags";
const FETCH_TIMEOUT_MS = 3000;

export type Channel = "latest" | "next";

export interface UpdateCacheData {
  channel: Channel;
  latest: string;
  checkedAt: number;
}

/** "next" when the installed version carries a `-next` prerelease, else "latest". */
export function channelFor(version: string): Channel {
  return /-next\b/.test(version) ? "next" : "latest";
}

function cachePath(): string {
  return path.join(getTokenDir(), CACHE_FILE);
}

/** Read the last cached registry lookup, or null if missing/corrupt. */
export function readCache(): UpdateCacheData | null {
  try {
    const data = JSON.parse(fs.readFileSync(cachePath(), "utf8")) as
      | UpdateCacheData
      | undefined;
    if (
      data &&
      typeof data.latest === "string" &&
      typeof data.checkedAt === "number" &&
      (data.channel === "latest" || data.channel === "next")
    ) {
      return data;
    }
  } catch {
    // missing or corrupt cache — treat as absent
  }
  return null;
}

/** Persist a registry lookup for the next invocation to read. */
export function writeCache(data: UpdateCacheData): void {
  ensureTokenDir();
  fs.writeFileSync(cachePath(), JSON.stringify(data), "utf8");
}

/**
 * Compare two versions of the form `YYYY.M.P` with an optional `-tag.N`
 * prerelease suffix. Returns >0 if `a` > `b`, <0 if `a` < `b`, 0 if equal.
 * A release (no prerelease) outranks a prerelease sharing the same core.
 */
export function compareVersions(a: string, b: string): number {
  const [coreA = "", preA = ""] = a.split("-");
  const [coreB = "", preB = ""] = b.split("-");
  const numsA = coreA.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const numsB = coreB.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(numsA.length, numsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (numsA[i] ?? 0) - (numsB[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  if (preA === preB) return 0;
  if (preA === "") return 1; // a is a release, b a prerelease of same core
  if (preB === "") return -1;
  return comparePrerelease(preA, preB);
}

function comparePrerelease(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1; // shorter prerelease sorts lower
    if (y === undefined) return 1;
    const nx = Number.parseInt(x, 10);
    const ny = Number.parseInt(y, 10);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return Math.sign(nx - ny);
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/** Respect the de-facto `NO_UPDATE_NOTIFIER`, a project escape hatch, and CI. */
export function updateChecksDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env["NO_UPDATE_NOTIFIER"] || env["LINEARIS_NO_UPDATE_CHECK"] || env["CI"],
  );
}

/** The one-line stderr hint shown when an update is available. */
export function formatUpdateNotice(
  current: string,
  latest: string,
  channel: Channel,
): string {
  const tag = channel === "next" ? "@next" : "@latest";
  return [
    `▲ linearis update available: ${current} → ${latest}`,
    `  run: npm install -g linearis${tag}`,
    "  silence: set NO_UPDATE_NOTIFIER=1",
  ].join("\n");
}

/** Query the npm registry for the newest version on a dist-tag channel. */
export async function fetchLatestVersion(
  channel: Channel,
): Promise<string | null> {
  try {
    const res = await fetch(NPM_DIST_TAGS_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const tags = (await res.json()) as Record<string, string>;
    const version = tags[channel];
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * On interactive runs, print a one-line hint to stderr when a newer version is
 * available. Reads from the on-disk cache; refreshes it inline only when stale.
 * Never blocks agents/scripts, never throws.
 */
export async function maybeNotifyUpdate(currentVersion: string): Promise<void> {
  try {
    // Agents/scripts consume stdout non-interactively — never nag them, and
    // never make a network call on their behalf.
    if (!process.stdout.isTTY) return;
    if (updateChecksDisabled()) return;

    const channel = channelFor(currentVersion);
    let cache = readCache();
    const stale =
      !cache ||
      cache.channel !== channel ||
      Date.now() - cache.checkedAt > CHECK_INTERVAL_MS;
    if (stale) {
      const latest = await fetchLatestVersion(channel);
      // Advance checkedAt even when the lookup fails so a failed check backs
      // off for CHECK_INTERVAL_MS instead of re-fetching on every command.
      // Carry the prior latest when the registry is unreachable, falling back
      // to the current version (which never triggers a notice) when there is
      // no prior cache to reuse.
      const resolvedLatest =
        latest ?? (cache?.channel === channel ? cache.latest : currentVersion);
      cache = { channel, latest: resolvedLatest, checkedAt: Date.now() };
      writeCache(cache);
    }

    if (
      cache &&
      cache.channel === channel &&
      isNewer(cache.latest, currentVersion)
    ) {
      process.stderr.write(
        `${formatUpdateNotice(currentVersion, cache.latest, channel)}\n`,
      );
    }
  } catch {
    // Update checks must never affect the command outcome.
  }
}
