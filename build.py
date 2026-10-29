"""Сборка версии: python3 build.py v2 → dist/v2/index.html и dist/v2/letters-swarm-console-v2.js
Если рядом лежит page.ru.html — ещё и русская версия в dist/v2/ru/ (панель с lang: 'ru')."""
import sys
from pathlib import Path

ver = sys.argv[1] if len(sys.argv) > 1 else "v2"
here = Path(__file__).parent
src = here / ver
engine = (src / "engine.js").read_text(encoding="utf-8")


def build(page_name, out, lang_opt):
    page = (src / page_name).read_text(encoding="utf-8")
    assert "/*__ENGINE__*/" in page
    out.mkdir(parents=True, exist_ok=True)
    # newline="\n": на Windows write_text иначе пишет CRLF и сборка расходится с репозиторием
    (out / "index.html").write_text(page.replace("/*__ENGINE__*/", engine), encoding="utf-8", newline="\n")
    console = engine + """
// Автозапуск: вся страница; закреплённые шапки и меню остаются текстом.
// Буквы поднимаются только около экрана. Esc — выключить и вернуть страницу как было.
LetterSwarm.start(
  document.body,
  { wakeScope: 'near', escToDestroy: true%s }
);
""" % lang_opt
    (out / f"letters-swarm-console-{ver}.js").write_text(console, encoding="utf-8", newline="\n")
    print(ver, out.relative_to(here).as_posix(), "ok", (out / "index.html").stat().st_size, "bytes")


build("page.html", here / "dist" / ver, "")
if (src / "page.ru.html").exists():
    build("page.ru.html", here / "dist" / ver / "ru", ", lang: 'ru'")
