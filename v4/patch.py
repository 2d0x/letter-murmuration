"""v3 → v4: взлёт волной, стрельба по умолчанию выкл, панель настроек, обзор зомби,
испуг по прогнозу пути сокола + паника, передающаяся соседям, картинки-препятствия, жирные тяжелее,
маркеры списков остаются на месте."""
from pathlib import Path

p = Path(__file__).parent / "engine.js"
s = p.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)


def between(start, end, new):
    global s
    a = s.index(start)
    b = s.index(end, a)
    s = s[:a] + new + s[b:]


# ---------- заголовок, константы, настраиваемые параметры ----------
rep(" * LetterSwarm v3 — каждая буква страницы становится птицей с телом.",
    " * LetterSwarm v4 — каждая буква страницы становится птицей с телом.")
rep("    FIRE_RANGE: 420,\n", """    FIRE_RANGE: 420,
    ZOMBIE_SIGHT: 350, // с какого расстояния зомби замечает героя, px; крупные буквы видят дальше
    WAVE_SPEED: 22,    // скорость волны взлёта, px/шаг: экран примерно за секунду
    LOOKAHEAD: 12,     // на сколько шагов вперёд птица прикидывает путь сокола
    PANIC_DECAY: 0.94, // как быстро гаснет паника
""")
rep("  const COS_TURN = Math.cos(CFG.MAX_TURN), SIN_TURN = Math.sin(CFG.MAX_TURN);",
    """  const COS_TURN = Math.cos(CFG.MAX_TURN), SIN_TURN = Math.sin(CFG.MAX_TURN);
  // ползунки панели: ключ CFG, подпись, мин, макс, шаг, единицы
  const TUNABLES = [
    ['HORDE_SPEED', 'Базовая скорость орды', 0.5, 8, 0.1, 'px/шаг'],
    ['ZOMBIE_SIGHT', 'Обзор зомби', 40, 2000, 10, 'px'],
    ['FLY_CRUISE', 'Скорость птиц', 1.5, 8, 0.1, 'px/шаг'],
    ['FALCON_R', 'Испуг от сокола', 40, 400, 5, 'px'],
    ['K', 'Соседей (K)', 1, 20, 1, ''],
    ['WAVE_SPEED', 'Волна взлёта', 4, 80, 1, 'px/шаг'],
  ];
  const TUNE_DEFAULTS = {};
  TUNABLES.forEach(([k]) => { TUNE_DEFAULTS[k] = CFG[k]; });
  const fmtTune = (k, v) => k === 'ZOMBIE_SIGHT' && v >= 1990 ? 'видят всех'
    : (Math.round(v * 10) / 10).toString().replace('.', ',') + (TUNABLES.find((t) => t[0] === k)[5] ? ' ' + TUNABLES.find((t) => t[0] === k)[5] : '');""")
rep("""    flock: 'Стая кружит над гнездовьем, держит скорость и сама затевает развороты. Сокол-охотник атакует сам, курсор — второй сокол.',
    horde: 'Курсор стал героем: буквы бегут к нему, точки и запятые — первыми. Точкомёт бьёт по ближайшей. Клик отбрасывает.',""",
    """    flock: 'Стая кружит над гнездовьем и сама затевает развороты. Сокол-охотник атакует сам, курсор — второй сокол: птицы уходят с его пути, тревога бежит по стае волной. Картинки — препятствия.',
    horde: 'Курсор стал героем. Зомби замечают его в радиусе обзора, остальные бродят, пока их не увлечёт толпа. Точки и запятые бегут быстрее. Клик отбрасывает.',""")
rep("      title: 'Мурмурация букв · v3',", "      title: 'Мурмурация букв · v4',")
rep("      weapon: true,\n", "      weapon: false,\n")
rep("    let weapon = opts.weapon !== false;", "    let weapon = opts.weapon === true;")

# ---------- маркеры списков остаются на месте ----------
rep("""      '-webkit-user-select:none!important;user-select:none!important}';""",
    """      '-webkit-user-select:none!important;user-select:none!important}' +
      '.ls-hidden ::marker{color:initial!important;-webkit-text-fill-color:initial!important}';""")

# ---------- массивы ----------
rep("    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, WK, IV, LEADT, LEADH, inst = new Float32Array(0);",
    "    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, WK, IV, LEADT, LEADH, inst = new Float32Array(0);\n"
    "    let WAKEAT, AG, WA, PN;      // время взлёта в волне, «в погоне» (зомби), курс бродяги, паника (птицы)\n"
    "    let OB = new Float32Array(0), OBN = 0;   // препятствия: прямоугольники картинок x0, y0, x1, y1")
