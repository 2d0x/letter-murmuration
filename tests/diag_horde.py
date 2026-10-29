"""Диагностика орды: линия за героем и синхронная «тряска» толпы.
python3 diag_horde.py v4 [v5 ...]
Метрики по кольцу зомби в радиусе 220 px от героя (последние 300 из 700 шагов):
  axis%  — доля зомби в секторе ±10° на продолжении оси «центр толпы → герой» за героем (равномерно = 5,6%)
  hist   — угловое распределение (12 секторов по 30°, сектор 0 — за героем по оси)
  ω std  — разброс средней угловой скорости кольца во времени (синхронное качание), рад/шаг ×1000
  coh    — |среднее ω| / среднее |ω_i|: 1 — всё кольцо крутится как одно целое, 0 — каждый сам по себе
  zc/с   — смен знака средней угловой скорости в секунду (частота качания)
"""
import math, statistics as stt, sys
import numpy as np
from pathlib import Path
from playwright.sync_api import sync_playwright
here = Path(__file__).resolve().parent.parent
HOST = "[...document.body.children].find(e => e.shadowRoot)"
JS = """(args) => {
  const [hx, hy, steps, tail] = args;
  swarm.pointer(hx, hy);
  const H = [hx + scrollX, hy + scrollY];
  const om = [], mvx = [], mvy = [], pol = [], cohs = [], hist = new Array(12).fill(0); let axis = 0, ring = 0, offs = [];
  for (let t = 0; t < steps; t++) {
    swarm.advance(1);
    if (t < steps - tail) continue;
    const s = swarm.snapshot();
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < s.x.length; i++) if (s.st[i] === 1) { cx += s.x[i]; cy += s.y[i]; n++; }
    cx /= n; cy /= n; offs.push(Math.hypot(H[0] - cx, H[1] - cy));
    const ta = Math.atan2(H[1] - cy, H[0] - cx);
    let sw = 0, sa = 0, m = 0, svx = 0, svy = 0, ssp = 0;
    for (let i = 0; i < s.x.length; i++) {
      if (s.st[i] !== 1) continue;
      const rx = s.x[i] - H[0], ry = s.y[i] - H[1], r2 = rx * rx + ry * ry;
      if (r2 > 220 * 220 || r2 < 1) continue;
      let ph = Math.atan2(ry, rx) - ta; while (ph > Math.PI) ph -= 2 * Math.PI; while (ph <= -Math.PI) ph += 2 * Math.PI;
      ring++; if (Math.abs(ph) < Math.PI / 18) axis++;
      hist[Math.floor(((ph + 2 * Math.PI + Math.PI / 12) % (2 * Math.PI)) / (Math.PI / 6)) % 12]++;
      const w = (rx * s.vy[i] - ry * s.vx[i]) / r2;
      sw += w; sa += Math.abs(w); m++; svx += s.vx[i]; svy += s.vy[i]; ssp += Math.hypot(s.vx[i], s.vy[i]);
    }
    om.push(m ? sw / m : 0); mvx.push(m ? svx / m : 0); mvy.push(m ? svy / m : 0); pol.push(ssp ? Math.hypot(svx, svy) / ssp : 0); cohs.push(sa ? Math.abs(sw) / sa : 0);
  }
  return { om, mvx, mvy, pol, cohs, hist, axis: axis / Math.max(1, ring), ringAvg: ring / tail, off: offs.reduce((a, b) => a + b, 0) / offs.length };
}"""

def run(pg, label, hx, hy, speed):
    pg.evaluate("swarm.setMode('rest'); swarm.advance(500)")
    pg.evaluate(f"swarm.cfg.HORDE_SPEED = {speed}; swarm.cfg.ZOMBIE_SIGHT = 2000; swarm.cfg.WAVE_SPEED = 80")
    pg.evaluate(f"swarm.pointer({hx}, {hy}); swarm.setMode('horde')")
    r = pg.evaluate(JS, [hx, hy, STEPS, 360])
    om = r["om"]
    zc = sum(1 for a, b in zip(om, om[1:]) if a * b < 0) / (len(om) / 60)
    a = np.array(om) - np.mean(om)
    sp = np.abs(np.fft.rfft(a * np.hanning(len(a)))) ** 2; fr = np.fft.rfftfreq(len(a), 1 / 60)
    band = (fr >= 0.7) & (fr <= 5)
    fpk = fr[band][np.argmax(sp[band])]; pband = 1000 * math.sqrt(2 * sp[band].sum()) / len(a)
    def bandp(x):
        x = np.array(x) - np.mean(x); q = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
        return math.sqrt(2 * q[band].sum()) / len(x), fr[band][np.argmax(q[band])]
    tx, fx = bandp(r["mvx"]); ty, fy = bandp(r["mvy"])
    tr = 100 * math.hypot(tx, ty); ftr = fx if tx > ty else fy
    tot = sum(r["hist"]) or 1
    hist = " ".join(f"{100 * h / tot:4.1f}" for h in r["hist"])
    print(f"  {label:<28} v={speed}: axis {100 * r['axis']:5.1f}%  ω std {1000 * stt.pstdev(om):5.2f}  coh {stt.mean(r['cohs']):.2f}  zc/с {zc:4.1f}"
          f"  вращ.качка {pband:5.2f} ({fpk:.1f} Гц)  сдвиг.качка {tr:5.2f} ({ftr:.1f} Гц)  поляр {stt.mean(r['pol']):.2f}  кольцо ⌀{r['ringAvg']:.0f}  центр↔герой {r['off']:.0f}px", flush=True)
    print(f"  {'':<28} сектора %: {hist}", flush=True)

STEPS = int(next((a[6:] for a in sys.argv if a.startswith("steps=")), 700))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for ver in [a for a in sys.argv[1:] if "=" not in a]:
        print(ver, flush=True)
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto((here / "dist" / ver / "index.html").resolve().as_uri())
        pg.wait_for_function("window.swarm && swarm.stats().letters > 0"); pg.wait_for_timeout(300)
        pg.evaluate(f"{HOST}.style.display='none'")
        tree = pg.evaluate("(() => { const r = [...document.images].find(i => /дерев/i.test(i.alt)).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        for speed in (3, 8):
            run(pg, "курсор в картинке-дереве", tree[0], tree[1], speed)
            run(pg, "курсор на пустом месте", 300, 600, speed)
        pg.close()
    b.close()
