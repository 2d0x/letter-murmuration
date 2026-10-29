"""Консольная версия на макете страницы Википедии (~60 тыс. символов): время извлечения, режимы, ошибки."""
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent; out = here / "shots"
para = ("The <b>common starling</b> (<i>Sturnus vulgaris</i>) is a medium-sized <a href='#'>passerine</a> bird in the "
        "<a href='#'>starling</a> family, Sturnidae. It is about 20 cm long and has glossy black plumage with a metallic sheen, "
        "which is speckled with white at some times of year. Flocks of starlings perform aerial displays called "
        "<a href='#'>murmurations</a>, in which thousands of birds move as one.<sup>[1]</sup> ")
body = ""
for i in range(14):
    body += f"<h2>Section {i+1}</h2>" + "<p>" + para * 4 + "</p>"
    body += "<ul>" + "".join(f"<li>List item {k} with a <a href='#'>link</a></li>" for k in range(5)) + "</ul>"
    if i % 3 == 0:
        body += "<table class='wikitable'><tr><th>Region</th><th>Population</th></tr>" + \
                "".join(f"<tr><td>Region {k}</td><td>{k*1234}</td></tr>" for k in range(6)) + "</table>"
html = f"""<!DOCTYPE html><html><head><meta charset=utf-8><style>
body{{font-family:sans-serif;font-size:14px;line-height:1.6;color:#202122;background:#fff;margin:0}}
#content{{max-width:960px;margin:0 auto;padding:20px}} a{{color:#36c}} h2{{font-family:Georgia,serif;font-weight:normal;border-bottom:1px solid #a2a9b1}}
.wikitable td,.wikitable th{{border:1px solid #a2a9b1;padding:4px 8px}}
</style></head><body><div id=content><h1>Common starling</h1><div id="mw-content-text">{body}</div></div></body></html>"""
(here / "tests" / "mock_wiki.html").write_text(html, encoding="utf-8")
script = (here / "dist" / "v5" / "letters-swarm-console-v5.js").read_text(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1366, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.goto((here / "tests" / "mock_wiki.html").resolve().as_uri())
    chars = pg.evaluate("document.querySelector('#mw-content-text').innerText.length")
    t = pg.evaluate("() => { const t0 = performance.now(); (0, eval)(arguments[0]); return performance.now() - t0; }".replace("arguments[0]", repr(script)) if False else
                    "(src) => { const t0 = performance.now(); (0, eval)(src); return performance.now() - t0; }", script)
    s = pg.evaluate("LetterSwarm.__instance.stats()")
    print(f"innerText chars: {chars}; letters: {s['letters']}; start (extract+atlas) ms: {t:.0f}; renderer: {s['renderer']}")
    pg.mouse.wheel(0, 2500); pg.wait_for_timeout(300)
    pg.evaluate("LetterSwarm.__instance.pointer(1200, 100); LetterSwarm.__instance.setMode('flock')")
    ms = pg.evaluate("LetterSwarm.__instance.advance(300)")
    s = pg.evaluate("LetterSwarm.__instance.stats()")
    print(f"flock near-screen: active {s['active']} of {s['letters']}, sim {ms:.2f} ms/step")
    pg.screenshot(path=str(out / "w_flock.png"))
    pg.evaluate("LetterSwarm.__instance.setMode('rest')"); pg.evaluate("LetterSwarm.__instance.advance(600)")
    print("after rest:", pg.evaluate("LetterSwarm.__instance.stats().active"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    left = pg.evaluate("document.querySelectorAll('.ls-canvas,.ls-overlay').length + document.querySelectorAll('.ls-hidden').length")
    print("after Esc leftovers:", left)
    print("errors:", errs)
    b.close()