rep("    let act, ord, qx, qy, qvx, qvy, qr, nsx, nsy, nax, nay, ncx, ncy, ntx, nty, nfg, nfv, nct, cellOf, CONT;",
    "    let act, ord, qx, qy, qvx, qvy, qr, nsx, nsy, nax, nay, ncx, ncy, ntx, nty, nfg, nfv, nct, nag, npm, cellOf, CONT;")
rep("    let atlas = null, gSX, gSY, gCW, gCH, gR, gIM, gAcc, gSpd;", "    let atlas = null, gSX, gSY, gCW, gCH, gR, gIM, gAcc, gSpd, gSee;")
rep("      IV = F(); for (let i = 0; i < N; i++) IV[i] = 0.9 + Math.random() * 0.2;    // личный темп ±10%",
    "      IV = F(); for (let i = 0; i < N; i++) IV[i] = 0.9 + Math.random() * 0.2;    // личный темп ±10%\n"
    "      WAKEAT = F(); WAKEAT.fill(-1); AG = F(); PN = F();\n"
    "      WA = F(); for (let i = 0; i < N; i++) WA[i] = Math.random() * Math.PI * 2;")
rep("nfg = F(); nfg.fill(9); nfv = F();", "nfg = F(); nfg.fill(9); nfv = F(); nag = new Uint8Array(N); npm = F();")
rep("      activeCount = 0; kills = 0; B.n = 0; PT.n = 0;\n      if (mode !== 'rest') wakeAll(mode);",
    "      activeCount = 0; kills = 0; B.n = 0; PT.n = 0; pendingWakes = 0;\n      collectObstacles();\n      if (mode !== 'rest') wakeAll(mode);")

# ---------- атлас: жирные тяжелее, крупные видят дальше ----------
rep("      gR = new Float32Array(n); gIM = new Float32Array(n); gAcc = new Float32Array(n); gSpd = new Float32Array(n);",
    "      gR = new Float32Array(n); gIM = new Float32Array(n); gAcc = new Float32Array(n); gSpd = new Float32Array(n); gSee = new Float32Array(n);")
rep("        gSpd[g] = Math.min(2, Math.max(0.5, Math.pow(4.2 / rad, 0.7)));",
    """        gSpd[g] = Math.min(2, Math.max(0.5, Math.pow(4.2 / rad, 0.7)));
        // жирное начертание — тяжелее: масса × (вес/400), разгон и темп ниже
        const wt = Math.max(1, (parseInt(gFont[g].split(' ')[1], 10) || 400) / 400);
        gIM[g] /= wt; gAcc[g] /= Math.sqrt(wt); gSpd[g] /= Math.pow(wt, 0.35);
        // обзор: крупные буквы видят дальше (×0,6 … ×2,5 от базового радиуса)
        gSee[g] = Math.min(2.5, Math.max(0.6, Math.sqrt(rad / 3.6)));""")

