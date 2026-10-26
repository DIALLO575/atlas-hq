import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui=readFileSync(new URL("../src/components/agents-workspace.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/app/agents/agent-request.css",import.meta.url),"utf8");
test("PWA directory switches teams and agents",()=>{
 assert.ok(ui.includes("data-tab={directoryTab}"));
 assert.ok(ui.includes('setDirectoryTab("teams")'));
 assert.ok(ui.includes('setDirectoryTab("agents")'));
 assert.ok(css.includes('[data-tab="teams"]')&&css.includes('[data-tab="agents"]'));
});
test("mobile team has member and chat screens",()=>{
 assert.ok(ui.includes("data-mobile-view={mobileView}"));
 assert.ok(ui.includes('setMobileView("members")'));
 assert.ok(ui.includes("function showChatView()"));
 assert.ok(css.includes('[data-mobile-view="members"]')&&css.includes('[data-mobile-view="chat"]'));
});
test("PWA and desktop fullscreen fit the viewport",()=>{
 assert.ok(css.includes("height:100dvh"));
 assert.ok(css.includes("safe-area-inset-bottom"));
 assert.ok(css.includes("width:min(100%,1240px)"));
 assert.ok(css.includes("grid-template-columns:minmax(260px"));
});
test("overlays contain keyboard focus and Escape exits",()=>{
 assert.ok(ui.includes('role={compact ? "dialog" : undefined}'));
 assert.ok(ui.includes('aria-modal={compact ? true : undefined}'));
 assert.ok(ui.includes('document.body.style.overflow = "hidden"'));
 assert.ok(ui.includes('event.key === "Escape"'));
 assert.ok(ui.includes('event.key !== "Tab"'));
 assert.ok(ui.includes("openerRef.current?.focus"));
});
