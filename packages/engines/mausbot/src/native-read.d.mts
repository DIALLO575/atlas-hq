export const NATIVE_METADATA_READS: readonly string[];
export class NativePrimitiveInputError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string);
}
export function planMausbotNativeRead(name: string, input?: Record<string,unknown>):
 Readonly<{primitive:string;method:"GET";path:string;mode:"metadata-only";hostTested:false;released:false}>;
export function executeMausbotNativeRead(config: {baseUrl:string;token:string},name:string,
 input?:Record<string,unknown>, deps?:{fetchImpl?:typeof fetch}):Promise<Record<string,unknown>>;
