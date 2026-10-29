"""Скриншоты v5 (и v4 для сравнения): орда вокруг курсора в картинке, орда на скорости 8, стая у колокольни, великаны."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
vers = sys.argv[1:] or ["v5"]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for ver in vers:
        out = here / "shots" / ver; out.mkdir(parents=True, exist_ok=True)
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=wf][data-v=\"0\"]').click()")
        tree = pg.evaluate("(() => { const r = [...document.images].find(i => /дерев/i.test(i.alt)).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        def horde(name, hx, hy, speed, steps):
            pg.evaluate("swarm.setMode('rest'); swarm.advance(500)")
            pg.evaluate(f"swarm.cfg.HORDE_SPEED = {speed}; swarm.cfg.ZOMBIE_SIGHT = 2000; swarm.cfg.WAVE_SPEED = 80; swarm.pointer({hx}, {hy}); swarm.setMode('horde')")
            done = 0
            for st in steps:
                pg.evaluate(f"swarm.advance({st - done})"); done = st
                pg.screenshot(path=str(out / f"{name}_{st}.png"))
        horde("horde_tree_v3", tree[0], tree[1], 3, [200, 700])
        horde("horde_empty_v8", 300, 600, 8, [300, 700])
        # стая у картинок
        pg.evaluate("swarm.cfg.HORDE_SPEED = 3; swarm.cfg.ZOMBIE_SIGHT = 450; swarm.setMode('rest'); swarm.advance(500); document.documentElement.dispatchEvent(new PointerEvent('pointerleave')); swarm.setMode('flock')")
        for k in range(4):
            pg.evaluate("swarm.advance(150)")
            pg.screenshot(path=str(out / f"flock_{k}.png"))
        # великаны: прокрутка к шкале кеглей, орда
        pg.evaluate("swarm.setMode('rest'); swarm.advance(600)")
        y = pg.evaluate("(() => { const r = document.querySelector('.scale').getBoundingClientRect(); scrollTo(0, scrollY + r.top - 250); return r.top; })()")
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(out / "giants_rest.png"))
        pg.evaluate("swarm.cfg.WAVE_SPEED = 80; swarm.pointer(1150, 300); swarm.setMode('horde')")
        for st in (120, 360):
            pg.evaluate("swarm.advance(120)" if st == 120 else "swarm.advance(240)")
            pg.screenshot(path=str(out / f"giants_horde_{st}.png"))
        pg.evaluate("swarm.setMode('rest'); swarm.advance(600); document.documentElement.dispatchEvent(new PointerEvent('pointerleave')); swarm.setMode('flock'); swarm.advance(400)")
        pg.screenshot(path=str(out / "giants_flock.png"))
        print(ver, "ok", pg.evaluate("swarm.stats().active"), flush=True)
        pg.close()
    b.close()
