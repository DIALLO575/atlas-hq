export type GitHubActionsTarget={repositoryId:number;installationId:number;runId:number;jobId:number;attempt:number;sha:string;fullName:string;runName:string;jobName:string};
export declare function createGitHubActionsWriter(args:{installationId:number;repositoryId:number;appId:string;privateKey:string;request?:typeof fetch;now?:()=>number;}):Promise<{
 verifyFailedJob(input:{runId:number;jobId:number;attempt:number;sha:string;}):Promise<GitHubActionsTarget>;
 dispatchJob(target:GitHubActionsTarget):Promise<{accepted:true;jobId:number;runId:number}>;
}>;
