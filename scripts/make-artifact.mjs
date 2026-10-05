// Turns dist-single/index.html into a body-only page for claude.ai Artifacts,
// which wrap the published file in their own <html>/<head>/<body> skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');

const title = pick(/<title>[\s\S]*?<\/title>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);
const body = (html.match(/<body>([\s\S]*?)<\/body>/) ?? [, ''])[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();

writeFileSync('dist-single/valle-girasole.html', [title, styles, body, scripts].join('\n'));
console.log('dist-single/valle-girasole.html', (Buffer.byteLength([title, styles, body, scripts].join('\n')) / 1024).toFixed(0), 'KB');
