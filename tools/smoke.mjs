// Автопроверка прототипа без звука: безголовый Chrome проходит обучение, дожим, страховку, аварию,
// смену качалки и усы, снимает экраны и печатает ошибки страницы.
// Запуск (из папки проекта): node tools/smoke.mjs [папка-для-снимков]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const OUT = resolve(process.argv[2] || 'tools/shots');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 400);
const url = pathToFileURL(resolve('index.html')).href + '?mute';
const prof = mkdtempSync(join(tmpdir(), 'er-smoke-'));
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--window-size=844,390', '--force-device-scale-factor=1', '--no-first-run', url], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = list.find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch { /* ждём */ }
}
if (!target) { console.error('Chrome не поднялся'); ch.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(d.params.type.toUpperCase() + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  // открытая с диска страница не может загрузить звук и манифест (CORS для file://) — это ожидаемо
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/obosralsya|favicon|sw\.js|manifest|icon-|apple-touch/.test(d.params.entry.text + ' ' + (d.params.entry.url || ''))) errors.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };
const click = async (lx, ly) => {
  const [x, y] = await ev(`(() => { const r = document.getElementById('c').getBoundingClientRect(); return [r.left + ${lx} * r.width / 844, r.top + ${ly} * r.height / 390]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await ev('ER.step(0.05)');
};
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log((ok ? 'ОК   ' : 'СБОЙ ') + msg); if (!ok) errors.push('CHECK ' + msg); };

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
await sleep(2500); // шрифты
await ev('window.dispatchEvent(new Event("resize"))');
await ev('ER.pause(true); ER.reset(); ER.step(0.1)');
const REP = `(() => { ER.hold(true); for (let i = 0; i < 600 && ER.R.pos < 1 && ER.R.mode === 'lift'; i++) ER.step(1/60);
  if (ER.R.mode !== 'lift') return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) };
  ER.hold(false); for (let i = 0; i < 200 && ER.R.pos > 0; i++) ER.step(1/60); ER.step(1/60);
  return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) }; })()`;

// 1. Старт и обучение — настоящими кликами по кнопкам
await shot('01-title');
await click(612, 231); check(await ev('ER.state') === 'brief', 'кнопка «Играть» → объяснение тренера');
await shot('02-brief');
await click(707, 356); check(await ev('ER.state') === 'set' && await ev('ER.R.tut'), '«Понял, жмём» → обучающий подход 40 кг × 8');
await ev('ER.step(0.9)'); await shot('03-set-start');
let r; let n = 0;
do { r = await ev(REP); n++; if (n === 3) { await ev('ER.hold(true); ER.step(0.25)'); await shot('04-press-green'); await ev('ER.hold(false); ER.step(0.8)'); } } while (r.mode === 'lift' && r.fat < 0.6 && n < 30);
log('  после зелёной зоны:', JSON.stringify(r));
await ev('ER.hold(true); ER.step(0.3)'); await shot('05-press-yellow'); await ev('ER.hold(false); ER.step(0.8)');
do { r = await ev(REP); n++; } while (r.mode === 'lift' && r.fat < 0.86 && n < 40);
await ev('ER.hold(true); ER.step(0.3)'); await shot('06-press-red'); await ev('ER.hold(false); ER.step(0.8)');
do { r = await ev(REP); n++; } while (r.mode === 'lift' && n < 50);
check(r.mode === 'push', 'усталость 100% → дожим (повторов ' + r.reps + ')');
for (let i = 0; i < 5; i++) await ev('ER.tap(600 + Math.random() * 120, 240 + Math.random() * 60); ER.step(0.12)');
await shot('07-push');
const burl = await ev('ER.R.burl'); check(burl > 0.2 && burl < 1, 'тапы поднимают Бурлометр (' + burl.toFixed(2) + ')');
await click(44, 344); check(await ev('ER.R.mode') === 'spot', 'кнопка страховки → Толян помогает');
await ev('ER.step(0.5)'); await shot('08-spot');
await ev('ER.step(1)'); r = await ev('({ mode: ER.R.mode, reps: ER.R.reps, spot: ER.R.spotLeft })'); check(r.mode === 'lift' && r.reps % 1 === 0.5 && r.spot === 0, 'страховка засчитала половину повтора (' + r.reps + ')');
await ev('ER.hold(false); for (let i = 0; i < 120 && ER.R.pos > 0; i++) ER.step(1/60)');
await click(80, 30); check(await ev('ER.R && ER.R.mode') === 'racked' || await ev('ER.state') === 'done', 'кнопка «Готово» ставит штангу');
await ev('ER.step(1)'); check(await ev('ER.state') === 'done', 'итоги после стойки');
await ev('ER.step(1.4)'); await shot('09-done');
const d1 = await ev('({ reps: ER.DONE.reps, chest: +ER.DONE.chestG.toFixed(1), plan: ER.DONE.planDone, cans: ER.DONE.cansG, tut: ER.S.tutDone, build: +ER.S.chest.toFixed(1) })');
log('  итоги обучения:', JSON.stringify(d1)); check(d1.tut && d1.chest > 0, 'мышцы выросли, обучение пройдено');

// 2. План «на грани» и авария
await click(705, 352); check(await ev('ER.state') === 'plan', '«Ещё подход» → выбор плана');
await shot('10-plan');
const plans = await ev('ER.PLANS.map((p) => p.weight + "×" + p.reps + " " + p.fc.word)'); log('  планы:', plans.join(' | '));
await click(700, 190); check(await ev('ER.state === "set" && ER.R.target') === 10, 'тап по третьей карточке → подход «на грани»');
n = 0; do { r = await ev(REP); n++; } while (r.mode === 'lift' && n < 40);
check(r.mode === 'push', 'дошли до дожима (' + r.reps + ' повторов)');
await ev('ER.step(2.5)'); let m = await ev('ER.R.mode'); for (let i = 0; i < 120 && m === 'push'; i++) { await ev('ER.step(0.1)'); m = await ev('ER.R.mode'); }
check(m === 'crash', 'без тапов штанга придавила → авария');
check(await ev('ER.S.bans.podval') === 3, 'подвал закрыт на 3 тренировки');
await ev('ER.step(0.5)'); await shot('11-crash-0.5s');
await ev('ER.step(0.6)'); await shot('12-crash-stamp');
await ev('ER.step(1.2)'); await shot('13-crash-crowd');
await ev('ER.step(1.6)'); await shot('14-crash-card');
await click(584, 124); check(await ev('ER.state') === 'gyms', '«Сменить качалку» → список качалок');
await shot('15-gyms');

// 3. Другие качалки и усы
await click(400, 324); check(await ev('ER.state === "plan" && ER.S.gym') === 'school', 'переход в школьный спортзал');
await click(420, 190); for (let i = 0; i < 4; i++) await ev(REP);
await ev('ER.hold(true); ER.step(0.25)'); await shot('16-school'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
check(await ev('ER.S.bans.podval') === 2, 'тренировка в школе сократила изгнание до 2');
await ev('ER.S.gym = "glamour"; ER.goPlan(); ER.startSet(ER.PLANS[1].weight, ER.PLANS[1].reps, false)');
for (let i = 0; i < 6; i++) await ev(REP);
await ev('ER.hold(true); ER.step(0.25)'); await shot('17-glamour'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
await ev('ER.go("gyms"); ER.step(0.05)'); await shot('18-gyms-banned');
const cansBefore = await ev('ER.S.cans');
await click(136, 324); check(await ev('ER.S.disguise.podval') === true && await ev('ER.S.gym') === 'podval' && await ev('ER.S.cans') === cansBefore - 40, 'вернулся в подвал в усах за 40 банок');
await click(420, 190); for (let i = 0; i < 2; i++) await ev(REP); await ev('ER.step(0.6)');
await shot('19-disguise-set');
await ev('ER.go("title"); ER.step(0.1)'); await shot('20-title-disguise');

// 4. Живой цикл кадров тоже не падает
await ev('ER.pause(false)'); await sleep(1500);

log('\nОшибки страницы: ' + (errors.length ? '\n' + errors.join('\n') : 'нет'));
log('Снимки: ' + OUT);
ws.close(); ch.kill();
process.exit(errors.length ? 2 : 0);
