// Макеты мотиватора: рисует все варианты из BRO_LOOKS кодом самой игры (ER.mockBro) и сохраняет одной картинкой.
// Запуск (из папки проекта): node tools/mockups-bro.mjs [выход.png]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const OUTF = resolve(process.argv[2] || 'mockups/png/motivator-variants.png');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9750 + Math.floor(Math.random() * 200);
const prof = mkdtempSync(join(tmpdir(), 'er-mock-'));
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run',
  pathToFileURL(resolve('index.html')).href + '?mute'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bail = (msg) => { console.error(msg); ch.kill(); process.exit(1); };
setTimeout(() => bail('не успели за 60 с'), 60000).unref();
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch { /* ждём */ } }
if (!target) bail('Chrome не поднялся');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const ev = (expr) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
await sleep(2500);   // шрифты
const res = await ev('ER.mockBro()');
const data = res.result?.result?.value;
if (!data) bail('не нарисовалось: ' + JSON.stringify(res.result?.exceptionDetails || res).slice(0, 400));
writeFileSync(OUTF, Buffer.from(data, 'base64'));
console.log('→', OUTF);
ws.close(); ch.kill(); process.exit(0);