# ---------- препятствия ----------
rep("    function buildHomeGrid() {", """    function collectObstacles() {
      const list = [];
      const sx = global.scrollX, sy = global.scrollY;
      root.querySelectorAll('img,svg,video,canvas,picture,iframe,object,embed').forEach((el) => {
        if (el.classList.contains('ls-canvas') || el.classList.contains('ls-overlay')) return;
        if (el.ownerSVGElement) return;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) return;
        list.push(r.left + sx, r.top + sy, r.right + sx, r.bottom + sy);
      });
      OB = Float32Array.from(list); OBN = list.length / 4;
    }

    // картинки — твёрдые: буква не заходит внутрь, а скользит вдоль края (в орде — в сторону героя)
    function obstaclesStep(n) {
      if (!OBN) return;
      const hx = heroPX(), hy = heroPY(), m = 24;
      for (let s = 0; s < n; s++) {
        const i = act[s];
        if (mode === 'rest' && CALMT[i] >= CFG.CALM) {
          const ddx = HX[i] - X[i], ddy = HY[i] - Y[i];
          if (ddx * ddx + ddy * ddy < 900) continue;      // садится на место — не мешаем
        }
        const r = gR[GL[i]] * SC[i];
        let x = X[i], y = Y[i];
        for (let o = 0; o < OBN; o++) {
          const x0 = OB[o * 4] - r, y0 = OB[o * 4 + 1] - r, x1 = OB[o * 4 + 2] + r, y1 = OB[o * 4 + 3] + r;
          if (x < x0 - m || x > x1 + m || y < y0 - m || y > y1 + m) continue;
          if (x > x0 && x < x1 && y > y0 && y < y1) {
            const dl = x - x0, dr = x1 - x, dt = y - y0, db = y1 - y, mn = Math.min(dl, dr, dt, db);
            let nx = 0, ny = 0;
            if (mn === dl) { x = x0; nx = -1; } else if (mn === dr) { x = x1; nx = 1; } else if (mn === dt) { y = y0; ny = -1; } else { y = y1; ny = 1; }
            const vn = VX[i] * nx + VY[i] * ny;
            if (vn < 0) { VX[i] -= nx * vn; VY[i] -= ny * vn; }
            const tx = -ny, ty = nx;
            const sg = mode === 'horde' ? ((hx - x) * tx + (hy - y) * ty >= 0 ? 1 : -1) : (VX[i] * tx + VY[i] * ty >= 0 ? 1 : -1);
            const sp = Math.max(0.6, Math.sqrt(VX[i] * VX[i] + VY[i] * VY[i]));
            VX[i] += tx * sg * sp * 0.3; VY[i] += ty * sg * sp * 0.3;
          } else {
            const cx = x < x0 ? x0 : x > x1 ? x1 : x, cy = y < y0 ? y0 : y > y1 ? y1 : y;
            const ddx = x - cx, ddy = y - cy, dd = Math.sqrt(ddx * ddx + ddy * ddy) + 1e-3;
            if (dd < m) {
              const vn = (VX[i] * ddx + VY[i] * ddy) / dd;
              if (vn < 0) { const k = (1 - dd / m) * 0.35 * -vn; VX[i] += ddx / dd * k; VY[i] += ddy / dd * k; }
            }
          }
        }
        X[i] = x; Y[i] = y;
      }
    }

    function buildHomeGrid() {""")

# ---------- взлёт волной ----------
between("    function wakeAll(m) {", "    // ---------- указатель ----------", """    // взлёт волной: от курсора (или центра экрана) буквы срываются по очереди, фронт идёт со скоростью WAVE_SPEED
    let pendingWakes = 0, waveOX = 0, waveOY = 0;
    function wakeAll(m) {
      const top = global.scrollY - vh, bottom = global.scrollY + vh * 2;
      waveOX = P.inside ? P.cx + global.scrollX : global.scrollX + vw / 2;
      waveOY = P.inside ? P.cy + global.scrollY : global.scrollY + vh / 2;
      const ws = Math.max(1, CFG.WAVE_SPEED);
      for (let i = 0; i < N; i++) {
        if (ST[i] === 2) continue;
        if (opts.wakeScope === 'near' && ST[i] === 0 && (HY[i] < top || HY[i] > bottom)) continue;
        if (ST[i] === 0) {
          if (WAKEAT[i] < 0) pendingWakes++;
          const dx = HX[i] - waveOX, dy = HY[i] - waveOY;
          WAKEAT[i] = stepNo + Math.sqrt(dx * dx + dy * dy) / ws + Math.random() * 4;
        }
        CALMT[i] = 0;
      }
    }
    function wakePending() {
      if (!pendingWakes) return;
      for (let i = 0; i < N; i++) {
        const w = WAKEAT[i];
        if (w < 0 || w > stepNo) continue;
        WAKEAT[i] = -1; pendingWakes--;
        if (ST[i] !== 0) continue;
        ST[i] = 1; WK[i] = 0; CALMT[i] = 0; AG[i] = 0; PN[i] = 0;
        X[i] = HX[i]; Y[i] = HY[i];
        if (mode === 'flock') {
          const dx = HX[i] - waveOX, dy = HY[i] - waveOY, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          VX[i] = dx / d * 1.5 + (Math.random() - 0.5); VY[i] = dy / d * 1.5 - 1.5 - Math.random() * 1.5;
        } else { VX[i] = 0; VY[i] = 0; }
      }
      if (pendingWakes < 0) pendingWakes = 0;
      dirty = true;
    }

""")

# ---------- восприятие: + сколько соседей в погоне, самая сильная паника рядом ----------
rep("      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, tx = 0, ty = 0, fg = 9, fv = 0;",
    "      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, tx = 0, ty = 0, fg = 9, fv = 0, ag = 0, pm = 0;")
