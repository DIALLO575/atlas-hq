import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const root = 'public/vendor/foliate-js';
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(entry => { const child = join(path, entry.name); return entry.isDirectory() ? walk(child) : [child]; }); }
const assets = walk(root).filter(path => !path.endsWith('.map')).map(path => `/${relative('public', path).split(sep).join('/')}`).sort();
const output = `// Generated from vendored reader assets; ebook files are never listed here.\nself.AtlasBookOfflineAssets = ${JSON.stringify(assets)};\n`;
if (process.argv.includes('--check')) { if (readFileSync('public/books-offline-assets.js', 'utf8') !== output) throw new Error('Regenerate offline reader asset list'); }
else writeFileSync('public/books-offline-assets.js', output);
