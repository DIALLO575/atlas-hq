export const NATIVE_MUTATION_PLANS: readonly string[];
export function planMausbotNativeMutation(name: string, input: Record<string,unknown>): Readonly<{
primitive:string;method:string;path:string;body:Readonly<Record<string,unknown>>;
requiresHumanApproval:true;requiresDurableAudit:true;requiresOwnerOrAdmin:true;
retryPolicy:"never-auto"|"manual-with-revalidation";callable:false;hostTested:false;released:false;
sensitivity:"contains-potentially-private-input"}>;
