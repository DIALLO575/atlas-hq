import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const file=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("three pillars remain visible and Studio approval is reset on installation switch",async()=>{
 const page=await file("../src/components/github-control-center.tsx");
 assert.match(page,/id: "pulls"/);
 assert.match(page,/id: "studio"/);
 assert.match(page,/id: "actions"/);
 assert.match(page,/GitHubStudioRepositoryWizard key=\{\x60\$\{workspace.id\}:\$\{installationId/);
 assert.match(page,/GitHubActionsControlCenter key=\{\x60\$\{workspace.id\}:\$\{installationId/);
 assert.match(page,/Gardez le contrôle de vos projets GitHub/);
 const studio=await file("../src/components/github-studio-repository-wizard.tsx");
 assert.match(studio,/Math\.min\(300000,Math\.max\(0,approval\.expiresAt-Date\.now\(\)\)\)/);
 assert.match(studio,/window\.setTimeout\(\(\)=>setApproval\(null\),delay\)/);
});
test("PR diff inspector selects a visible file, distinguishes patch headers and has keyboard semantics",async()=>{
 const page=await file("../src/components/github-control-center.tsx");
 assert.match(page,/result\.files\.slice\(0, 35\)\.find/);
 assert.match(page,/!line\.startsWith\("\+\+\+"\)/);
 assert.match(page,/!line\.startsWith\("---"\)/);
 assert.match(page,/aria-pressed=\{detailNumber === pr.number\}/);
 assert.match(page,/aria-pressed=\{expandedFile === file.path\}/);
 assert.match(page,/Chargement des modifications de la Pull Request/);
});
test("Actions reset stale repository results and never expose a rerun action",async()=>{
 const client=await file("../src/components/github-actions-control-center.tsx");
 const api=await file("../src/app/api/apps/github/actions/route.ts");
 const connector=await file("../packages/connectors/github/src/github-actions-client.mjs");
 assert.match(client,/setRuns\(\[\]\);setJobs\(\[\]\);setSelectedRunId\(null\)/);
 assert.match(client,/jobsController\.current\?\.abort\(\);runsController\.current\?\.abort\(\)/);
 assert.match(client,/aria-busy=\{loading==="jobs"\}/);
 assert.match(client,/orderedJobs/);
 assert.match(connector,/minted\.permissions\?\.actions !== "read"/);
 assert.match(connector,/job\?\.run_id !== undefined && job\.run_id !== runId/);
 assert.match(api,/export async function GET/);
 assert.doesNotMatch(api,/export async function POST|rerun-failed-jobs|dispatches/);
 assert.match(client,/confirmRerun/);
});
test("consolidated design is responsive and has visible keyboard focus",async()=>{
 const css=await file("../src/app/github-control-center.css");
 assert.match(css,/\.atlas-gh-studio-steps/);
 assert.match(css,/\.atlas-gh-actions-content/);
 assert.match(css,/\.atlas-gh-tabs button:focus-visible/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
