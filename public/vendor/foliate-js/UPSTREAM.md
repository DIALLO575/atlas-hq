# Reader engines

- foliate-js: https://github.com/johnfactotum/foliate-js, upstream main commit `78914aef4466eb960965702401634c2cb348e9b1`, MIT license in `LICENSE`.
- PDF.js: https://github.com/mozilla/pdf.js, npm release `5.5.207`, Apache-2.0 license in `vendor/pdfjs/LICENSE`.

The EPUB processor is locally hardened in `epub.js` to remove scripted content and event-handler attributes from untrusted books before rendering.
