"""Сборка версии: python3 build.py v2 → dist/v2/index.html и dist/v2/letters-swarm-console-v2.js"""
import sys
from pathlib import Path

ver = sys.argv[1] if len(sys.argv) > 1 else "v2"
here = Path(__file__).parent
src = here / ver
engine = (src / "engine.js").read_text(encoding="utf-8")
page = (src / "page.html").read_text(encoding="utf-8")
assert "/*__ENGINE__*/" in page
out = here / "dist" / ver
out.mkdir(parents=True, exist_ok=True)
(out / "index.html").write_text(page.replace("/*__ENGINE__*/", engine), encoding="utf-8")
console = engine + """
// Автозапуск: вся страница; закреплённые шапки и меню остаются текстом.
// Буквы поднимаются только около экрана. Esc — выключить и вернуть страницу как было.
LetterSwarm.start(
  document.body,
  { wakeScope: 'near', escToDestroy: true }
);
"""
(out / f"letters-swarm-console-{ver}.js").write_text(console, encoding="utf-8")
print(ver, "ok", (out / "index.html").stat().st_size, "bytes")
