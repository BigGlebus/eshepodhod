# «Ещё подход!»

Личная мобильная игра про качалку. Горизонтальный экран 844×390, PWA на canvas, как «Звукач» (`..\zvukach`).

Играть: https://bigglebus.github.io/eshepodhod/ · код: https://github.com/BigGlebus/eshepodhod

## Что лежит в папке

- `index.html` — сама игра (прототип v19): один файл, весь код внутри. На главном экране «ИГРАТЬ» ведёт к выбору качалки, «ЗВУКИ» — послушать и выключить варианты голоса, значок ноты — музыка, «КОСТЮМЫ» — гардероб, «СБРОС» — обнулить прогресс.
- `sounds/obosralsya.wav` — звук-мем аварии, `sounds/lightweight.wav` — крик мотиватора, `sounds/final.wav` — награда за ЛЕГЕНДУ (переведены из `.ogg` рядом: iPhone может не проиграть Ogg Opus). Новые записи переводятся так: `node tools/to-wav.mjs вход.ogg sounds/имя.wav`.
- `manifest.webmanifest`, `sw.js`, `icon-*.png`, `apple-touch-icon.png` — установка на экран «Домой» и офлайн-кэш (как у «Звукача»).
- `mockups/` — страница с макетами семи экранов и выбором механик; `mockups/png/` — экраны картинками.
- `MECHANICS.md` — механики, что сделано в прототипе, баланс, вопросы.
- `tools/smoke.mjs` — автопроверка без звука; `tools/artifact.mjs` — сборка версии для страницы-артефакта Claude; `tools/balance.mjs` — симуляция баланса: сколько растут мышцы за подход на каждой стадии.
- `tools/mockups-bro.mjs` — макеты мотиватора: рисует все варианты из `BRO_LOOKS` кодом игры в `mockups/png/motivator-variants.png`. Выбранный вариант — `BRO_LOOK` в `index.html`.

## Как запустить

Игру нужно открывать через сервер (с диска браузер не даёт загрузить звук и манифест):

```bash
python -m http.server 5610
```

Потом открыть `http://localhost:5610/`. На компьютере: зажать пробел или мышь — жать, частые нажатия — дожим.

## Автопроверка

```bash
node tools/smoke.mjs
```

Безголовый Chrome без звука проходит обучение, дожим, страховку, аварию, смену качалки и усы; снимки — в `tools/shots/` (в git не идут).

## Версия для страницы-артефакта

```bash
node tools/artifact.mjs
```

Получится `dist/artifact.html` (в git не идёт). Публикуется вместе с `sounds/obosralsya.wav` рядом.

## Обновление версии

Меняй `APP_VERSION` в начале скрипта в `index.html` и `VERSION` в `sw.js`.

Выкладывается на личный GitHub BigGlebus (как «Звукач»): вход и автор настроены в git-конфиге этой папки, после `git push` GitHub Pages обновляется примерно за минуту.

Иконки пересобираются так (Git Bash, из папки проекта):

```bash
for s in 512:icon-512 192:icon-192 180:apple-touch-icon; do n=${s%%:*}; f=${s##*:}; "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --mute-audio --force-device-scale-factor=1 --window-size=$n,$n --virtual-time-budget=4000 --screenshot="$(pwd -W)/$f.png" "file:///$(pwd -W | sed 's/ /%20/g')/index.html?icon=$n"; done
```
