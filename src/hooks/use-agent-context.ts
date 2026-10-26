"use client";
import { useMemo } from "react";
import type { AtlasEntity, AtlasPageContext } from "@/lib/agent-gateway/context";

/** Browser context is always revalidated from workspace membership and DB settings. */
export function useAgentContext(props: {
  workspaceId: string; pageKey: string; entity: AtlasEntity | "*"; objectId: string | null;
}): AtlasPageContext {
  const { workspaceId,pageKey,entity,objectId } = props;
  return useMemo(() => ({
    workspaceId, pageKey, entity,
    objectType: objectId ? "mission" as const : "page" as const, objectId,
  }), [workspaceId,pageKey,entity,objectId]);
}
