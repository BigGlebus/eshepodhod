# «Ещё разок!» (рабочее название)

Личная мобильная игра про качалку — пока стадия макетов. Горизонтальный экран 844×390, PWA на canvas, как «Звукач» (`..\zvukach`).

- `mockups/index.html` — страница с макетами семи экранов, механиками с галочками и вопросами. Открывается двойным щелчком в браузере (нужен интернет для шрифтов).
- `mockups/png/` — те же экраны картинками 1688×780.
- `MECHANICS.md` — механики, качалки, план прототипа, вопросы.

Пересобрать картинки (Git Bash, из папки `mockups`):

```bash
for s in hub plan set push fail done map; do "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --mute-audio --force-device-scale-factor=2 --window-size=844,390 --virtual-time-budget=6000 --screenshot="$(pwd -W)/png/$s.png" "file:///$(pwd -W)/index.html?shot=$s"; done
```

Ничего не опубликовано. Если выкладывать — на личный GitHub BigGlebus (как «Звукач»), отдельно настроив вход в этой папке.
