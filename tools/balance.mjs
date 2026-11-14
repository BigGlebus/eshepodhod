// Симуляция баланса: бот играет подходы со стадии и считает, сколько подходов нужно до следующей стадии.
// Бот жмёт до верха, ловит штангу в зелёном, на «Ещё разок?» соглашается до дожима, дожимает тапами.
// Запуск (из папки проекта): node tools/balance.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9550 + Math.floor(Math.random() * 150);
const prof = mkdtempSync(join(tmpdir(), 'er-bal-'));
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run',
  pathToFileURL(resolve('index.html')).href + '?mute'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bail = (m) => { console.error(m); ch.kill(); process.exit(1); };
setTimeout(() => bail('не успели за 240 с'), 240000).unref();
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch { /* ждём */ } }
if (!target) bail('Chrome не поднялся');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const ev = async (expr) => { const r = await new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }); if (r.result?.exceptionDetails) bail(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
await sleep(2000);
const res = await ev(`(() => {
  ER.pause(true); if (ER.autoTips) ER.autoTips(true);
  const play = (planIdx) => {
    ER.goPlan(); const p = ER.PLANS[planIdx]; ER.startSet(p.weight, p.reps, false);
    for (let guard = 0; guard < 80; guard++) {
      const R = ER.R; if (!R || ER.state !== 'set') break;
      if (R.mode === 'ask') { ER.more(true); continue; }
      if (R.mode === 'lift') {
        ER.hold(true); for (let i = 0; i < 600 && ER.R.pos < 1 && ER.R.mode === 'lift'; i++) ER.step(1/60);
        ER.hold(false); if (ER.R.mode !== 'lift') continue;
        for (let i = 0; i < 200 && ER.R.pos > 0; i++) ER.step(1/60); ER.step(1/60); continue;
      }
      if (R.mode === 'push') { for (let i = 0; i < 80 && ER.R.mode === 'push'; i++) { ER.tap(600, 260); ER.step(0.09); } if (ER.R.mode === 'lift' || ER.R.mode === 'ask') { ER.step(0.2); if (ER.R.mode === 'ask') { ER.more(false); ER.step(1.2); } else { ER.rackBar(); ER.step(1.2); } } break; }
      if (R.mode === 'crash') break;
      ER.step(0.1);
    }
    return ER.state === 'done' ? { ok: true, reps: ER.DONE.reps, grow: +(ER.DONE.chestG + ER.DONE.armsG).toFixed(1) } : { ok: false };
  };
  const out = [];
  for (const [label, chest, arms] of [['ДРИЩ', 0, 0], ['КРЕПЫШ', 21, 9], ['3-я стадия', 50.4, 21.6], ['4-я стадия', 84, 36]]) {
    for (const planIdx of [0, 1, 2]) {
      const g = [];
      for (let k = 0; k < 4; k++) { ER.reset(); ER.S.tutDone = true; ER.S.chest = chest; ER.S.arms = arms; ER.S.gym = 'dvor'; ER.S.energy = 1e6; if (ER.S.tips) ER.S.tips = new Proxy({}, { get: () => true }); g.push(play(planIdx)); }
      const ok = g.filter((x) => x.ok), avg = ok.length ? ok.reduce((a, x) => a + x.grow, 0) / ok.length : 0;
      out.push(label + ' план ' + (planIdx + 1) + ': рост за подход ~' + avg.toFixed(1) + ' (дожато ' + ok.length + '/4; повторы ' + ok.map((x) => x.reps).join(',') + ')');
    }
  }
  return out;
})()`);
console.log(res.join('\n'));
console.log('Пороги (грудь+руки): КРЕПЫШ 30, 3-я стадия 72, 4-я 120, ЛЕГЕНДА 168');
ws.close(); ch.kill(); process.exit(0);
