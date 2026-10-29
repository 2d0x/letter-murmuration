"""Реакция стаи на курсор: проход сквозь центр стаи и обратно; сколько птиц оказывается рядом с курсором. v3 против v4."""
import statistics as stt, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
JS = """(args) => {
  const [speed, half] = args;
  const s0 = swarm.snapshot(); let cx = 0, cy = 0, n = 0;
  for (let i = 0; i < s0.x.length; i++) if (s0.st[i] === 1) { cx += s0.x[i]; cy += s0.y[i]; n++; }
  cx = cx / n - scrollX; cy = cy / n - scrollY;
  const path = []; for (let x = cx - half; x <= cx + half; x += speed) path.push(x);
  const full = path.concat(path.slice().reverse());
  let a = 0, b = 0;
  for (const x of full) {
    swarm.pointer(x, cy); swarm.advance(1);
    const s = swarm.snapshot(), px = x + scrollX, py = cy + scrollY;
    for (let i = 0; i < s.x.length; i++) { if (s.st[i] !== 1) continue; const d = Math.hypot(s.x[i] - px, s.y[i] - py); if (d < 25) a++; if (d < 60) b++; }
  }
  return [a / full.length, b / full.length];
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for ver in sys.argv[1:]:
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        pg.evaluate("swarm.cfg.WAVE_SPEED = 80; swarm.setWeapon && 0")
        # сокола-охотника выключаем, чтобы мерить только реакцию на курсор
        pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=wf][data-v=\"0\"]').click()")
        for speed in (6, 20):
            r25, r60 = [], []
            for rep_ in range(3):
                pg.evaluate("swarm.setMode('rest'); swarm.advance(700); document.documentElement.dispatchEvent(new PointerEvent('pointerleave')); swarm.setMode('flock'); swarm.advance(500)")
                a, c = pg.evaluate(JS, [speed, 420])
                r25.append(a); r60.append(c)
            print(f"{ver}: курсор {speed:>2} px/шаг — птиц ближе 25 px ⌀ {stt.mean(r25):.1f}, ближе 60 px ⌀ {stt.mean(r60):.1f}", flush=True)
        pg.close()
    b.close()
