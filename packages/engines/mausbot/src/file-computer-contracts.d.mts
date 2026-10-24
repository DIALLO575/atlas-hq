export const COMPUTER_METADATA_READS:readonly string[];
export const COMPUTER_MUTATION_PLANS:readonly string[];
export const FILE_TRANSFER_PLANS:readonly string[];
export class FileComputerContractError extends Error { readonly code:string;readonly status:number;constructor(code:string); }
export function planFileComputerRead(name:string,input?:Record<string,unknown>):Readonly<Record<string,unknown>>;
export function executeFileComputerRead(config:{baseUrl:string;token:string},name:string,
 input?:Record<string,unknown>,deps?:{fetchImpl?:typeof fetch}):Promise<Record<string,unknown>>;
export function planFileComputerMutation(name:string,input?:Record<string,unknown>):Readonly<Record<string,unknown>>;
export function planMausbotFileTransfer(name:string,input?:Record<string,unknown>):Readonly<Record<string,unknown>>;
