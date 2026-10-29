"""v4: ошибки, волна взлёта, реакция стаи на быстрый курсор (v3 против v4), обзор зомби, препятствия, скорость."""
import json, math, statistics as stt, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent; out = here / "shots" / "v4"; out.mkdir(parents=True, exist_ok=True)
HOST = "[...document.body.children].find(e => e.shadowRoot)"

def open_page(b, ver):
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
    pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
    pg.evaluate(f"{HOST}.style.display='none'")
    return pg, errs

def sweep_test(pg, speed, label):
    """Сформировать стаю, затем провести курсор сквозь центр стаи туда и обратно; считать птиц в 25 и 60 px от курсора."""
    pg.evaluate("swarm.setMode('rest'); swarm.advance(700)")
    pg.evaluate("document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))")
    if pg.evaluate("swarm.cfg.WAVE_SPEED !== undefined"): pg.evaluate("swarm.cfg.WAVE_SPEED = 80")
    pg.evaluate("swarm.setMode('flock'); swarm.advance(600)")
    snap = pg.evaluate("swarm.snapshot ? swarm.snapshot() : null")
    res = []
    for rep_ in range(3):
        snap = pg.evaluate("swarm.snapshot()")
        act = [(x, y) for x, y, s in zip(snap["x"], snap["y"], snap["st"]) if s == 1]
        cy = sum(p[1] for p in act) / len(act); cx = sum(p[0] for p in act) / len(act)
        sy = pg.evaluate("scrollY"); sx = pg.evaluate("scrollX")
        cyc = cy - sy
        near25 = near60 = 0; steps = 0
        path = [(x, cyc) for x in range(int(cx - sx - 450), int(cx - sx + 450), speed)]
        path += list(reversed(path))  # обратно — туда, куда они разлетелись
        for (x, y) in path:
            r = pg.evaluate(f"""() => {{ swarm.pointer({x}, {y}); swarm.advance(1); const s = swarm.snapshot();
                let a = 0, b = 0; const px = {x} + scrollX, py = {y} + scrollY;
                for (let i = 0; i < s.x.length; i++) {{ if (s.st[i] !== 1) continue; const d = Math.hypot(s.x[i] - px, s.y[i] - py); if (d < 25) a++; if (d < 60) b++; }}
                return [a, b]; }}""")
            near25 += r[0]; near60 += r[1]; steps += 1
        res.append((near25 / steps, near60 / steps))
        pg.evaluate("document.documentElement.dispatchEvent(new PointerEvent('pointerleave')); swarm.advance(240)")
    a = stt.mean(r[0] for r in res); b = stt.mean(r[1] for r in res)
    print(f"{label}: скорость курсора {speed} px/шаг — птиц в 25 px от курсора ⌀ {a:.1f}, в 60 px ⌀ {b:.1f}", flush=True)
    return a, b

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg, errs = open_page(b, "v4")
    st = pg.evaluate("swarm.stats()"); print("letters:", st["letters"], "obstacles:", st["obstacles"], "weapon:", st["weapon"])
    pg.evaluate(f"{HOST}.style.display=''"); pg.screenshot(path=str(out / "0_rest.png"), full_page=False)
    pg.evaluate(f"{HOST}.style.display='none'")
    # волна взлёта
    pg.evaluate("swarm.pointer(300, 300); swarm.setMode('flock')")
    for k in (8, 16, 30):
        pg.evaluate(f"swarm.advance({k - (0 if k == 8 else (8 if k == 16 else 16))})")
        st = pg.evaluate("swarm.stats()"); print(f"wave @{k} шагов: в полёте {st['active']}, ждут {st['pending']}")
        if k == 16: pg.screenshot(path=str(out / "wave_16.png"))
    pg.evaluate("swarm.advance(200)")
    # препятствия: буквы внутри картинок
    inside = pg.evaluate("""() => { const s = swarm.snapshot(); const rects = [...document.querySelectorAll('#text img')].map(e => { const r = e.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]; });
       let n = 0; for (let i = 0; i < s.x.length; i++) { if (s.st[i] !== 1) continue; for (const r of rects) if (s.x[i] > r[0] + 2 && s.x[i] < r[2] - 2 && s.y[i] > r[1] + 2 && s.y[i] < r[3] - 2) { n++; break; } } return n; }""")
    print("flock: букв внутри картинок:", inside)
    # орда и обзор
    pg.evaluate("swarm.setMode('rest'); swarm.advance(700); swarm.pointer(1150, 300); swarm.setMode('horde'); swarm.advance(240)")
    st = pg.evaluate("swarm.stats()"); print(f"horde, обзор 350: в погоне {st['reacting']} из {st['active']}")
    pg.screenshot(path=str(out / "horde_sight350.png"))
    pg.evaluate("swarm.advance(360)")
    st = pg.evaluate("swarm.stats()"); print(f"horde, обзор 350, +6 с: в погоне {st['reacting']} из {st['active']}")
    pg.screenshot(path=str(out / "horde_sight350_later.png"))
    inside = pg.evaluate("""() => { const s = swarm.snapshot(); const rects = [...document.querySelectorAll('#text img')].map(e => { const r = e.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]; });
       let n = 0; for (let i = 0; i < s.x.length; i++) { if (s.st[i] !== 1) continue; for (const r of rects) if (s.x[i] > r[0] + 2 && s.x[i] < r[2] - 2 && s.y[i] > r[1] + 2 && s.y[i] < r[3] - 2) { n++; break; } } return n; }""")
    print("horde: букв внутри картинок:", inside)
    pg.evaluate("swarm.cfg.ZOMBIE_SIGHT = 2000; swarm.advance(120)")
    st = pg.evaluate("swarm.stats()"); print(f"horde, обзор «видят всех»: в погоне {st['reacting']} из {st['active']}")
    pg.evaluate("swarm.cfg.ZOMBIE_SIGHT = 350; swarm.setMode('rest'); swarm.advance(700)")
    home = pg.evaluate("swarm.stats().active"); print("после покоя в полёте:", home)
    pg.screenshot(path=str(out / "home.png"))
    # скорость
    for mult in [1, 4]:
        pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=mult][data-v=\"{mult}\"]').click()"); pg.wait_for_timeout(300)
        for mode in ["flock", "horde"]:
            pg.evaluate(f"swarm.cfg.WAVE_SPEED = 80; swarm.cfg.ZOMBIE_SIGHT = 2000; swarm.setMode('{mode}'); swarm.pointer(700, 450); swarm.advance(240)")
            ms = pg.evaluate("swarm.advance(30)")
            st = pg.evaluate("swarm.stats()")
            print(f"perf ×{mult} {st['letters']} букв {mode}: {ms:.2f} мс/шаг, касаний {st['contacts']:.2f}, вдавливание {st['overlap']:.2f}", flush=True)
            pg.evaluate("swarm.setMode('rest'); swarm.advance(5)")
    pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=mult][data-v=\"1\"]').click()"); pg.wait_for_timeout(300)
    pg.evaluate("swarm.cfg.WAVE_SPEED = 22; swarm.cfg.ZOMBIE_SIGHT = 350")
    print("errors v4:", errs)
    pg.close()
    # реакция стаи: v3 против v4
    for ver in ["v3", "v4"]:
        pg, errs = open_page(b, ver)
        for speed in (6, 20):
            sweep_test(pg, speed, ver)
        pg.close()
    b.close()
