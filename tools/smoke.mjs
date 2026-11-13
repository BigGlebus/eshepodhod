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
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/obosralsya|lightweight|favicon|sw\.js|manifest|icon-|apple-touch/.test(d.params.entry.text + ' ' + (d.params.entry.url || ''))) errors.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
});
// у каждой команды браузеру тайм-аут: если что-то зависло, видно, на каком шаге
const send = (method, params = {}) => new Promise((r, rej) => {
  const i = ++id, tm = setTimeout(() => { wait.delete(i); ch.kill(); rej(new Error('браузер не ответил за 30 с: ' + method + ' ' + (params.expression || '').slice(0, 90))); }, 30000);
  wait.set(i, (d) => { clearTimeout(tm); r(d); }); ws.send(JSON.stringify({ id: i, method, params }));
});
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
const REP = `(() => { if (ER.R.mode === 'ask') return { mode: 'ask', reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) };
  ER.hold(true); for (let i = 0; i < 600 && ER.R.pos < 1 && ER.R.mode === 'lift'; i++) ER.step(1/60);
  ER.hold(false);
  if (ER.R.mode !== 'lift') return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) };
  for (let i = 0; i < 200 && ER.R.pos > 0; i++) ER.step(1/60); ER.step(1/60);
  return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) }; })()`;
// «Ещё разок?»: в первый раз — снимок и настоящий тап по «ДАВАЙ!», дальше соглашаемся программно
let askSeen = false;
async function rep() {
  const r = await ev(REP);
  if (r.mode !== 'ask') return r;
  if (!askSeen) {
    askSeen = true; await ev('ER.step(0.4)'); await shot('05b-ask');
    await click(348, 233); check(await ev('ER.R.mode') === 'lift' && await ev('ER.R.bonus') === 3, '«Ещё разок?» → «ДАВАЙ!» включает ×3 на следующий повтор');
  } else await ev('ER.more(true)');
  return { ...r, mode: 'lift' };
}

// 1. Старт и обучение — настоящими кликами по кнопкам
await shot('01-title');
await click(612, 231); check(await ev('ER.state') === 'brief', 'кнопка «Играть» → объяснение тренера');
await shot('02-brief');
const ai = await ev('ER.audioInfo()');
check(ai && Object.keys(ai).filter((k) => k.startsWith('v_')).length === 12 && Object.entries(ai).filter(([k]) => k.startsWith('v_')).every(([, v]) => v.nan === 0 && v.peak > 0.2), '6 голосов × 2 дубля синтезированы без сбоев');
await click(707, 356); check(await ev('ER.state') === 'set' && await ev('ER.R.tut') && await ev('ER.R.target') === 4, '«Понял, жмём» → обучающий подход 40 кг × 4');
await ev('ER.step(0.9)'); await shot('03-set-start');
let r; let n = 0;
do { r = await rep(); n++; if (n === 3) { await ev('ER.hold(true); ER.step(0.25)'); await shot('04-press-green'); await ev('ER.hold(false); ER.step(0.8)'); } } while (r.mode === 'lift' && r.fat < 0.6 && n < 30);
log('  после зелёной зоны:', JSON.stringify(r));
await ev('ER.hold(true); ER.step(0.3)'); await shot('05-press-yellow'); await ev('ER.hold(false); ER.step(0.8)');
do { r = await rep(); n++; } while (r.mode === 'lift' && n < 50);
check(askSeen, 'после плана появился вопрос «Ещё разок?»');
check(r.mode === 'push', 'усталость 100% → дожим (' + JSON.stringify(r) + ')');
for (let i = 0; i < 5; i++) await ev('ER.tap(600 + Math.random() * 120, 240 + Math.random() * 60); ER.step(0.12)');
await shot('07-push');
const burl = await ev('ER.R.burl'); check(burl > 0.2 && burl < 1, 'тапы поднимают Бурлометр (' + burl.toFixed(2) + ')');
await click(44, 344); check(await ev('ER.R.mode') === 'spot', 'кнопка страховки → Толян помогает');
await ev('ER.step(0.5)'); await shot('08-spot');
await ev('ER.step(1)'); r = await ev('({ mode: ER.R.mode, reps: ER.R.reps, spot: ER.R.spotLeft })'); check(r.mode === 'ask' && r.reps % 1 === 0.5 && r.spot === 0, 'страховка засчитала половину повтора, снова «Ещё разок?» (' + r.reps + ')');
await ev('ER.step(0.4)'); await click(533, 233); check(await ev('ER.R && ER.R.mode') === 'racked' || await ev('ER.state') === 'done', '«ХВАТИТ» ставит штангу');
await ev('ER.step(1)'); check(await ev('ER.state') === 'done', 'итоги после стойки');
await ev('ER.step(1.4)'); await shot('09-done');
const d1 = await ev('({ reps: ER.DONE.reps, over: ER.DONE.over, chest: +ER.DONE.chestG.toFixed(1), plan: ER.DONE.planDone, cans: ER.DONE.cansG, tut: ER.S.tutDone })');
log('  итоги обучения:', JSON.stringify(d1)); check(d1.tut && d1.chest > 0 && d1.over > 0, 'мышцы выросли, есть повторы сверх плана, обучение пройдено');

