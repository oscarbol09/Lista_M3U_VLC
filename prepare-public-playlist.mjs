import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('./canales-hispano-latino-vlc.m3u', import.meta.url);
const input = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
const lines = input.split(/\r?\n/);
const preamble = [];
const entries = [];
let current = null;

for (const line of lines) {
  if (line.startsWith('#EXTINF:')) {
    if (current) entries.push(current);
    current = [line];
  } else if (current) {
    current.push(line);
  } else if (line) {
    preamble.push(line);
  }
}
if (current) entries.push(current);

const sensitiveQuery = /[?&](?:token|access_token|auth|authorization|api_key|password|passwd)=/i;
const safeEntries = entries.filter(entry =>
  !entry.some(line => /^https?:\/\//i.test(line) && sensitiveQuery.test(line))
);
const omitted = entries.length - safeEntries.length;

await writeFile(path, [...preamble, ...safeEntries.flat()].join('\r\n') + '\r\n', 'utf8');
console.log('Removed ' + omitted + ' stream entries with credential-like URL parameters.');