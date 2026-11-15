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
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/obosralsya|lightweight|final.wav|favicon|sw\.js|manifest|icon-|apple-touch/.test(d.params.entry.text + ' ' + (d.params.entry.url || ''))) errors.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
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
  ER.hold(true); for (let i = 0; i < 600 && ER.R.pos < 1 && ER.R.mode === 'lift' && !ER.tipId; i++) ER.step(1/60);
  ER.hold(false);
  if (ER.R.mode !== 'lift' || ER.tipId) return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2), tip: ER.tipId };
  for (let i = 0; i < 200 && ER.R.pos > 0 && !ER.tipId; i++) ER.step(1/60); ER.step(1/60);
  return { mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) }; })()`;
// «Ещё разок?»: в первый раз — снимок и настоящий тап по «ДАВАЙ!», дальше соглашаемся программно
let askSeen = false;
async function rep() {
  const r = await ev(REP);
  if (r.mode !== 'ask') return r;
  if (!askSeen) {
    askSeen = true; await ev('ER.step(0.4)'); await shot('05b-ask');
    await click(348, 233); check(await ev('ER.R.mode') === 'lift' && await ev('ER.R.bonus') === 1.5, '«Ещё разок?» → «ДАВАЙ!» включает ×1,5 на следующий повтор');
  } else await ev('ER.more(true)');
  return { ...r, mode: 'lift' };
}

// 1. Первый запуск: обучение. Каждая подсказка ставит игру на паузу и ждёт «ПОНЯЛ»
await shot('01-title');
const tipShots = { energy: '02-tip-energy', plans: '02b-tip-plans', prep: '02c-tip-prep', lift: '03-tip-lift', catch: '04-tip-catch', yellow: '05-tip-yellow', push: '06-tip-push' };
const tipsSeen = [];
async function closeTips() {
  let t;
  while ((t = await ev('ER.tipId'))) {
    tipsSeen.push(t);
    if (tipShots[t]) { await ev('ER.step(0.3)'); await shot(tipShots[t]); }   // окно подсказки проявляется за 0,2 с
    const b = await ev('ER.tipBtn()'); await click(b[0], b[1]);
  }
}
await click(612, 231); check(await ev('ER.state') === 'gyms' && await ev('ER.tipId') === 'gyms', '«Играть» → выбор качалки, тренер объясняет');
check(!(await ev('ER.tipSkipBtn()')), 'в первый раз обучение не пропустить');
const ai = await ev('ER.audioInfo()');
check(ai && Object.keys(ai).filter((k) => k.startsWith('v_')).length === 4 && Object.entries(ai).filter(([k]) => k.startsWith('v_')).every(([, v]) => v.nan === 0 && v.peak > 0.2), '2 голоса × 2 дубля синтезированы без сбоев');
await closeTips();
await click(119, 328); check(await ev('ER.state') === 'plan', 'двор → выбор плана');
await closeTips();
check(tipsSeen.join() === 'gyms,energy,plans', 'подсказки про качалки, энергию и планы (' + tipsSeen.join() + ')');
await click(150, 190); await closeTips();   // в обучении — лёгкий план, чтобы точно дошло до «Ещё разок?»
check(tipsSeen.includes('prep'), 'на подготовке — подсказка про еду и добавки');
await click(725, 352); check(await ev('ER.state') === 'set' && await ev('ER.R.tut') && await ev('ER.S.gym') === 'dvor', 'первый подход — обучающий, во дворе');
await ev('ER.step(0.7)');
const t0 = await ev('ER.R.t'); await ev('ER.hold(true); ER.step(1); ER.hold(false)');
check(await ev('ER.tipId') === 'lift' && await ev('ER.R.t') === t0 && await ev('ER.R.pos') === 0, 'подсказка «как жать»: игра стоит, пока не нажмёшь «ПОНЯЛ»');
await closeTips();
let r; let n = 0;
for (n = 0; n < 90; n++) {
  await closeTips();
  if (await ev('ER.R.mode') === 'push') break;
  r = await rep();
  if (n === 3) { await closeTips(); await ev('ER.hold(true); ER.step(0.25)'); await shot('04b-press'); await ev('ER.hold(false); ER.step(0.8)'); }
}
await closeTips();
r = await ev('({ mode: ER.R.mode, reps: ER.R.reps, fat: +ER.R.fat.toFixed(2) })');
const ti = (id) => tipsSeen.indexOf(id);
check(ti('catch') > 0 && ti('yellow') > ti('catch') && ti('push') > ti('yellow'), 'по ходу подхода: ловить внизу → жёлтая зона → дожим (' + tipsSeen.join() + ')');
check(askSeen, 'после плана появился вопрос «Ещё разок?»');
check(r.mode === 'push', 'усталость 100% → дожим (' + JSON.stringify(r) + ')');
await ev('ER.R.pos = 0.4');   // штанга встала посередине — чтобы проверка не зависела от того, где именно кончились силы
for (let i = 0; i < 5; i++) await ev('ER.tap(600 + Math.random() * 120, 240 + Math.random() * 60); ER.step(0.12)');
await shot('07-push');
const burl = await ev('ER.R.burl'); check(burl > 0.2 && burl < 1, 'тапы поднимают Бурлометр (' + burl.toFixed(2) + ')');
check(await ev('ER.S.gym') === 'dvor' && await ev('ER.R.spotLeft') === 0, 'новичок начинает во дворе — страховки нет, дожимает сам');
r = await ev(`(() => { ER.R.burl = 0.1; for (let i = 0; i < 80 && ER.R.mode === 'push'; i++) { ER.tap(600, 260); ER.step(0.08); } ER.step(0.3); return { mode: ER.R.mode, legend: ER.R.legend }; })()`);
await shot('08-legend');
check(r.mode === 'ask' && r.legend === 1, 'дожал тапами — легенда ×3, снова «Ещё разок?» (' + JSON.stringify(r) + ')');
await ev('ER.step(0.4)'); await click(533, 233); check(await ev('ER.R && ER.R.mode') === 'racked' || await ev('ER.state') === 'done', '«ХВАТИТ» ставит штангу');
await ev('ER.step(1)'); check(await ev('ER.state') === 'done', 'итоги после стойки');
await ev('ER.step(1.4)'); await shot('09-done');
const d1 = await ev('({ reps: ER.DONE.reps, over: ER.DONE.over, chest: +ER.DONE.chestG.toFixed(1), plan: ER.DONE.planDone, cans: ER.DONE.cansG, tut: ER.S.tutDone })');
log('  итоги обучения:', JSON.stringify(d1)); check(d1.tut && d1.chest > 0 && d1.over > 0, 'мышцы выросли, есть повторы сверх плана, обучение пройдено');

// 2. План «на грани» и авария
await ev('ER.autoTips(true); ER.S.tips.spotpush = true; ER.S.chest = 90; ER.S.arms = 40; ER.S.gym = "podval"; ER.S.energy = 100');   // дальше герой — машина, открыты все залы; подсказки закрываются сами
await click(705, 352); check(await ev('ER.state') === 'plan', '«Ещё подход» → выбор плана');
await shot('10-plan');
const plans = await ev('ER.PLANS.map((p) => p.weight + "×" + p.reps + " " + p.fc.word)'); log('  планы:', plans.join(' | '));
await ev('ER.forceCall(true); ER.forceDrop(false)');   // в этом дожиме у соседа звонит телефон, и он не сбрасывает
await click(700, 190); check(await ev('ER.state') === 'prep', 'тап по плану → экран подготовки');
await shot('10a-prep');
await click(725, 352); check(await ev('ER.state === "set" && ER.R.target') === 7, 'тап по третьей карточке → подход «на грани»');
n = 0; do { r = await rep(); n++; } while (r.mode === 'lift' && n < 40);
check(r.mode === 'push', 'дошли до дожима (' + r.reps + ' повторов)');
check(!!(await ev('ER.R.call')), 'в дожиме у соседа зазвонил телефон');
await ev('ER.step(1.2); ER.R.pos = 0.4');   // клик по занятой кнопке — это тоже тап; штанга пониже, чтобы он её не дожал
await click(44, 344);
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
await click(321, 328); check(await ev('ER.state === "plan" && ER.S.gym') === 'school', 'переход в школьный спортзал');
await click(420, 190); await click(725, 352); for (let i = 0; i < 3; i++) await rep();
await ev('ER.hold(true); ER.step(0.25)'); await shot('16-school'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
check(await ev('ER.S.bans.podval') === 2, 'тренировка в школе сократила изгнание до 2');
await ev('ER.S.gym = "glamour"; ER.goPlan(); ER.startSet(ER.PLANS[1].weight, ER.PLANS[1].reps, false)');
for (let i = 0; i < 3; i++) await rep();
await ev('ER.hold(true); ER.step(0.25)'); await shot('17-glamour'); await ev('ER.hold(false); ER.step(0.6); ER.rackBar(); ER.step(1.5)');
await ev('ER.go("gyms"); ER.step(0.05)'); await shot('18-gyms-banned');
const cansBefore = await ev('ER.S.cans'); await ev('ER.S.energy = 100');
await click(725, 328); check(await ev('ER.S.disguise.podval') === true && await ev('ER.S.gym') === 'podval' && await ev('ER.S.cans') === cansBefore - 40, 'вернулся в подвал в усах за 40 банок');
await click(420, 190); await click(725, 352); for (let i = 0; i < 2; i++) await rep(); await ev('ER.step(0.6)');
await shot('19-disguise-set');
await ev('ER.go("title"); ER.step(0.1)'); await shot('20-title-disguise');

// 4. Экран «Звуки»: послушать и выключить вариант
await click(106, 30); check(await ev('ER.state') === 'sounds', 'кнопка «Звуки» → экран вариантов');
await click(120, 103); await ev('ER.step(0.2)'); await shot('21-sounds');
await click(252, 103); check(await ev('ER.S.voiceOff.yygh') === true, 'галочка выключает вариант «Ыыыгх»');
await click(252, 103); check(!(await ev('ER.S.voiceOff.yygh')), 'повторный тап включает обратно');

// 5. Прокачанный герой и мотиватор: только в дожиме, штанга гарантированно уходит наверх, силы не восстанавливаются
await ev('ER.forceCall(false)');
await ev('ER.S.chest = 90; ER.S.arms = 40; ER.S.gym = "school"; ER.S.cans = 200; ER.S.broOpen = true; ER.startSet(110, 6, false)');
await ev(REP); await ev('ER.hold(true); ER.step(0.3)'); await shot('22-buff-set'); await ev('ER.hold(false); ER.step(0.6)');
await click(705, 29); check(await ev('ER.R.mode') === 'lift' && await ev('ER.S.cans') === 200, 'вне дожима кнопки «Мотивация» нет');
for (n = 0; n < 2; n++) await rep();   // пара честных повторов, дальше силы кончаются на подъёме — без случайной аварии на груди
r = await ev('(() => { ER.R.fat = 0.995; ER.R.started = true; ER.hold(true); for (let i = 0; i < 300 && ER.R.mode === "lift"; i++) ER.step(1/60); ER.hold(false); return { mode: ER.R.mode }; })()');
check(r.mode === 'push', 'тяжёлый подход дошёл до дожима');
await click(705, 29); check(await ev('ER.R.mode') === 'motiv' && await ev('ER.S.cans') === 150, 'в дожиме «Мотивация» за 50 банок → выбегает качок');
await ev('ER.step(1.0)'); await shot('23-bro');
await ev('ER.step(1.4)'); r = await ev('({ mode: ER.R.mode, fat: ER.R.fat, legend: ER.R.legend, bro: !!ER.R.bro })');
check((r.mode === 'lift' || r.mode === 'ask') && r.fat > 0.9 && r.legend === 1 && r.bro, 'мотивация: дожим гарантирован, силы не восстановлены (' + JSON.stringify(r) + ')');
await ev('ER.step(0.5)'); await shot('24-bro-after');
await ev('ER.go("title"); ER.step(0.1)'); await shot('25-buff-title');

// 5б. Задержка штанги: наверху почти бесплатно, на груди — дорого; передержал — придавило
await ev('ER.forceCall(false); ER.S.gym = "school"; ER.startSet(60, 4, false)');
await ev(REP);   // после первого жима задержки начинают стоить сил
r = await ev('(() => { ER.hold(true); for (let i = 0; i < 300 && ER.R.pos < 1; i++) ER.step(1/60); const f0 = ER.R.fat; ER.step(3); const f1 = ER.R.fat; ER.hold(false); return [f0, f1]; })()');
check(r[1] - r[0] < 0.05, 'держать наверху 3 с почти бесплатно (+' + (r[1] - r[0]).toFixed(3) + ')');
r = await ev('(() => { for (let i = 0; i < 120 && ER.R.pos > 0; i++) ER.step(1/60); const f0 = ER.R.fat; ER.step(1); return [f0, ER.R.fat]; })()');
check(r[1] - r[0] > 0.05, 'штанга на груди 1 с — силы заметно уходят (+' + (r[1] - r[0]).toFixed(3) + ')');
await ev('ER.step(0.3)'); await shot('25b-chest');
await ev('ER.step(8)'); check(await ev('ER.R.mode') === 'crash', 'передержал штангу на груди — придавило');

// 5в. Шкала попадания внизу: в зелёном повтор дешевле, рано и поздно — дороже, но засчитывается; выше шкалы — не считается
await ev('ER.S.gym = "school"; ER.S.chest = 0; ER.S.arms = 0; ER.startSet(40, 20, false)');
r = await ev(`(() => {
  const up = () => { ER.hold(true); for (let i = 0; i < 600 && ER.R.pos < 1 && ER.R.mode === 'lift'; i++) ER.step(1/60); };
  const down = (to) => { ER.hold(false); for (let i = 0; i < 300 && ER.R.pos > to; i++) ER.step(1/60); };
  const o = {}; up();
  down(0); ER.step(1/60); let f0 = ER.R.fat; up(); o.perfect = ER.R.fat - f0;
  down(0.3); f0 = ER.R.fat; up(); o.early = ER.R.fat - f0;
  down(0); ER.step(0.4); f0 = ER.R.fat; up(); o.late = ER.R.fat - f0;
  down(0.7); f0 = ER.R.reps; up(); o.high = ER.R.reps - f0;
  o.hits = ER.R.hits; o.reps = ER.R.reps; o.mode = ER.R.mode; return o; })()`);
log('  шкала:', JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
check(r.hits.perfect >= 1 && r.hits.early >= 1 && r.hits.late >= 1 && r.reps === 4 && r.high === 0, 'рано, в зелёном и поздно — повтор засчитан; выше шкалы — нет');
check(r.perfect < r.early && r.perfect < r.late, 'в зелёном повтор дешевле, чем рано или поздно');
await ev('ER.hold(false); for (let i = 0; i < 300 && ER.R.pos > 0.15; i++) ER.step(1/60)'); await shot('25c-gauge');
await ev('for (let i = 0; i < 60 && ER.R.pos > 0; i++) ER.step(1/60); ER.hold(true); ER.step(0.15)'); await shot('25d-gauge-hit'); await ev('ER.hold(false)');

// 5г. Сброс прогресса
await ev('ER.go("title"); ER.S.chest = 50; ER.S.cans = 333; ER.S.bans = { podval: 2 }; ER.step(0.05)');
await click(62, 348); check(await ev('ER.state') === 'reset', 'кнопка «Сброс» → вопрос «Обнулить всё?»');
await shot('26-reset');
await click(520, 261); r = await ev('({ st: ER.state, chest: ER.S.chest, cans: ER.S.cans, bans: Object.keys(ER.S.bans).length, tut: ER.S.tutEver && !ER.S.tutDone, en: ER.S.energy, gym: ER.S.gym })');
check(r.st === 'title' && r.chest === 0 && r.cans === 50 && r.bans === 0 && r.tut && r.en === 100 && r.gym === 'dvor', 'сброс обнулил мышцы, банки и изгнания; обучение заново, но с пропуском (' + JSON.stringify(r) + ')');

// 5д. Двор: пускают всегда, страховки нет, авария без изгнания; усы — только за банки
await ev('ER.S.chest = 90; ER.S.arms = 40; ER.S.bans = { podval: 3, school: 3, glamour: 3 }; ER.S.cans = 10; ER.go("gyms"); ER.step(0.05)');
await shot('27-gyms-4');
await click(725, 328); check(!(await ev('ER.S.disguise.podval')) && await ev('ER.S.cans') === 10, 'без 40 банок в усах не пускают');
await click(119, 328); check(await ev('ER.state === "plan" && ER.S.gym') === 'dvor', 'во двор пускают всегда');
await click(420, 190); await click(725, 352); check(await ev('ER.state') === 'set' && await ev('ER.R.spotLeft') === 0, 'во дворе страховки нет — помочь некому');
await ev(REP); await ev('ER.hold(true); ER.step(0.25)'); await shot('28-yard-set'); await ev('ER.hold(false); ER.step(0.3)');
await ev('ER.crash(); ER.step(4.2)'); await shot('29-yard-crash');
check(!(await ev('ER.S.bans.dvor')), 'авария во дворе — никто не выгоняет');
await click(353, 238); check(await ev('ER.state') === 'plan', 'после аварии во дворе — сразу ещё подход');

// 5е. Реакция зала на выполненный план
const react = async (gym, word, target, reps, name) => {
  await ev(`ER.S.gym = "${gym}"; ER.startSet(50, ${target}, false); ER.R.word = "${word}"; ER.R.reps = ${reps}; ER.R.gains = 10; ER.rackBar(); ER.step(1); ER.step(1.4)`);
  if (name) await shot(name);
  return ev('({ react: ER.DONE.react, bonus: ER.DONE.reactCans })');
};
r = await react('school', 'ХАЛЯВА', 3, 3, '30-react-laugh'); check(r.react === 'laugh' && r.bonus === 0, 'халяву закрыл — зал смеётся');
r = await react('school', 'НОРМ', 4, 4, ''); check(r.react === null, 'норм закрыл — без реакции');
r = await react('podval', 'ОБОСРЁШЬСЯ', 5, 5, '31-react-respect'); check(r.react === 'respect' && r.bonus === 20, 'тяжёлый план — уважение, +20 банок');
r = await react('glamour', 'НОРМ', 4, 7, '32-react-machine'); check(r.react === 'machine' && r.bonus === 40, 'сильно сверх плана — «ты машина», +40 банок');
r = await react('dvor', 'ОБОСРЁШЬСЯ', 5, 9, ''); check(r.react === null, 'во дворе реагировать некому');

// 5ж. Подготовка: еда (энергия) и добавка — можно вместе
await ev('ER.S.bans = {}; ER.S.gym = "school"; ER.S.cans = 100; ER.S.energy = 10; ER.goPlan(); ER.step(0.05)');
await click(420, 190); await shot('33a-prep-noenergy');
await click(725, 352); check(await ev('ER.state') === 'prep', 'без энергии и без еды подход не начать');
await click(321, 130); await click(725, 352);
r = await ev('({ st: ER.state, food: ER.R && ER.R.food, cans: ER.S.cans, en: ER.S.energy })');
check(r.st === 'set' && r.food === 'shawa' && r.cans === 100 && r.en === 30, 'шаурма бесплатно: +50 энергии, подход −30 (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('33-prep-chip');
await ev('ER.S.energy = 0; ER.S.cans = 100; ER.goPlan(); ER.step(0.05)'); await click(420, 190); await click(523, 130); await click(725, 260); await ev('ER.step(0.05)'); await shot('33d-prep-combo'); await click(725, 352);
r = await ev('({ st: ER.state, food: ER.R && ER.R.food, supp: ER.R && ER.R.supp, cans: ER.S.cans, en: ER.S.energy, pk: ER.R && ER.R.pushK })');
check(r.st === 'set' && r.food === 'banana' && r.supp === 'test' && r.cans === 25 && r.en === 20 && r.pk === 2, 'без энергии: бананы (15) и тестостерон (60) вместе (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('33e-chip-combo');
await ev('ER.S.energy = 0; ER.S.cans = 40; ER.goPlan(); ER.step(0.05)'); await click(420, 190); await click(725, 130); await click(725, 352);
r = await ev('({ st: ER.state, food: ER.R && ER.R.food, cans: ER.S.cans, en: ER.S.energy })');
check(r.st === 'set' && r.food === 'smoothie' && r.cans === 10 && r.en === 70, 'смузи за 30 банок: +100 энергии (' + JSON.stringify(r) + ')');
await ev('ER.S.cans = 20; ER.S.energy = 100; ER.goPlan(); ER.step(0.05)'); await click(420, 190); await click(321, 260); await click(725, 352);
r = await ev('({ st: ER.state, supp: ER.R && ER.R.supp, cans: ER.S.cans, pk: ER.R && ER.R.pushK })');
check(r.st === 'set' && r.supp === 'bcaa' && r.cans === 5 && r.pk === 1.25, 'BCAA за 15 банок: дожим +25% (' + JSON.stringify(r) + ')');
await ev('ER.S.cans = 20; ER.S.energy = 100; ER.goPlan(); ER.step(0.05)'); await click(420, 190); await click(725, 260); await click(725, 352);
check(await ev('ER.state') === 'prep' && await ev('ER.S.cans') === 20, 'на тестостерон (60) не хватает банок — «ЖАТЬ» неактивна');
r = await ev(`(() => { ER.forceShawa(true); ER.startSet(60, 20, false, 'shawa'); ER.R.fat = 0.995; ER.R.started = true; ER.hold(true);
  for (let i = 0; i < 300 && ER.R.mode === 'lift'; i++) ER.step(1/60); ER.hold(false); const pm = ER.R.mode;
  for (let i = 0; i < 420 && ER.R.mode === 'push'; i++) ER.step(1/60); ER.forceShawa(null);
  return { pm, mode: ER.R.mode, fail: !!ER.R.shawaFail, pushT: +ER.R.pushT.toFixed(2) }; })()`);
check(r.pm === 'push' && r.mode === 'crash' && r.fail, 'шаурма: в дожиме внезапно обосрался (' + JSON.stringify(r) + ')');
await ev('ER.step(1.6)'); await shot('33b-shawa-crash'); await ev('ER.step(2.4)'); await shot('33c-shawa-card');
r = await ev(`(() => { ER.forceCramp(true); ER.startSet(40, 20, false, 'creatine'); ER.R.fat = 0.65; ER.R.started = true; ER.hold(true);
  let on = false; for (let i = 0; i < 200 && !on; i++) { ER.step(1/60); on = !!(ER.R.cramp && ER.R.cramp.on); }
  const p0 = ER.R.pos; ER.step(0.3); const p1 = ER.R.pos; ER.hold(false); ER.forceCramp(null); return { on, p0, p1 }; })()`);
check(r.on && r.p1 === r.p0, 'креатин: судорога — штанга замерла (' + JSON.stringify(r) + ')');
r = await ev(`(() => { ER.forceDope(true); ER.S.gym = 'school'; ER.S.bans = {}; ER.startSet(50, 3, false, 'test'); ER.R.reps = 3; ER.R.gains = 10; ER.rackBar(); ER.step(1); ER.step(1.4); ER.forceDope(null);
  return { doped: ER.DONE.doped, ban: ER.S.bans.school, pk: ER.R.pushK, cramp: ER.R.supp === 'test' }; })()`);
await shot('34-doping');
check(r.doped && r.ban === 3 && r.pk === 2, 'тестостерон: дожим ×2, допинг-контроль выгнал на 3 тренировки (' + JSON.stringify(r) + ')');
const TAP = (supp) => `(() => { ER.S.gym = 'school'; ER.startSet(60, 20, false, '${supp}'); ER.step(0.7); ER.R.fat = 0.995; ER.R.started = true; ER.hold(true); for (let i = 0; i < 300 && ER.R.mode === 'lift'; i++) ER.step(1/60); ER.hold(false); ER.R.burl = 0; ER.R.pos = 0.4; ER.tap(600, 260); return +(ER.R.pos - 0.4).toFixed(4); })()`;
const d0 = await ev(TAP('none')), d2 = await ev(TAP('test'));
check(Math.abs(d2 / d0 - 2) < 0.01, 'тестостерон: тап в дожиме толкает вдвое сильнее (' + d0 + ' → ' + d2 + ')');

// 5з. Костюмы по стадиям
await ev('ER.S.bans = {}; ER.S.chest = 0; ER.S.arms = 0; ER.S.outfit = "dryshch"; ER.go("title"); ER.step(0.05)');
await click(612, 293); check(await ev('ER.state') === 'wardrobe', 'кнопка «Костюмы» → гардероб');
await click(725, 346); check(await ev('ER.S.outfit') === 'dryshch', 'дрищу трико пауэрлифтера не дают');
await ev('ER.S.chest = 90; ER.S.arms = 40; ER.S.club100 = true; ER.step(0.05)'); await shot('35-wardrobe');
await click(725, 346); check(await ev('ER.S.outfit') === 'shkaf', 'шкаф надевает трико пауэрлифтера');
await ev('ER.S.gym = "school"; ER.startSet(100, 6, false); ER.step(0.6)'); await ev(REP); await ev('ER.hold(true); ER.step(0.25)'); await shot('36-outfit-shkaf'); await ev('ER.hold(false)');
await ev('ER.S.outfit = "krepysh"; ER.startSet(100, 6, false); ER.step(0.6)'); await ev(REP); await ev('ER.hold(true); ER.step(0.25)'); await shot('37-outfit-krepysh'); await ev('ER.hold(false)');
await ev('ER.go("title"); ER.step(0.1)'); await shot('38-title-krepysh');
r = await ev(`(() => { ER.S.chest = 26; ER.S.arms = 0; ER.S.outfit = 'dryshch'; ER.S.gym = 'dvor'; ER.startSet(40, 3, false); ER.R.reps = 3; ER.R.gains = 5; ER.rackBar(); ER.step(1); ER.step(1.6);
  return { up: ER.DONE.stageUp, outfit: ER.S.outfit, name: ER.DONE.newOutfit, gym: ER.DONE.newGym }; })()`);
await shot('39-new-outfit');
check(r.up && r.outfit === 'krepysh' && r.gym === 'school', 'крепыш: новый костюм надевается сам, открывается школьный зал (' + JSON.stringify(r) + ')');

// 5и. Залы по стадиям и быстрый старт дрища
r = await ev(`(() => { ER.S.chest = 0; ER.S.arms = 0; ER.S.bans = {}; ER.S.disguise = {}; ER.S.gym = 'dvor'; return { school: ER.gymOpen('school'), dvor: ER.gymOpen('dvor') }; })()`);
check(!r.school && r.dvor, 'дрищу открыта только улица');
await ev('ER.go("gyms"); ER.step(0.05)'); await shot('40-gyms-dryshch');
await click(321, 328); check(await ev('ER.state') === 'gyms', 'в закрытую школу не пускают');
r = await ev(`(() => { ER.startSet(40, 3, false); ER.R.reps = 3; ER.R.gains = 4; ER.rackBar(); ER.step(1); return +ER.DONE.chestG.toFixed(2); })()`);
check(Math.abs(r - 4 * 1.25 * 2 * 0.7) < 0.01, 'дрищ растёт вдвое быстрее (+' + r + ')');
r = await ev(`(() => { ER.S.chest = 21; ER.S.arms = 9; const o = {}; for (const id of ['dvor', 'school', 'glamour', 'podval']) o[id] = ER.gymOpen(id); return o; })()`);
check(r.dvor && r.school && r.glamour && !r.podval, 'крепышу открыты улица, школа и фитнес, «Железяка» — с качка (' + JSON.stringify(r) + ')');
r = await ev(`(() => { ER.S.chest = 50.4; ER.S.arms = 21.6; return ['dvor', 'school', 'glamour', 'podval'].every((id) => ER.gymOpen(id)); })()`);
check(r, 'качку открыты все залы');

// 5к. Подсказки в залах: сосед, страховка без телефона, звонок, мотивация; уведомления; пропуск обучения
await ev('ER.autoTips(false); ER.S.tips = { energy: true, plans: true, prep: true, lift: true, catch: true, yellow: true, push: true }; ER.S.tutDone = true; ER.S.bans = {}; ER.S.disguise = {}; ER.S.chest = 90; ER.S.arms = 40; ER.S.broOpen = false; ER.forceCall(true)');
const PUSH = `(() => { ER.step(0.7); const pre = ER.tipId; if (pre) return { pre }; ER.R.fat = 0.995; ER.R.started = true; ER.hold(true); for (let i = 0; i < 300 && ER.R.mode === 'lift' && !ER.tipId; i++) ER.step(1/60); ER.hold(false); return { mode: ER.R.mode, tip: ER.tipId, call: !!ER.R.call, open: ER.S.broOpen }; })()`;
await ev('ER.S.gym = "school"; ER.startSet(80, 20, false)');
r = await ev(PUSH); check(r.pre === 'spot', 'первый раз с соседом — подсказка про страховку (' + JSON.stringify(r) + ')'); await ev('ER.step(0.3)'); await shot('41-tip-spot'); await ev('ER.closeTip()');
r = await ev(PUSH); check(r.mode === 'push' && r.tip === 'spotpush' && !r.call, 'первый дожим с соседом: «зови страховку», телефон молчит (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('42-tip-spotpush'); await ev('ER.closeTip()');
await ev('ER.startSet(80, 20, false)'); r = await ev(PUSH); check(r.tip === 'call' && r.call, 'сосед впервые на телефоне — подсказка (' + JSON.stringify(r) + ')'); await ev('ER.closeTip(); ER.forceCall(false)');
await ev('ER.startSet(80, 20, false)'); r = await ev(PUSH); check(!r.open && !r.tip, 'до «Железяки» мотивации нет (' + JSON.stringify(r) + ')');
await ev('ER.S.gym = "podval"; ER.startSet(80, 20, false)'); r = await ev(PUSH); check(r.open && r.tip === 'bro', 'в «Железяке» мотивация открылась — подсказка (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('43-tip-bro'); await ev('ER.closeTip()');
r = await ev(`(() => { ER.S.chest = 26; ER.S.arms = 0; ER.S.gym = 'dvor'; ER.startSet(40, 3, false); ER.R.reps = 3; ER.R.gains = 5; ER.rackBar(); ER.step(1); ER.step(1.8); return { tip: ER.tipId, gym: ER.DONE.newGym, gyms: ER.DONE.newGyms.join() }; })()`);
check(r.tip === 'newgym' && r.gyms === 'school,glamour', 'крепыш: открылись школа и фитнес — уведомление (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('44-tip-newgym'); await ev('ER.closeTip()');
const CLUB = `(() => { ER.S.chest = 90; ER.S.arms = 40; ER.S.gym = 'school'; ER.startSet(100, 3, false); ER.R.reps = 3; ER.R.gains = 5; ER.rackBar(); ER.step(1); ER.step(1.8); return { tip: ER.tipId, club: ER.S.club100 }; })()`;
await ev('ER.S.club100 = false'); r = await ev(CLUB);
check(r.tip === 'club100' && r.club, 'первый рабочий подход на 100 кг — «ты теперь в клубе за 100» (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('45-tip-club100'); await ev('ER.flushTips()');
r = await ev(CLUB); check(r.tip !== 'club100', 'клуб «За 100» поздравляет один раз'); await ev('ER.flushTips()');
await ev('ER.closeTip(); ER.S.tips = {}; ER.S.tutEver = true; ER.S.tutDone = false; ER.go("title"); ER.goPlan(); ER.step(0.05)');
check(await ev('ER.tipId') === 'energy' && !!(await ev('ER.tipSkipBtn()')), 'обучение уже проходил — можно пропустить');
await ev('ER.step(0.3)'); await shot('46-tip-skip'); const sb = await ev('ER.tipSkipBtn()'); await click(sb[0], sb[1]);
check(!(await ev('ER.tipId')) && await ev('ER.S.tips.push') === true, '«Пропустить обучение» убирает все подсказки');
await ev('ER.autoTips(true)');

// 5л. Прокачка: за подход — не больше доли стадии
r = await ev(`(() => { ER.S.chest = 21; ER.S.arms = 9; ER.S.gym = 'school'; ER.startSet(50, 3, false); ER.R.reps = 9; ER.R.legend = 2; ER.R.gains = 200; ER.rackBar(); ER.step(1); return { grow: +(ER.DONE.chestG + ER.DONE.armsG).toFixed(2), up: ER.DONE.stageUp }; })()`);
check(r.grow <= 42 * 0.28 + 0.01 && !r.up, 'даже очень сильный подход не перескакивает стадию (+' + r.grow + ')');

// 5н. Дожим: передышка, выбор после дожима до плана, особенности залов
await ev('ER.autoTips(true); ER.forceCall(null); ER.forceDrop(null); ER.S.tips.spotpush = true; ER.S.club100 = true; ER.S.chest = 90; ER.S.arms = 40; ER.S.bans = {}');
const PUSH2 = (gym, w, extra = '') => `(() => { ER.S.gym = '${gym}'; ER.startSet(${w}, 7, false); ER.step(0.7); ${extra} ER.R.fat = 0.995; ER.R.started = true; ER.hold(true); for (let i = 0; i < 300 && ER.R.mode === 'lift'; i++) ER.step(1/60); ER.hold(false); return { mode: ER.R.mode, pos: ER.R.pos, call: ER.R.call && ER.R.call.kind, bark: ER.R.bark && [].concat(ER.R.bark.text).join(' '), spot: ER.R.spotLeft, noSpot: ER.R.noSpot }; })()`;
r = await ev(PUSH2('school', 60, 'ER.forceEvent("none");'));
const p0 = r.pos; await ev('ER.step(2)'); const p1 = await ev('ER.R.pos'); await ev('ER.step(0.3)'); await shot('50-push-grace'); await ev('ER.step(1)'); const p2 = await ev('ER.R.pos');
check(r.mode === 'push' && Math.abs(p1 - p0) < 1e-9 && p2 < p1, 'дожим: первые 2,5 с штанга держится, потом опускается (' + [p0, p1, p2].map((v) => v.toFixed(3)).join(' → ') + ')');
r = await ev(`(() => { ER.R.burl = 0; ER.R.reps = 2; ER.R.pos = 0.6; for (let i = 0; i < 80 && ER.R.mode === 'push'; i++) { ER.tap(600, 260); ER.step(0.08); } ER.step(0.4); return { mode: ER.R.mode, reps: ER.R.reps, target: ER.R.target }; })()`);
await shot('51-ask-before-plan');
check(r.mode === 'ask' && r.reps < r.target, 'дожал до плана — выбор «жмём дальше / заканчиваем» (' + JSON.stringify(r) + ')');
r = await ev('(() => { ER.more(true); return { mode: ER.R.mode, bonus: ER.R.bonus }; })()');
check(r.mode === 'lift' && !r.bonus, '«ЖМЁМ ДАЛЬШЕ» до плана — без бонуса ×1,5');
r = await ev(PUSH2('school', 60, 'ER.forceEvent("none"); ER.forceBack(true);'));
r = await ev('(() => { ER.step(3); ER.R.pos = 0.5; ER.R.burl = 0; ER.callSpot(); const b0 = ER.R.pos; ER.step(0.3); return { mode: ER.R.mode, spot: ER.R.spotLeft, back: ER.R.back, bark: ER.R.bark && [].concat(ER.R.bark.text).join(" "), b0 }; })()');
await shot('52-school-back');
check(r.mode === 'push' && r.spot === 0 && r.back && r.bark === 'Ай, спина!', 'школа: у физрука сорвало спину — «Ай, спина!», страховки нет (' + JSON.stringify(r) + ')');
const bk = await ev('(() => { const p1 = ER.R.pos; ER.step(2); const p2 = ER.R.pos; ER.step(0.4); return { p1, p2, p3: ER.R.pos, mode: ER.R.mode, bark: !!ER.R.bark }; })()');
await shot('52b-school-back-fall');
check(Math.abs(bk.p1 - r.b0) < 1e-9 && Math.abs(bk.p2 - r.b0) < 1e-9 && bk.p3 < bk.p2 && bk.mode === 'push' && !bk.bark, 'школа: после «Ай, спина!» штанга 2,5 с держится, потом идёт вниз (' + JSON.stringify(bk) + ')');
await ev('ER.forceBack(null)');
r = await ev(PUSH2('glamour', 80, 'ER.forceEvent("story");')); await ev('ER.step(1)'); await shot('53-glamour-story');
check(r.call === 'story', 'фитнес: тренерша снимает сторис (' + JSON.stringify(r) + ')');
r = await ev(PUSH2('glamour', 110, 'ER.forceEvent("none");')); await ev('ER.step(0.3)'); await shot('54-glamour-heavy');
check(r.noSpot && r.spot === 0 && /сотки/.test(r.bark || ''), 'фитнес: больше 100 кг не страхует (' + JSON.stringify(r) + ')');
r = await ev(PUSH2('podval', 80, 'ER.forceEvent("call"); ER.forceDrop(true);'));
await ev('ER.step(0.3)'); await shot('55-podval-drop');
check(!r.call && r.spot === 1 && /братишку/.test(r.bark || ''), 'Железяка: Толян сбросил звонок и страхует (' + JSON.stringify(r) + ')');
await ev('ER.forceEvent(null); ER.forceDrop(null)');
// 5о. МАШИНА — только после подхода на 100+ кг; шкала сил по стадиям
r = await ev(`(() => { const o = {}; ER.S.chest = 90; ER.S.arms = 40; ER.S.club100 = false; o.gated = ER.stage(); ER.S.club100 = true; o.club = ER.stage(); ER.S.chest = 50.4; ER.S.arms = 21.6; o.k = ER.stage(); return o; })()`);
check(r.gated === 'КАЧОК' && r.club === 'МАШИНА' && r.k === 'КАЧОК', 'мышц на МАШИНУ хватает, но без подхода на 100 кг — КАЧОК (' + JSON.stringify(r) + ')');
r = await ev(`(() => { ER.S.club100 = false; ER.S.chest = 108; ER.S.arms = 50; ER.S.gym = 'school'; ER.startSet(60, 3, false); ER.R.reps = 3; ER.R.gains = 100; ER.rackBar(); ER.step(1); return { total: +(ER.S.chest + ER.S.arms).toFixed(2), stage: ER.stage() }; })()`);
check(r.total <= 160.01 && r.stage === 'КАЧОК', 'без подхода на 100 кг мышцы не растут дальше порога (' + JSON.stringify(r) + ')');
await ev('ER.go("title"); ER.step(0.1)'); await shot('56-title-gate');
const SEE = (c, a, club) => `(() => { ER.S.chest = ${c}; ER.S.arms = ${a}; ER.S.club100 = ${club}; ER.startSet(40, 3, false); return ER.R.see; })()`;
r = [await ev(SEE(0, 0, false)), await ev(SEE(50.4, 21.6, false)), await ev(SEE(84, 36, true))];
check(r[0] === 0.6 && r[1] === 0.85 && r[2] > 1, 'шкала сил: дрищ — зелёная, качок — до жёлтой, машина — вся (' + r.join(', ') + ')');
await ev('ER.S.chest = 50.4; ER.S.arms = 21.6; ER.S.club100 = false; ER.startSet(40, 20, false); ER.R.fat = 0.7; ER.step(0.2)'); await shot('57-meter-kachok');
r = await ev(`(() => { ER.autoTips(false); ER.flushTips(); ER.S.chest = 47; ER.S.arms = 20; ER.S.club100 = false; ER.S.gym = 'school'; ER.startSet(60, 3, false); ER.R.reps = 3; ER.R.gains = 30; ER.rackBar(); ER.step(1); ER.step(1.8); return { tip: ER.tipId, q: ER.tipQueue.join(), stage: ER.stage() }; })()`);
check(r.stage === 'КАЧОК' && r.tip === 'stage2', 'стал КАЧКОМ — «теперь лучше чувствуешь подходы» и условие МАШИНЫ (' + JSON.stringify(r) + ')');
await ev('ER.step(0.3)'); await shot('58-tip-stage2'); await ev('ER.flushTips(); ER.autoTips(true)');

// 5м. ЛЕГЕНДА: последняя стадия → «Ты доказал всем» → «НАГРАДА?» → запись → главное меню; дальше растёт только вес
r = await ev(`(() => { ER.autoTips(true); ER.S.club100 = true; ER.S.chest = 110; ER.S.arms = 50; ER.S.gym = 'school'; ER.S.bans = {}; ER.startSet(60, 3, false); ER.R.reps = 3; ER.R.gains = 30; ER.rackBar(); ER.step(1); ER.step(2.5); return { st: ER.state, up: ER.DONE.legendUp, stage: ER.stage(), flag: ER.S.legend }; })()`);
check(r.st === 'legend' && r.up && r.stage === 'ЛЕГЕНДА' && r.flag, 'дорос до ЛЕГЕНДЫ — экран «ты доказал всем, что ты легенда» (' + JSON.stringify(r) + ')');
await ev('ER.step(0.6)'); await shot('47-legend');
await click(600, 264); check(await ev('ER.legendPlay'), '«НАГРАДА?» — играет запись');
await ev('ER.step(1)'); await shot('48-legend-reward');
await ev('ER.step(3)'); check(await ev('ER.state') === 'title' && !(await ev('ER.legendPlay')), 'запись доиграла — главное меню');
await shot('49-title-legend');
r = await ev(`(() => { const cap0 = ER.S.chest; ER.startSet(60, 3, false); ER.R.reps = 3; ER.R.gains = 10; ER.rackBar(); ER.step(1); ER.step(3); return { st: ER.state, up: ER.DONE.stageUp, legendUp: ER.DONE.legendUp, grow: ER.S.chest - cap0, stage: ER.stage() }; })()`);
check(r.st === 'done' && !r.up && !r.legendUp && r.grow > 0 && r.stage === 'ЛЕГЕНДА', 'дальше — ЛЕГЕНДА без новых стадий, но мышцы и вес растут (' + JSON.stringify(r) + ')');

// 6. Громкость и музыка (эхо зала и музыка считаются в фоне)
await ev('ER.pause(false)'); await sleep(3500);
const info = await ev('ER.audioInfo()'), loud = await ev('ER.loud()');
check(info.music && info.music.dur > 20, 'музыка зала посчитана (' + (info.music ? info.music.dur : 0) + ' с)');
const off = Object.entries(loud).filter(([k, v]) => k !== 'thud' && Math.abs(v) > 1.5);
log('  громкость относительно цели, дБ:', Object.entries(loud).map(([k, v]) => k + ' ' + v).join(', '));
check(off.length === 0, 'все звуки одной громкости (±1,5 дБ)' + (off.length ? ': ' + off.map(([k, v]) => k + ' ' + v).join(', ') : ''));
// голоса героя: ни один не начался, пока не доиграл прежний
const hl = (await ev('ER.heroLog()')).sort((a, b) => a[0] - b[0]);
const overl = hl.filter((x, i) => i > 0 && x[0] < hl[i - 1][1] - 0.001).length;
check(hl.length > 0 && overl === 0, 'звуки героя не накладываются (' + hl.length + ' звуков, наложений ' + overl + ')');
const fmt = (x) => [+x[0].toFixed(3), +x[1].toFixed(3), x[2]];
if (overl) log('  журнал по порядку:', JSON.stringify((await ev('ER.heroLog()')).map(fmt)));
if (overl) log('  наложения:', JSON.stringify(hl.map((x, i) => i > 0 && x[0] < hl[i - 1][1] - 0.001 ? [fmt(hl[i - 1]), fmt(x)] : null).filter(Boolean)));

log('\nОшибки страницы: ' + (errors.length ? '\n' + errors.join('\n') : 'нет'));
log('Снимки: ' + OUT);
ws.close(); ch.kill();
process.exit(errors.length ? 2 : 0);
