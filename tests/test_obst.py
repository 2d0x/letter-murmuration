"""Птицы и картинки: сколько птиц в среднем «липнет» к картинкам (ближе 10 px к краю или внутри), v4 против v5.
python3 test_obst.py v4 v5"""
import statistics as stt, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
JS = """(steps) => {
  const R = [...document.querySelectorAll('#text img')].map(e => { const r = e.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]; }).filter(r => r[2] - r[0] >= 24);
  let hug = 0, near = 0, inside = 0;
  for (let t = 0; t < steps; t += 3) {
    swarm.advance(3);
    const s = swarm.snapshot();
    for (let i = 0; i < s.x.length; i++) {
      if (s.st[i] !== 1) continue;
      const x = s.x[i], y = s.y[i];
      for (const [x0, y0, x1, y1] of R) {
        const cx = Math.max(x0, Math.min(x1, x)), cy = Math.max(y0, Math.min(y1, y)), d = Math.hypot(x - cx, y - cy);
        if (x > x0 && x < x1 && y > y0 && y < y1) inside++;
        else if (d < 10) hug++;
        else if (d < 30) near++;
      }
    }
  }
  const k = Math.ceil(steps / 3);
  return [hug / k, near / k, inside / k];
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for ver in sys.argv[1:]:
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        pg.evaluate(f"{HOST}.shadowRoot.querySelector('button[data-g=wf][data-v=\"0\"]').click()")
        res = []
        for rep in range(2):
            pg.evaluate("document.documentElement.dispatchEvent(new PointerEvent('pointerleave')); swarm.setMode('rest'); swarm.advance(600); swarm.cfg.WAVE_SPEED = 80; swarm.setMode('flock'); swarm.advance(300)")
            res.append(pg.evaluate(JS, 900))
        h = stt.mean(r[0] for r in res); n = stt.mean(r[1] for r in res); i = stt.mean(r[2] for r in res)
        print(f"{ver}: у края (<10 px) ⌀ {h:.1f} птиц, в полосе 10–30 px ⌀ {n:.1f}, внутри ⌀ {i:.2f}", flush=True)
        pg.close()
    b.close()
