import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const logos = [
  "notion", "github", "linear", "slack", "google-drive", "google-calendar",
  "google-sheets", "airtable", "salesforce", "google-analytics",
  "microsoft-365", "figma", "miro", "microsoft-teams",
  "calendly", "hubspot", "zapier", "clickup",
];

test("all provider icons are authentic local SVG assets with no script or remote image dependencies", async () => {
  for (const slug of logos) {
    const svg = await read("../public/brands/" + slug + ".svg");
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<\/svg>/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|<image\b|\bon\w+=|(?:xlink:)?href\s*=\s*["'](?!#)/i);
  }
  assert.match(await read("../public/brands/README.md"), /Simple Icons/);
  assert.match(await read("../public/brands/LICENSE-simple-icons.md"), /CC0/);
});

test("Mes Apps is a proper working discovery interface, not fictitious integration data", async () => {
  const [page, directory, catalogue, brand, home, styles] = await Promise.all([
    read("../src/app/apps/page.tsx"),
    read("../src/components/apps-directory.tsx"),
    read("../src/lib/app-catalog.ts"),
    read("../src/components/brand-logo.tsx"),
    read("../src/app/page.tsx"),
    read("../src/app/apps-redesign.css"),
  ]);
  assert.match(page, /<AppsDirectory/);
  assert.match(page, /<AppsDirectory githubConfigured/);
  assert.doesNotMatch(page, /<GitHubWorkspacePicker|force-dynamic|supabase\.auth\.getUser/);
  assert.doesNotMatch(directory, /githubSlot|hasVerifiedGitHub/);
  assert.match(directory, /app.slug === "github"/);
  assert.match(page, /Vos applications, au même endroit/);
  assert.match(page, /href="#apps-catalog"/);
  assert.match(directory, /useState/);
  assert.match(directory, /useMemo/);
  assert.match(directory, /aria-pressed/);
  assert.match(directory, /id="atlas-apps-search"/);
  assert.match(directory, /aria-live="polite"/);
  assert.match(directory, /toggleFavorite/);
  assert.match(directory, /localStorage\.setItem\(FAVORITES_KEY/);
  assert.match(directory, /Voir toutes les applications/);
  assert.match(directory, /setSelected/);
  assert.match(directory, /Retrouvez les connexions réelles dans leur espace de pilotage/);
  assert.match(directory, /Connexion à venir/);
  assert.doesNotMatch(directory, /Actions rapides|Besoin de vous|atlas-apps-sidebar|atlas-apps-attention/);
  assert.match(directory, /atlas-apps-inline-detail/);
  assert.doesNotMatch(directory, /8 apps connectées|Approbations \(3\)|Connectée<\/span>/);
  assert.match(catalogue, /recommendedApps = atlasApps\.filter/);
  assert.match(catalogue, /HubSpot/);
  assert.match(catalogue, /Google Calendar/);
  assert.match(brand, /\/brands\//);
  assert.match(brand, /unoptimized/);
  assert.match(home, /<BrandLogo/);
  assert.match(styles, /atlas-apps-content-grid/);
  assert.match(styles, /atlas-apps-tiles/);
  assert.match(styles, /atlas-apps-reco-grid/);
  assert.match(styles, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:540px\)/);
});

test("all enabled navigation targets have real destinations and not fake OAuth flows", async () => {
  const directory = await read("../src/components/apps-directory.tsx");
  const page = await read("../src/app/apps/page.tsx");
  assert.match(page, /href="#apps-catalog"/);
  assert.doesNotMatch(directory, /href="\/agents"|href="\/missions"|href="\/inbox"/);
  assert.doesNotMatch(directory, /href="https?:\/\/.*oauth|fetch\(["']\/api\/connect/);
});
