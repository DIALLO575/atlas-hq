export declare function studioActivationMode(env: Record<string,string|undefined>): "production"|"sandbox"|null;
export declare function studioAllowedBinding(mode:"production"|"sandbox", workspaceId:string, installationId:number,
 env:Record<string,string|undefined>): boolean;
