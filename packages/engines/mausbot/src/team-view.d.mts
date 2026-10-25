import type { MausbotConfig } from "./adapter.mjs";
export declare const MAUSBOT_TEAM_VIEW_ID: RegExp;
export declare const MAUSBOT_TEAM_VIEW_CACHE_MS: number;
export declare const MAUSBOT_TEAM_VIEW_MIN_UPSTREAM_MS: number;
export declare class TeamViewInputError extends Error { code: string; status: number; constructor(code: string); }
export type TeamViewPerson = { id: string; name: string; title: string | null; section: string | null; chiefOfStaff: boolean;
  hasAvatar: boolean; status: "active" | "waiting" | "idle"; unread: number };
export type TeamViewChief = TeamViewPerson & { lastMessage: { text: string | null; at: string | null; role: string | null } | null; openReports: number | null };
export type TeamView = { source: "live-read-only"; teams: { chief: TeamViewChief; members: TeamViewPerson[]; sectionLabel: string | null; activeCount: number }[];
  unassigned: TeamViewPerson[]; activeTotal: number; degraded: string[]; generatedAt: string; knownIds: number; cached?: boolean };
export declare function assertTeamViewId(value: unknown, code?: string): string;
export declare function teamViewStatus(bot: Record<string, unknown>, activeIds: Set<string> | null): "active" | "waiting" | "idle";
export declare function parseTeamMap(payload: unknown): Map<string, string> | null;
export declare function parsePresence(payload: unknown): Set<string> | null;
export declare function parseSections(payload: unknown): { id: string; label: string | null }[] | null;
export declare function parseOverview(payload: unknown): { lastMessage: TeamViewChief["lastMessage"]; openReports: number | null } | null;
export declare function parseActivity(payload: unknown): { at: string | null; kind: string | null; title: string | null }[] | null;
export declare function parseSectionContext(payload: unknown): { section: string | null; label: string | null; updatedAt: string | null; hasText: boolean } | null;
export declare function buildTeamView(input: { bots: unknown; teamMap: Map<string, string> | null; presence: Set<string> | null;
  sections: { id: string; label: string | null }[] | null; overviews?: Map<string, unknown>; degraded?: string[] }): TeamView;
export declare function fetchMausbotTeamView(config: MausbotConfig, deps?: Record<string, unknown>): Promise<TeamView>;
export declare function fetchMausbotBotDetail(config: MausbotConfig, botId: string, deps?: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function fetchMausbotSectionContext(config: MausbotConfig, section: string, deps?: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function createTeamViewCache(options?: { ttlMs?: number; minUpstreamMs?: number; now?: () => number; maxKeys?: number }): {
  get<T extends object>(key: string, load: () => Promise<T>): Promise<T & { cached: boolean }>;
};
