export interface MapCalverReleaseTypeInput {
  branchName: string;
  releaseType: string | null;
  lastVersion: string;
  nowIso?: string;
}

export interface AnalyzeCommitsContext {
  branch?: { name?: string };
  lastRelease?: { version?: string };
  logger: { log(message: string): void };
  nextRelease?: { version?: string };
}

export declare function mapCalverReleaseType(
  input: MapCalverReleaseTypeInput,
): string | null;

export declare function analyzeCommits(
  pluginConfig: unknown,
  context: AnalyzeCommitsContext,
): Promise<string | null>;

export declare function verifyRelease(
  pluginConfig: unknown,
  context: AnalyzeCommitsContext,
): Promise<void>;