// 2. План «на грани» и авария
await click(705, 352); check(await ev('ER.state') === 'plan', '«Ещё подход» → выбор плана');
await shot('10-plan');
const plans = await ev('ER.PLANS.map((p) => p.weight + "×" + p.reps + " " + p.fc.word)'); log('  планы:', plans.join(' | '));
await ev('ER.forceCall(true)');   // в этом дожиме у соседа звонит телефон
await click(700, 190); check(await ev('ER.state === "set" && ER.R.target') === 5, 'тап по третьей карточке → подход «на грани»');
n = 0; do { r = await rep(); n++; } while (r.mode === 'lift' && n < 40);
check(r.mode === 'push', 'дошли до дожима (' + r.reps + ' повторов)');
check(!!(await ev('ER.R.call')), 'в дожиме у соседа зазвонил телефон');
await ev('ER.step(1.2)'); await click(44, 344);
check(await ev('ER.R.mode') === 'push' && await ev('ER.R.spotLeft') === 1, 'сосед на телефоне — страховка не срабатывает');
await shot('10b-call');
await ev('ER.step(1.3)'); let m = await ev('ER.R.mode'); for (let i = 0; i < 120 && m === 'push'; i++) { await ev('ER.step(0.1)'); m = await ev('ER.R.mode'); }
check(m === 'crash', 'без тапов штанга придавила → авария');
check(await ev('ER.S.bans.podval') === 3, 'подвал закрыт на 3 тренировки');
await ev('ER.step(0.5)'); await shot('11-crash-0.5s');
await ev('ER.step(0.6)'); await shot('12-crash-stamp');
await ev('ER.step(1.2)'); await shot('13-crash-crowd');
await ev('ER.step(1.6)'); await shot('14-crash-card');
await click(353, 238); check(await ev('ER.state') === 'gyms', '«Сменить качалку» → список качалок');
await shot('15-gyms');

// 3. Другие качалки и усы
await click(400, 324); check(await ev('ER.state === "plan" && ER.S.gym') === 'school', 'переход в школьный спортзал');
await click(420, 190); for (let i = 0; i < 3; i++) await rep();
await ev('ER.hold(true); ER.step(0.25)'); await shot('16-school'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
check(await ev('ER.S.bans.podval') === 2, 'тренировка в школе сократила изгнание до 2');
await ev('ER.S.gym = "glamour"; ER.goPlan(); ER.startSet(ER.PLANS[1].weight, ER.PLANS[1].reps, false)');
for (let i = 0; i < 3; i++) await rep();
await ev('ER.hold(true); ER.step(0.25)'); await shot('17-glamour'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
await ev('ER.go("gyms"); ER.step(0.05)'); await shot('18-gyms-banned');
const cansBefore = await ev('ER.S.cans');
await click(136, 324); check(await ev('ER.S.disguise.podval') === true && await ev('ER.S.gym') === 'podval' && await ev('ER.S.cans') === cansBefore - 40, 'вернулся в подвал в усах за 40 банок');
await click(420, 190); for (let i = 0; i < 2; i++) await rep(); await ev('ER.step(0.6)');
await shot('19-disguise-set');
await ev('ER.go("title"); ER.step(0.1)'); await shot('20-title-disguise');

// 4. Экран «Звуки»: послушать и выключить вариант
await click(106, 30); check(await ev('ER.state') === 'sounds', 'кнопка «Звуки» → экран вариантов');
await click(120, 103); await ev('ER.step(0.2)'); await shot('21-sounds');
await click(252, 103); check(await ev('ER.S.voiceOff.op') === true, 'галочка выключает вариант «Оп!»');
await click(252, 103); check(!(await ev('ER.S.voiceOff.op')), 'повторный тап включает обратно');

// 5. Прокачанный герой и мотиватор: в дожиме выбегает качок, усталость в ноль, штанга уходит наверх
await ev('ER.forceCall(false)');
await ev('ER.S.chest = 90; ER.S.arms = 40; ER.S.gym = "school"; ER.S.cans = 200; ER.startSet(110, 6, false)');
await ev(REP); await ev('ER.hold(true); ER.step(0.3)'); await shot('22-buff-set'); await ev('ER.hold(false); ER.step(0.6)');
n = 0; do { r = await rep(); n++; } while (r.mode === 'lift' && n < 30);
check(r.mode === 'push', 'тяжёлый подход дошёл до дожима');
await click(705, 29); check(await ev('ER.R.mode') === 'motiv' && await ev('ER.S.cans') === 150, 'кнопка «Мотивация» за 50 банок → выбегает качок');
await ev('ER.step(1.0)'); await shot('23-bro');
await ev('ER.step(1.4)'); r = await ev('({ mode: ER.R.mode, fat: ER.R.fat, legend: ER.R.legend, bro: !!ER.R.bro })');
check((r.mode === 'lift' || r.mode === 'ask') && r.fat === 0 && r.legend === 1 && r.bro, 'мотивация: дожим гарантирован, усталость в ноль, качок ещё позирует (' + JSON.stringify(r) + ')');
await ev('ER.step(0.5)'); await shot('24-bro-after');
await ev('ER.go("title"); ER.step(0.1)'); await shot('25-buff-title');

// 6. Громкость и музыка (эхо зала и музыка считаются в фоне)
await ev('ER.pause(false)'); await sleep(3500);
const info = await ev('ER.audioInfo()'), loud = await ev('ER.loud()');
check(info.music && info.music.dur > 20, 'музыка зала посчитана (' + (info.music ? info.music.dur : 0) + ' с)');
const off = Object.entries(loud).filter(([k, v]) => k !== 'thud' && Math.abs(v) > 1.5);
log('  громкость относительно цели, дБ:', Object.entries(loud).map(([k, v]) => k + ' ' + v).join(', '));
check(off.length === 0, 'все звуки одной громкости (±1,5 дБ)' + (off.length ? ': ' + off.map(([k, v]) => k + ' ' + v).join(', ') : ''));

log('\nОшибки страницы: ' + (errors.length ? '\n' + errors.join('\n') : 'нет'));
log('Снимки: ' + OUT);
ws.close(); ch.kill();
process.exit(errors.length ? 2 : 0);
