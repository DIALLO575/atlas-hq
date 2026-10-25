import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("Mes Apps exposes n8n early, as a true recommended Operations Studio",async()=>{
 const [catalog,directory,css]=await Promise.all([
  read("../src/lib/app-catalog.ts"),
  read("../src/components/apps-directory.tsx"),
  read("../src/app/apps-redesign.css"),
 ]);
 const index=catalog.indexOf('slug: "n8n"');
 assert.ok(index>0&&index<catalog.indexOf('slug: "google-drive"'));
 assert.match(catalog,/slug: "n8n"[\s\S]*?recommended: true/);
 assert.match(directory,/href="\/apps\/n8n"/);
 assert.match(directory,/Ouvrir n8n Operations Studio/);
 assert.match(directory,/app\.slug === "n8n" \? " is-n8n"/);
 assert.match(directory,/app\.slug === "n8n" \? "Préconnexion"/);
 assert.match(css,/\.atlas-app-tile\.is-n8n/);
 assert.match(css,/#f5b4ba/);
});
test("n8n console is a real Atlas tabbed management UI, not a false live connection",async()=>{
 const [ui,css]=await Promise.all([
  read("../src/components/n8n-control-center.tsx"),
  read("../src/app/apps/n8n/n8n-console.css"),
 ]);
 for(const s of ["Vue d’ensemble","Workflows","Exécutions","Connexion & sécurité",
   "Operations Studio","n8n-hero-diagram","n8n-metrics",
   "N8nWorkflowRegistry","N8nExecutionRegistry","n8n-health-steps",
   "n8n-cross-links","n8n-workspace-controls"]){
  assert.ok(ui.includes(s),s);
 }
 assert.match(ui,/setActiveTab\("connection"\)/);
 assert.match(ui,/setActiveTab\("workflows"\)/);
 assert.match(ui,/setActiveTab\("executions"\)/);
 assert.match(ui,/aria-label="Sections du centre n8n"/);
 assert.match(ui,/const snapshot = snapshotState\?\.workspaceId === workspaceId/);
 assert.match(ui,/const overview = overviewState\?\.workspaceId === workspaceId/);
 assert.match(ui,/controller\.abort\(\)/);
 assert.match(ui,/overview\.workflowListTruncated/);
 assert.match(ui,/overview\.executionListTruncated/);
 assert.match(ui,/API Admin propriétaire · exécution autonome verrouillée/);
 assert.match(ui,/N8nAdminStudio/);
 assert.match(ui,/isOwner={workspace\?\.role === "owner"}/);
 assert.match(ui,/Passerelle inactive|Aucun appel fournisseur/);
 assert.match(ui,/readOnlyApiEnabled: false/);
 assert.doesNotMatch(ui,/NEXT_PUBLIC_N8N|ATLAS_N8N_API_KEY|https:\/\/.*n8n\.io\/webhook/i);
 for(const marker of [".n8n-hero",".n8n-hero-diagram",".n8n-tabs",
   ".n8n-overview-layout",".n8n-table",".n8n-status-tag",
   "@media(max-width:720px)","prefers-color-scheme:dark"]){
  assert.ok(css.includes(marker),marker);
 }
 assert.match(css,/#ff91ac/i);
 assert.match(css,/#f16c50/i);
});
test("owner/admin registration remains possible only in OFFLINE mode via authenticated Atlas BFF",async()=>{
 const ui=await read("../src/components/n8n-control-center.tsx");
 assert.match(ui,/workspace\?\.role === "owner" \|\| workspace\?\.role === "admin"/);
 assert.match(ui,/instances\.length \|\| submitting/);
 assert.match(ui,/fetch\("\/api\/engines\/instances"/);
 assert.match(ui,/engineKey: "n8n", transport: "http"/);
 assert.match(ui,/Enregistrer hors ligne/);
 assert.match(ui,/Aucun accès au moteur n’a été activé/);
 assert.match(ui,/setNotice\(\{ workspaceId: requestedWorkspaceId/);
 assert.match(ui,/setIssue\(\{ workspaceId: requestedWorkspaceId/);
 assert.doesNotMatch(ui,/fetch\(["']https:|method:\s*"DELETE"|createN8nMcpOfflineClient|tools\/call|publish_workflow/);
});
test("workflow panel supports actual text/state filters, refresh and absence of remote false claims",async()=>{
 const src=await read("../src/components/n8n-workflow-registry.tsx");
 for(const term of ["useMemo","setSearch","setFilter","setRefresh","filter===",
   'fetch("/api/apps/n8n/workflows?workspaceId="',"data.providerConnected!==false",
   "data.liveSyncEnabled!==false","state","n8n-table","Aucun workflow référencé",
   "Aucun résultat trouvé","Effacer les filtres","50 dernières entrées"]){
  assert.ok(src.includes(term),term);
 }
 assert.match(src,/controller\.abort\(\)|abort\.abort\(\)/);
 assert.doesNotMatch(src,/method:\s*"POST"|SUPABASE_SERVICE_ROLE|token|apiKey/i);
});
test("execution panel filters status and workflow names, distinguishes autonomous/mission runs",async()=>{
 const src=await read("../src/components/n8n-execution-registry.tsx");
 for(const term of ["useMemo","setQuery","setStatus","setRefresh",
   'fetch("/api/apps/n8n/coordination?workspaceId="',"view.canStartWorkflow!==false",
   "filtered.length","item.missionId","Mission liée","Autonome",
   "executionListTruncated","Aucune exécution enregistrée","Effacer les filtres"]){
  assert.ok(src.includes(term),term);
 }
 assert.match(src,/controller\.abort\(\)/);
 assert.doesNotMatch(src,/method:\s*"POST"|SUPABASE_SERVICE_ROLE|token|apiKey/i);
});
test("no n8n SQL migration / release gate change is included in this purely UI PR",async()=>{
 const [status,workflows,coordination,gateway]=await Promise.all([
  read("../src/app/api/apps/n8n/status/route.ts"),
  read("../src/app/api/apps/n8n/workflows/route.ts"),
  read("../src/app/api/apps/n8n/coordination/route.ts"),
  read("../packages/engine-core/src/release-gates.mjs"),
 ]);
 assert.match(status,/connected: false/);
 assert.match(workflows,/providerConnected: false/);
 assert.match(coordination,/requireEngineWorkspace\(workspaceId\)/);
 assert.match(gateway,/N8N_DURABLE_RELEASE_GATE_CLOSED/);
});
