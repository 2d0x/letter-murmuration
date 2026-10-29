"""Быстрая проверка v5: ошибки консоли, высота атласа, тела великанов."""
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for dpr in (1, 2):
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=dpr)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto((here / "dist/v5/index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        st = pg.evaluate("swarm.stats()")
        maxtex = pg.evaluate("(() => { const g = document.createElement('canvas').getContext('webgl2'); return g ? g.getParameter(g.MAX_TEXTURE_SIZE) : 0; })()")
        at = pg.evaluate("[...document.querySelectorAll('canvas')].length")
        rects = pg.evaluate("[...document.querySelectorAll('.scale span')].map(s => { const r = s.getBoundingClientRect(); return [s.textContent, Math.round(parseFloat(getComputedStyle(s).fontSize)), Math.round(r.width), Math.round(r.height)]; })")
        print(f"dpr {dpr}: букв {st['letters']}, рендер {st['renderer']}, препятствий {st['obstacles']}, MAX_TEXTURE {maxtex}")
        print("  шкала:", rects)
        print("  ошибки:", errs[:5])
        pg.close()
    b.close()