rep("""        const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
        ax += qvx[b]; ay += qvy[b]; cx += dx; cy += dy;
        const rs = ra + qr[b];
        const ps = rs * P2;""", """        const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
        ax += qvx[b]; ay += qvy[b]; cx += dx; cy += dy;
        const ob = ord[b];
        if (AG[ob] > 0) ag++;
        if (PN[ob] > pm) pm = PN[ob];
        const rs = ra + qr[b];
        const ps = rs * P2;""")
rep("      nfg[id] = fg; nfv[id] = fv; nct[id] = m;", "      nfg[id] = fg; nfv[id] = fv; nct[id] = m; nag[id] = ag; npm[id] = pm;")
rep("          nsx.fill(0); nsy.fill(0); ntx.fill(0); nty.fill(0); nct.fill(0); nfg.fill(9);",
    "          nsx.fill(0); nsy.fill(0); ntx.fill(0); nty.fill(0); nct.fill(0); nfg.fill(9); nag.fill(0); npm.fill(0);")
# рядом с угрозой — восприятие каждый шаг
rep("      return CFG.STEER_EVERY > 1 && WK[id] > 3 && ((id + stepNo) % CFG.STEER_EVERY) !== 0;",
    "      return CFG.STEER_EVERY > 1 && WK[id] > 3 && PN[id] < 0.05 && ((id + stepNo) % CFG.STEER_EVERY) !== 0;")

# ---------- шаг ----------
rep("""    function step() {
      const n = collectActive();""", """    function step() {
      stepNo++;
      wakePending();
      const n = collectActive();""")
rep("""      stepNo++;
      const t0 = performance.now();
      fwdMode = mode === 'horde' ? 1 : 0;""", """      const t0 = performance.now();
      fwdMode = mode === 'horde' ? 1 : 0;""")
rep("""      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      const t2 = performance.now();""", """      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      obstaclesStep(n);
      const t2 = performance.now();""")

# ---------- угроза: где сокол сейчас и куда летит ----------
rep("    function behave(n) {", """    // угроза от хищника в точке (px, py), летящего со скоростью (pvx, pvy): птица учитывает и текущую дистанцию,
    // и ближайшую точку его пути на LOOKAHEAD шагов вперёд — и уходит с пути вбок, а не только от него
    let thx = 0, thy = 0;
    function threat(x, y, px, py, pvx, pvy, R, K, fear) {
      const dx = x - px, dy = y - py, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
      let f = d < R ? 1 - d / R : 0, ex = dx / d, ey = dy / d;
      const u2 = pvx * pvx + pvy * pvy;
      if (u2 > 0.25) {
        let t = (dx * pvx + dy * pvy) / u2;
        if (t > 0) {
          const T = CFG.LOOKAHEAD;
          if (t > T) t = T;
          let qx_ = x - (px + pvx * t), qy_ = y - (py + pvy * t), dq = Math.sqrt(qx_ * qx_ + qy_ * qy_);
          if (dq < 1e-3) { qx_ = -pvy; qy_ = pvx; dq = Math.sqrt(u2); }
          const fp = dq < R ? (1 - dq / R) * (1 - 0.5 * t / T) : 0;
          if (fp > f) { f = fp; ex = qx_ / dq; ey = qy_ / dq; }
        }
      }
      if (f > 0) { const k = f * f * K + f * 0.4; thx += ex * k; thy += ey * k; }
      return f > fear ? f : fear;
    }

    function behave(n) {""")
rep("""      const FR = CFG.FALCON_R;
      const wf = WF.present, wfR = WF.fearR, wfK = WF.fearK, wfx = WF.x, wfy = WF.y;
      let sumX = 0, sumY = 0, sumVX = 0, sumVY = 0;""", """      const FR = CFG.FALCON_R;
      // быстрый курсор пугает раньше: дистанция вспугивания растёт со скоростью хищника
      const pSpeed = Math.sqrt(P.svx * P.svx + P.svy * P.svy);
      const FRc = FR * (1 + Math.min(2, pSpeed / 10));
      const wf = WF.present, wfR = WF.fearR, wfK = WF.fearK, wfx = WF.x, wfy = WF.y;
      let sumX = 0, sumY = 0, sumVX = 0, sumVY = 0;
      reactCount = 0;""")
