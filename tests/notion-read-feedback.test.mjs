import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../src/components/notion-resources-client.tsx",import.meta.url),"utf8");
test("Notion search errors carry only allowlisted API diagnostic codes, not raw provider bodies",()=>{
 assert.match(source,/async function responseFailure\(response: Response\)/);
 assert.match(source,/\^notion-\[a-z-\]\{1,70\}\$/);
 assert.match(source,/throw await responseFailure\(response\)/);
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|\bwindow\.localStorage\b/);
});
test("failed search is never misrepresented as an empty but successful library",()=>{
 assert.match(source,/const \[loadError,setLoadError\]=useState\(false\)/);
 assert.match(source,/setLoadError\(true\)/);
 assert.match(source,/loaded && resources\.length === 0 && \(loadError \?/);
 assert.match(source,/Impossible de charger la bibliothèque Notion/);
 assert.match(source,/Aucune ressource renvoyée par Notion/);
 assert.match(source,/Actualiser les ressources/);
});
test("instructions share only a selected page; browser does not broaden Notion permissions",()=>{
 assert.match(source,/ajoutez l’intégration ATLAS à cette page/);
 assert.match(source,/setLoadError\(false\)/);
 assert.match(source,/aria-label="Navigation Notion mobile"/);
});
