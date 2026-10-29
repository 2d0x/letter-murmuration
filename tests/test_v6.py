"""v6: закладка на всю страницу (шапка fixed, прокрутка), посадка по дуге (v5 против v6), скорострельность."""
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
bm = (here / "dist/bm/bookmarklet.txt").read_text(encoding="utf-8")
ARC = """() => {
  const s0 = swarm.snapshot(), act = [];
  for (let i = 0; i < s0.st.length; i++) if (s0.st[i] === 1) act.push(i);
  const pick = act.filter((_, k) => k % Math.max(1, Math.floor(act.length / 300)) === 0);
  const H = window.__homes, cosSum = [0, 0], tr = pick.map(() => []);
  let landedAt = -1;
  for (let t = 0; t < 600; t += 2) {
    swarm.advance(2);
    const s = swarm.snapshot();
    pick.forEach((i, k) => { if (s.st[i] === 1) tr[k].push([s.x[i], s.y[i], s.vx[i], s.vy[i]]); });
    if (landedAt < 0 && swarm.stats().active === 0) landedAt = t;
  }
  // на обратном пути (расстояние до дома падает, дальше 12 px): насколько скорость смотрит прямо на дом
  let cs = 0, n = 0, ratio = 0, rn = 0;
  pick.forEach((i, k) => {
    const P = tr[k]; if (P.length < 6) return;
    let far = 0, fi = 0;
    P.forEach((p, j) => { const d = Math.hypot(H[i][0] - p[0], H[i][1] - p[1]); if (d > far) { far = d; fi = j; } });
    let path = 0;
    for (let j = fi; j < P.length; j++) {
      const p = P[j], dx = H[i][0] - p[0], dy = H[i][1] - p[1], d = Math.hypot(dx, dy), v = Math.hypot(p[2], p[3]);
      if (j > fi) path += Math.hypot(p[0] - P[j - 1][0], p[1] - P[j - 1][1]);
      if (d > 12 && v > 0.3) { cs += (dx * p[2] + dy * p[3]) / (d * v); n++; }
    }
    if (far > 40) { ratio += path / far; rn++; }
  });
  return { cos: cs / n, ratio: ratio / rn, landedAt, letters: pick.length };
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    # 1) закладка
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((here / "tests" / "mock_wiki.html").resolve().as_uri())
    pg.evaluate("""(h) => {
      const hd = document.createElement('div'); hd.id = 'fixhdr'; hd.textContent = 'Закреплённая шапка сайта';
      hd.style.cssText = 'position:fixed;top:0;right:0;padding:6px 12px;background:#eee;color:#123;z-index:5';
      document.body.append(hd);
      const a = document.createElement('a'); a.id = 'bmtest'; a.href = h; a.textContent = 'bm'; a.style.cssText = 'position:fixed;left:0;top:0;z-index:6'; document.body.prepend(a);
    }""", bm)
    pg.click("#bmtest"); pg.wait_for_timeout(700)
    r = pg.evaluate("""() => {
      const api = LetterSwarm.__instance, st = api.stats();
      const hc = getComputedStyle(document.getElementById('fixhdr'));
      const host = [...document.body.children].find(e => e.shadowRoot), title = host.shadowRoot.querySelector('*');
      const tc = getComputedStyle(host);
      return { letters: st.letters, total: document.body.innerText.replace(/\\s/g, '').length, hdr: [hc.color, hc.webkitTextFillColor], hud: [tc.color, tc.webkitTextFillColor] };
    }""")
    pg.evaluate("LetterSwarm.__instance.setMode('flock'); LetterSwarm.__instance.advance(40)")
    a0 = pg.evaluate("LetterSwarm.__instance.stats().active")
    pg.evaluate("scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(900)
    pg.evaluate("LetterSwarm.__instance.advance(40)")
    sl = pg.evaluate("""() => { const s = LetterSwarm.__instance.snapshot(); let sleep = 0, vis = 0;
      const top = scrollY, bot = scrollY + innerHeight;
      // дома — по исходным позициям: у спящих x,y = дом
      for (let i = 0; i < s.st.length; i++) if (s.st[i] === 0 && s.y[i] > top && s.y[i] < bot) sleep++;
      return [sleep, LetterSwarm.__instance.stats().active]; }""")
    pg.screenshot(path=str(here / "shots/v6_bm_scrolled.png"))
    print(f"закладка: букв {r['letters']} (видимых символов на странице {r['total']}), шапка {r['hdr']}, панель {r['hud']}; в полёте сверху {a0}, после прокрутки вниз {sl[1]}, спят на экране {sl[0]}; ошибки {errs}", flush=True)
    pg.close()
    # 2) посадка
    for ver in ("v5", "v6"):
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        pg.evaluate("() => { const s = swarm.snapshot(); window.__homes = s.x.map((x, i) => [x, s.y[i]]); }")
        pg.evaluate("document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))")
        pg.mouse.click(520, 1100 - 600)
        res = pg.evaluate(ARC)
        print(f"{ver} посадка: cos(скорость, дом) на обратном пути {res['cos']:.2f}, путь/удаление {res['ratio']:.2f}, все сели через {res['landedAt']} шагов ({res['letters']} букв в выборке)", flush=True)
        pg.close()
    # 3) оружие
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto((here / "dist/v6/index.html").resolve().as_uri())
    pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
    pg.evaluate(f"{HOST}.style.display='none'")
    for rate, bs in ((10, 12), (240, 30)):
        pg.evaluate(f"swarm.setMode('rest'); swarm.advance(400); swarm.cfg.FIRE_RATE = {rate}; swarm.cfg.BULLET_SPEED = {bs}; swarm.cfg.WAVE_SPEED = 80; swarm.pointer(720, 450); swarm.setMode('horde')")
        pg.keyboard.press("f")
        k0 = pg.evaluate("swarm.stats().kills"); pg.evaluate("swarm.advance(600)"); k1 = pg.evaluate("swarm.stats().kills")
        pg.keyboard.press("f")
        print(f"оружие {rate}/с, пули {bs} px/шаг: сбито за 10 с {k1 - k0}", flush=True)
        pg.evaluate("swarm.setMode('rest')"); pg.evaluate(f"{HOST}.shadowRoot.querySelector('[data-act=revive], button[data-g=revive]') && 0")
    b.close()
