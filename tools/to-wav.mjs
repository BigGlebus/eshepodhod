// Переводит звук (ogg/opus из Telegram, mp3 и т. п.) в WAV 24 кГц моно: iPhone не всегда играет Ogg Opus.
// Декодирует безголовый Chrome (без звука), тишина по краям обрезается, громкость выравнивается.
// Запуск: node tools/to-wav.mjs "вход.ogg" sounds/выход.wav [с_секунды по_секунду]
// С указанным отрезком берётся только он, края плавно затухают (вход 20 мс, выход 120 мс).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [, , inp, outp, cutFrom, cutTo] = process.argv;
if (!inp || !outp) { console.error('node tools/to-wav.mjs вход выход.wav'); process.exit(1); }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 150);
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'er-wav-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* ждём */ } }
if (!target) { console.error('Chrome не поднялся'); ch.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const b64 = readFileSync(inp).toString('base64');
const fn = `(async (b64) => {
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(u8.buffer);
  const SR = 24000, off = new OfflineAudioContext(1, Math.ceil(buf.duration * SR), SR);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  let d = (await off.startRendering()).getChannelData(0);
  const cut = ${JSON.stringify(cutFrom != null ? [Number(cutFrom), Number(cutTo)] : null)};
  if (cut) {
    d = d.slice(Math.round(cut[0] * SR), Math.round(cut[1] * SR));
    const fi = Math.round(SR * 0.02), fo = Math.round(SR * 0.12);
    for (let i = 0; i < fi && i < d.length; i++) d[i] *= i / fi;
    for (let i = 0; i < fo && i < d.length; i++) d[d.length - 1 - i] *= i / fo;
  }
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  if (!cut) {
    const th = peak * 0.02; let a = 0, b = d.length - 1; while (a < b && Math.abs(d[a]) < th) a++; while (b > a && Math.abs(d[b]) < th) b--;
    a = Math.max(0, a - Math.round(SR * 0.01)); b = Math.min(d.length - 1, b + Math.round(SR * 0.06)); d = d.slice(a, b + 1);
  }
  const g = 0.9 / peak, n = d.length, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] * g)) * 32767, true);
  let s = ''; const by = new Uint8Array(ab); for (let i = 0; i < by.length; i += 8192) s += String.fromCharCode.apply(null, by.subarray(i, i + 8192));
  const env = []; for (let i = 0; i < n; i += SR * 0.1) { let m = 0; for (let k = i; k < Math.min(n, i + SR * 0.1); k++) m = Math.max(m, Math.abs(d[k] * g)); env.push(m.toFixed(2)); }
  return { info: 'каналов ' + buf.numberOfChannels + ', ' + buf.sampleRate + ' Гц, ' + buf.duration.toFixed(2) + ' с → после обрезки ' + (n / SR).toFixed(2) + ' с', env: env.join(' '), wav: btoa(s) };
})(${JSON.stringify(b64)})`;
const r = await send('Runtime.evaluate', { expression: fn, awaitPromise: true, returnByValue: true });
ws.close(); ch.kill();
if (r.result?.exceptionDetails) { console.error('Не удалось:', r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); process.exit(1); }
const v = r.result.result.value;
writeFileSync(outp, Buffer.from(v.wav, 'base64'));
console.log(v.info); console.log('огибающая по 0,1 с:', v.env); console.log('→', outp);
