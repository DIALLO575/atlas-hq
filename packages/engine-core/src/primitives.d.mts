export type MausbotPrimitiveMode = "read" | "write" | "execute";
export type MausbotPrimitive = {
 readonly id: string; readonly tool: string; readonly mode: MausbotPrimitiveMode;
 readonly transport: "http"; readonly hostTested: boolean;
 readonly required: readonly string[]; readonly fields: Readonly<Record<string,string>>;
};
export const MAUSBOT_PRIMITIVES: readonly MausbotPrimitive[];
export const MAUSBOT_PRIMITIVE_NAMES: readonly string[];
export const MAUSBOT_FUTURE_SURFACES: readonly { id: string; transport: string; status: string }[];
export class PrimitiveInputError extends Error { readonly code: string; readonly status: number; constructor(code: string); }
export function getMausbotPrimitive(id: unknown): MausbotPrimitive | null;
export function validateMausbotPrimitive(id: unknown, input: unknown): { def: MausbotPrimitive; args: Readonly<Record<string,any>> };
