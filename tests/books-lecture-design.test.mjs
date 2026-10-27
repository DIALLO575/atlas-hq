import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const component = read("src/components/books/book-library.tsx");
const css = read("src/app/lecture/lecture-refined.css");

test("library and reader both import the refined responsive styles", () => {
  assert.match(read("src/app/lecture/page.tsx"), /lecture-refined\.css/);
  assert.match(read("src/app/lecture/[id]/page.tsx"), /lecture-refined\.css/);
  for (const selector of [".atlas-books-import-panel", ".atlas-books-dropzone", ".atlas-book-reader-title", ".atlas-book-notes-head"]) {
    assert.ok(css.includes(selector));
  }
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:600px\)/);
});
test("upload can be chosen or dropped, supports formats and preserves upload verification", () => {
  assert.match(component, /chooseBookFile\(event\.dataTransfer\.files\?\.\[0\]/);
  assert.match(component, /accept="\.epub,\.pdf,application\/epub\+zip,application\/pdf"/);
  assert.match(component, /file\.size>104857600/);
  assert.match(component, /setUploadStep\("transferring"\)/);
  assert.match(component, /Envoi et vérification du fichier/);
  assert.match(component, /await sendBookFile\(workspaceId,created\.book\.id,newFile,created\.upload,setUploadPercent\)/);
  assert.ok(component.includes('if((response.ok||response.status===409)&&await stored()){onProgress?.(100);return;}'));
});
test("reader controls stay accessible with new design", () => {
  assert.match(component, /aria-controls="atlas-reader-settings"/);
  assert.match(component, /aria-label="Page précédente"/);
  assert.match(component, /aria-label="Page suivante"/);
  assert.match(component, /Réimporter le fichier original/);
  assert.match(component, /atlas-book-notes-head/);
});

test("PWA picker is a visible native input and an explicit tap button",()=>{
 assert.match(component,/onClick=\{\(\) => fileInput\.current\?\.click\(\)\}/);
 assert.match(component,/className="atlas-books-native-file"/);
 assert.doesNotMatch(component,/className="atlas-books-upload-input"/);
 assert.match(css,/\.atlas-books-add \.atlas-books-native-file/);
 assert.match(component,/navigator\.onLine/);
});
