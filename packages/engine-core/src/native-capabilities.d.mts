export type NativeCapability = Readonly<{id:string;method:"GET"|"POST"|"PATCH"|"PUT"|"DELETE";route:string;source:string;policy:string;family:string;sourceKind:string;implementation:"contract-only";hostTested:false;callable:false;secretPolicy:string}>;
export const MAUSBOT_SOURCE_REVISION:string;
export const MAUSBOT_NATIVE_CAPABILITIES:readonly NativeCapability[];
export const MAUSBOT_NATIVE_FAMILIES:readonly string[];
export function nativePrimitive(id:string):NativeCapability|null;
export function planNativePrimitive(id:string,identifiers?:Record<string,unknown>):Readonly<{id:string;transport:"http";method:string;path:string;permission:string;callable:false;implementation:"contract-only"}>;
export function nativeCoverageSummary():{sourceRevision:string;total:number;byFamily:Record<string,number>;testedLive:number;callable:number;restricted:number};
