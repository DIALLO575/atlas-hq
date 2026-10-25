export declare function issueStudioApprovalReceipt(args: {
 draft: unknown; actorId: string; idempotencyKey: string; secret: string; now?: number;
}): Readonly<{receipt: string; expiresAt: number}>;
export declare function checkStudioApprovalReceipt(args: {
 receipt?: string; draft: unknown; actorId: string; idempotencyKey: string; secret: string; now?: number;
}): boolean;
