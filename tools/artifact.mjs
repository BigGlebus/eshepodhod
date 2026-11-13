// Собирает версию игры для страницы-артефакта Claude: та же index.html, но без обёртки документа
// (<!DOCTYPE>, <html>, <head>, <body>) и без файлов установки на телефон — артефакт добавляет обёртку сам.
// Запуск (из папки проекта): node tools/artifact.mjs  →  dist/artifact.html (+ звук публикуется рядом как sounds/obosralsya.wav)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

let html = readFileSync('index.html', 'utf8');
const drop = [
  /<!DOCTYPE html>\s*/i, /<html[^>]*>\s*/i, /<\/html>\s*/i, /<head>\s*/i, /<\/head>\s*/i, /<body>\s*/i, /<\/body>\s*/i,
  /<meta charset[^>]*>\s*/i, /<meta name="viewport"[^>]*>\s*/i,
  /<meta name="apple-mobile-web-app-[^>]*>\s*/gi, /<meta name="mobile-web-app-capable"[^>]*>\s*/i, /<meta name="theme-color"[^>]*>\s*/i,
  /<link rel="manifest"[^>]*>\s*/i, /<link rel="apple-touch-icon"[^>]*>\s*/i, /<link rel="icon"[^>]*>\s*/i,
];
for (const re of drop) html = html.replace(re, '');
const title = html.match(/<title>[^<]*<\/title>\s*/i);
if (title) html = title[0] + html.replace(title[0], '');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', html);
console.log('dist/artifact.html', html.length, 'байт');