rep("""          let fear = 0;
          if (P.inside) {
            const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
            if (fd < FR) { const f = 1 - fd / FR; ax += fx / fd * f * f * 1.6; ay += fy / fd * f * f * 1.6; if (f > fear) fear = f; }
          }
          if (wf) {
            const fx = x - wfx, fy = y - wfy, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
            if (fd < wfR) { const f = 1 - fd / wfR; ax += fx / fd * f * f * wfK; ay += fy / fd * f * f * wfK; if (f > fear) fear = f; }
          }""", """          let fear = 0;
          thx = 0; thy = 0;
          if (P.inside) fear = threat(x, y, pX, pY, P.svx, P.svy, FRc, 1.6, fear);
          if (wf) fear = threat(x, y, wfx, wfy, WF.vx, WF.vy, wfR, wfK, fear);
          ax += thx; ay += thy;
          // паника: свой испуг или от соседей — так тревога бежит по стае волной быстрее самого сокола
          let pn = PN[i] * CFG.PANIC_DECAY;
          if (fear > pn) pn = fear;
          const np = npm[i] * 0.85;
          if (np > pn && np > 0.15) pn = np;
          PN[i] = pn;
          if (pn > 0.2) reactCount++;
          if (cnt && pn > 0.05) { ax += (nax[i] * inv - vx) * 0.25 * pn; ay += (nay[i] * inv - vy) * 0.25 * pn; }""")
rep("""          if (fear > 0 || LEADT[i]) { const mt = CFG.MAX_TURN * (1 + fear * 2.5) + (LEADT[i] ? 0.03 : 0); cmt = Math.cos(mt); smt = Math.sin(mt); }""",
    """          if (pn > 0.01 || LEADT[i]) { const mt = CFG.MAX_TURN * (1 + pn * 4) + (LEADT[i] ? 0.03 : 0); cmt = Math.cos(mt); smt = Math.sin(mt); }""")
rep("""          sp += (cruise - sp) * 0.06;
          const sMax = cruise * (1.25 + fear * 0.9), sMin = cruise * 0.7;""", """          // в панике — рывок: скорость быстро поднимается, а не тянется к крейсерской
          sp += (cruise * (1 + 0.7 * pn) - sp) * (0.06 + 0.25 * pn);
          const sMax = cruise * (1.3 + 1.2 * pn), sMin = cruise * 0.7;""")

# зомби: обзор, память, увлечение толпой, бродяжничество
rep("""          const dx = heroX - x, dy = heroY - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          // свой ровный темп у каждой буквы: лёгкие быстрее тяжёлых, без разгона издалека
          const spd = CFG.HORDE_SPEED * gSpd[g] * IV[i];""", """          const dx = heroX - x, dy = heroY - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          // свой ровный темп у каждой буквы: лёгкие быстрее тяжёлых, без разгона издалека
          const spd = CFG.HORDE_SPEED * gSpd[g] * IV[i];
          // обзор: увидел героя — помнит его ~3 с; не видит — может увлечься, если рядом бегут другие
          const sight = CFG.ZOMBIE_SIGHT >= 1990 ? 1e9 : CFG.ZOMBIE_SIGHT * gSee[g];
          if (d < sight) AG[i] = 180;
          else if (AG[i] > 0) AG[i]--;
          if (AG[i] <= 0 && nag[i] >= 2 && Math.random() < 0.03) AG[i] = 120;
          if (AG[i] <= 0) {
            // бродит: медленно, курс плывёт
            WA[i] += (Math.random() - 0.5) * 0.35;
            const ws = spd * 0.22;
            ax += (Math.cos(WA[i]) * ws - vx) * 0.05; ay += (Math.sin(WA[i]) * ws - vy) * 0.05;
            maxS = spd * 0.4;
            sumX += x; sumY += y;
          } else {
          reactCount++;""")
rep("""          sumX += x; sumY += y;
          if (!volume && d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = spd * 1.2;""", """          sumX += x; sumY += y;
          if (!volume && d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = spd * 1.2;
          }""")
rep("    let hordeCX = 0, hordeCY = 0;", "    let hordeCX = 0, hordeCY = 0, reactCount = 0;")

# ---------- скорость курсора, сглаженная ----------
rep("    const P = { cx: -1e4, cy: -1e4, pcx: -1e4, pcy: -1e4, vx: 0, vy: 0, inside: false };",
    "    const P = { cx: -1e4, cy: -1e4, pcx: -1e4, pcy: -1e4, vx: 0, vy: 0, svx: 0, svy: 0, inside: false };")
