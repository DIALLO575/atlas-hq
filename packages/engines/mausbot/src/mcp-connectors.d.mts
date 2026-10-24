export const MAUSBOT_MCP_SURFACES: readonly {id:string;transport:string;exposure:string;status:string}[];
export const MCP_CONNECTOR_READS: readonly string[];
export const MCP_CONNECTOR_MUTATION_PLANS: readonly string[];
export class McpConnectorInputError extends Error { readonly code:string; readonly status:number;constructor(code:string); }
export function planMcpConnectorRead(name:string):
 Readonly<{primitive:string;path:string;method:"GET";projection:"metadata-only";callable:false;hostTested:false;released:false}>;
export function executeMcpConnectorRead(config:{baseUrl:string;token:string},
 name:string,deps?:{fetchImpl?:typeof fetch}):Promise<Record<string,unknown>>;
export function planMcpConnectorMutation(name:string,input?:Record<string,unknown>):
 Readonly<{primitive:string;method:string;path:string;body?:Readonly<Record<string,unknown>>;
 requiresHumanApproval:true;requiresWorkspaceAuthorization:true;requiresRealActorSession:true;
 requiresDurableAudit:true;requiresRuntimePolicyCheck:true;retryPolicy:"never-automatic";
 rawOAuthOrKeyAllowed:false;callable:false;released:false;hostTested:false}>;
