import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('reader assets prefer the network and remain available offline', async () => {
  const handlers = {};
  let cached = new Response('old'), online = true;
  const cache = { match: async () => cached, put: async (_request, value) => { cached = value; } };
  const self = { AtlasBookOfflineAssets: ['/vendor/foliate-js/pdf.js'], JournalSwCore: {}, location: new URL('https://atlas.example'), addEventListener: (name, handler) => { handlers[name] = handler; } };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self, importScripts() {}, URL, Response, caches: { open: async () => cache },
    fetch: async () => { if (!online) throw new Error('offline'); return new Response('new'); },
  });
  const request = { method: 'GET', url: 'https://atlas.example/vendor/foliate-js/pdf.js', mode: 'cors' };
  const run = () => { let response; handlers.fetch({ request, respondWith: value => { response = value; } }); return response; };
  assert.equal(await (await run()).text(), 'new');
  online = false;
  assert.equal(await (await run()).text(), 'new');
});
