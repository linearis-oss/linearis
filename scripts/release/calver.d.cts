export interface ComputeCalverVersionInput {
  lastVersion: string;
  branchName: string;
  nowIso?: string;
}

export declare function computeCalverVersion(
  input: ComputeCalverVersionInput,
): string;

export declare function isMonthRollover(
  input: ComputeCalverVersionInput,
): boolean;