rep("""      P.vx = P.pcx > -1e3 ? P.cx - P.pcx : 0; P.vy = P.pcy > -1e3 ? P.cy - P.pcy : 0;
      P.pcx = P.cx; P.pcy = P.cy;""", """      P.vx = P.pcx > -1e3 ? P.cx - P.pcx : 0; P.vy = P.pcy > -1e3 ? P.cy - P.pcy : 0;
      P.pcx = P.cx; P.pcy = P.cy;
      // скорость курсора в px за шаг симуляции (кадр может быть длиннее шага)
      const kf = CFG.STEP_MS / Math.max(CFG.STEP_MS, dt);
      P.svx += (P.vx * kf - P.svx) * 0.5; P.svy += (P.vy * kf - P.svy) * 0.5;""")

# ---------- «Покой»: отменить незавершённую волну ----------
rep("""        B.n = 0;
      } else {""", """        B.n = 0;
        WAKEAT.fill(-1); pendingWakes = 0;
      } else {""")

# ---------- панель: ползунки и новые счётчики ----------
rep("""        ${mult}
        <div class="stats">""", """        ${mult}
        <details class="tune"><summary>Настройки динамики</summary>
          <div class="tunes">${TUNABLES.map(([k, label, min, max, st]) => `
            <label class="sl" for="t-${k}"><span>${label}</span><b id="v-${k}"></b>
              <input type="range" id="t-${k}" data-k="${k}" min="${min}" max="${max}" step="${st}"></label>`).join('')}
          </div>
          <p class="note">Обзор: крупные буквы видят дальше базового радиуса, мелкие — ближе. Скорость орды умножается на лёгкость знака.</p>
          <button type="button" data-g="tune-reset">Сбросить настройки</button>
        </details>
        <div class="stats">""")
rep("""          <div><span>вдавливание ⌀</span><b id="ov">—</b></div>
        </div>""", """          <div><span>вдавливание ⌀</span><b id="ov">—</b></div>
          <div><span id="rlbl">реагируют</span><b id="rc">—</b></div>
          <div><span>ждут взлёта</span><b id="pw">—</b></div>
          <div><span>препятствий</span><b id="obn">—</b></div>
        </div>""")
rep("      .hint { color: var(--mut); font-size: 12px; }", """      .hint { color: var(--mut); font-size: 12px; }
      .tune { border-top: 1px solid var(--line); padding-top: 8px; }
      .tune summary { cursor: pointer; color: var(--mut); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .tune summary:focus-visible { outline: 2px solid var(--acc2); outline-offset: 2px; }
      .tunes { display: grid; gap: 8px; margin: 8px 0; }
      .sl { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; font-size: 12px; }
      .sl b { font: 500 12px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .sl input { grid-column: 1 / -1; width: 100%; accent-color: var(--acc2); }
      .note { margin: 0 0 8px; color: var(--mut); font-size: 11px; }""")
rep("      else if (g === 'revive') revive();", """      else if (g === 'revive') revive();
      else if (g === 'tune-reset') { Object.assign(CFG, TUNE_DEFAULTS); syncTunes(); }""")
rep("""    let toastTimer = 0;""", """    function syncTunes() {
      TUNABLES.forEach(([k]) => {
        const inp = $('#t-' + k);
        if (inp) inp.value = CFG[k];
        const lab = $('#v-' + k);
        if (lab) lab.textContent = fmtTune(k, CFG[k]);
      });
    }
    shadow.addEventListener('input', (e) => {
      const k = e.target && e.target.dataset && e.target.dataset.k;
      if (!k) return;
      CFG[k] = +e.target.value;
      $('#v-' + k).textContent = fmtTune(k, CFG[k]);
    });

    let toastTimer = 0;""")
rep("      $('#fps').textContent = Math.round(fpsE);", """      $('#fps').textContent = Math.round(fpsE);
      $('#rlbl').textContent = mode === 'horde' ? 'в погоне' : mode === 'flock' ? 'в панике' : 'реагируют';
      $('#rc').textContent = mode === 'rest' || !activeCount ? '—' : fmtInt(reactCount);
      $('#pw').textContent = fmtInt(pendingWakes);
      $('#obn').textContent = fmtInt(OBN);""")
rep("    updateHud(true);\n    raf = global.requestAnimationFrame(frame);", "    updateHud(true);\n    syncTunes();\n    raf = global.requestAnimationFrame(frame);")
rep("return { kills, falcon:", "return { reacting: reactCount, pending: pendingWakes, obstacles: OBN, kills, falcon:")

p.write_text(s, encoding="utf-8")
print("patched", len(s))
