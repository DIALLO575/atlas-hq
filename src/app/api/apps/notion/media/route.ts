import { NextRequest, NextResponse } from "next/server";
import { createNotionReadClient, NotionReadError }
  from "../../../../../../packages/connectors/notion/src/rest-client.mjs";
import { notionHostedMediaSource, fetchNotionHostedMedia, NotionMediaError }
  from "../../../../../../packages/connectors/notion/src/media-delivery.mjs";
import { NotionRefreshError }
  from "../../../../../../packages/connectors/notion/src/refresh-token.mjs";
import { loadNotionPersonalConnection, NotionConnectionAccessError,
  refreshNotionPersonalConnection } from "@/lib/notion/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Cache-Control": "private, no-store",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "sandbox",
};
const denied = (status: number) => NextResponse.json(
  { error: "notion-media-unavailable" }, { status, headers });

/**
 * Image/PDF/file/audio/video proxy: caller may supply only scoped UUIDs,
 * NEVER a provider URL. Refresh the exact block on every media request;
 * no persistent signed URL, provider bearer, or raw block in browser JSON.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId=params.get("workspaceId")??"";
  const connectionId=params.get("connectionId")??"";
  const blockId=params.get("blockId")??"";
  if(![workspaceId,connectionId,blockId].every(x=>UUID.test(x)) ||
     params.has("url") || params.has("src")) return denied(400);
  try {
    const loaded=await loadNotionPersonalConnection({workspaceId,connectionId});
    let block: Record<string,unknown>;
    try {block=await loaded.client.getBlock(blockId);}
    catch(error) {
      if(!(error instanceof NotionReadError) || error.code!=="AUTH_REQUIRED")
        throw error;
      const refreshed=await refreshNotionPersonalConnection(loaded);
      const client=createNotionReadClient({
        token:refreshed.accessToken,
        requestBudget:loaded.budgetForVersion(refreshed.version),
      });
      block=await client.getBlock(blockId);
    }
    const source=notionHostedMediaSource(block);
    const asset=await fetchNotionHostedMedia(source);
    return new NextResponse(new Uint8Array(asset.bytes).buffer,{status:200,
      headers:{
        ...headers,
        "Content-Type":asset.mime,
        "Content-Length":String(asset.bytes.length),
        "Content-Disposition":asset.disposition+'; filename="notion-media'+(
          asset.mime==="application/pdf"?".pdf":
          asset.mime==="image/jpeg"?".jpg":
          asset.mime==="image/png"?".png":
          asset.mime==="video/mp4"?".mp4":
          asset.mime==="audio/mpeg"?".mp3":""
        )+'"',
      }});
  } catch(error) {
    if(error instanceof NotionConnectionAccessError) {
      if(error.code==="INVALID_REQUEST")return denied(400);
      if(error.code==="FORBIDDEN")return denied(403);
      if(error.code==="NOT_FOUND")return denied(404);
      return denied(error.code==="REFRESH_IN_PROGRESS"?409:503);
    }
    if(error instanceof NotionRefreshError)
      return denied(error.code==="REFRESH_BUSY"?409:503);
    if(error instanceof NotionReadError)
      return denied(error.code==="PERMISSION_DENIED"?403:
        error.code==="NOT_FOUND_OR_HIDDEN"?404:
        error.code==="AUTH_REQUIRED"?409:
        error.code==="RATE_LIMITED"?429:503);
    if(error instanceof NotionMediaError)
      return denied(error.code==="MEDIA_TOO_LARGE"?413:
        error.code==="NOT_AVAILABLE"?404:
        error.code==="INVALID_REQUEST"?400:502);
    return denied(503);
  }
}
