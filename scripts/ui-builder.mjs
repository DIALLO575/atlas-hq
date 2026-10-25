// NDJSON stdin/stdout capability. One process = one private, temporary session.
import { createInterface } from 'node:readline';
import { createBuilder } from '../src/lib/ui-studio/builder.ts';
const builder = createBuilder();
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    if (Buffer.byteLength(line) > 8192) throw new Error('Request too large');
    process.stdout.write(JSON.stringify({ ok: true, result: builder.call(JSON.parse(line)) }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid request' }) + '\n');
    process.exitCode = 1;
  }
}
