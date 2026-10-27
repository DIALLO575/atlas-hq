export declare const TUS_CHUNK_BYTES: number;
export declare function signedTusEndpoint(projectUrl: string): string;
export declare function uploadSignedResumable(options: {
  projectUrl: string;
  publishableKey: string;
  path: string;
  token: string;
  file: Blob;
  onProgress?: (percent: number) => void;
  request?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}): Promise<boolean>;
