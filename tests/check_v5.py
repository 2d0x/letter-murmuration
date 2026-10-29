"""Посадка великанов в «Покое» и стоимость шага, v4 против v5."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for ver in sys.argv[1:]:
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=wf][data-v=\"0\"]').click()")
        pg.evaluate("swarm.cfg.WAVE_SPEED = 80; swarm.pointer(700, 450); swarm.setMode('flock'); swarm.advance(200)")
        fl = min(pg.evaluate("swarm.advance(60)") for _ in range(3))
        pg.evaluate("swarm.setMode('rest'); swarm.advance(700); swarm.setMode('horde'); swarm.advance(200)")
        ho = min(pg.evaluate("swarm.advance(60)") for _ in range(3))
        pg.evaluate("swarm.setMode('rest')")
        left = []
        for t in (120, 240, 360, 480):
            pg.evaluate("swarm.advance(120)")
            left.append(pg.evaluate("swarm.stats().active"))
        big = pg.evaluate("(() => { const s = swarm.snapshot(); const out = []; for (let i = 0; i < s.st.length; i++) if (s.st[i] === 1) out.push(s.ch[i]); return out.slice(0, 20).join(''); })()")
        print(f"{ver}: стая {fl:.1f} мс/шаг, орда {ho:.1f} мс/шаг; в воздухе после «Покоя» через 2/4/6/8 с: {left}; ещё летят: {big!r}", flush=True)
        pg.close()
    b.close()
