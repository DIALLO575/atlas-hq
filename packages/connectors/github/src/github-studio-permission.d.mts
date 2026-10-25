export declare function readStudioCreationPermission(args: {
 workspaceId: string; installationId: number; binding: unknown;
 appId: string; privateKey: string;
 request?: typeof fetch; now?: () => number;
}): Promise<Readonly<{ status: "granted" | "missing" }>>;
