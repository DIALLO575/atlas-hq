export interface GitHubActionsRun {
  id: number; name: string; title: string; status: string; conclusion: string | null;
  attempt: number; branch: string; sha: string | null; event: string;
  createdAt: string | null; updatedAt: string | null; url: string;
}
export interface GitHubActionsJob {
  id: number; name: string; status: string; conclusion: string | null;
  startedAt: string | null; completedAt: string | null; url: string;
  failedSteps: Array<{ number: number | null; name: string; conclusion: string | null }>;
}
export declare function createGitHubActionsReader(args: {
  installationId: number; repositoryId: number; appId: string; privateKey: string;
  request?: typeof fetch; now?: () => number;
}): Promise<{
  listRuns(): Promise<{ repository: {id:number;fullName:string}; runs:GitHubActionsRun[];truncated:boolean }>;
  listJobs(runId:number): Promise<{run:GitHubActionsRun;jobs:GitHubActionsJob[];truncated:boolean}>;
}>;
