"""v2 → v3: полёт с креном и гнездовьем, сокол-охотник, развороты, орда с дистанцией до впереди идущего,
скорость по лёгкости знака, точкомёт, запрет выделения невидимого текста."""
from pathlib import Path

p = Path(__file__).parent / "engine.js"
s = p.read_text(encoding="utf-8")


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:100])
    s = s.replace(old, new)


def between(start, end, new):
    global s
    a = s.index(start)
    b = s.index(end, a)
    s = s[:a] + new + s[b:]


# ---------- заголовок и константы ----------
rep(" * LetterSwarm v2 — каждая буква страницы становится птицей с телом.",
    " * LetterSwarm v3 — каждая буква страницы становится птицей с телом.")
rep("    STEP_MS: 1000 / 60,\n  };", """    HORDE_SPEED: 3.0,  // базовый шаг орды, px/шаг; × лёгкость знака × личный разброс ±15%
    FLY_CRUISE: 4.0,   // крейсерская скорость птицы: почти постоянна, птица не умеет зависать
    MAX_TURN: 0.09,    // поворот за шаг, рад: разворот по дуге с креном, а не на месте
    FIRE_EVERY: 6,     // точкомёт: выстрел раз в 6 шагов (10 в секунду)
    BULLET_SPEED: 12,
    BULLET_LIFE: 60,
    FIRE_RANGE: 420,
    STEP_MS: 1000 / 60,
  };""")
rep("""    rest: 'Проведите курсором по строкам: буквы вспорхнут и вернутся. Клик даёт взрывную волну.',
    flock: 'Курсор стал соколом: стая расступается волной. Клик даёт взрывную волну.',
    horde: 'Курсор стал героем: буквы бегут к нему и окружают. Клик отбрасывает их.',""",
    """    rest: 'Проведите курсором по строкам: буквы вспорхнут и вернутся. Клик даёт взрывную волну.',
    flock: 'Стая кружит над гнездовьем, держит скорость и сама затевает развороты. Сокол-охотник атакует сам, курсор — второй сокол.',
    horde: 'Курсор стал героем: буквы бегут к нему, точки и запятые — первыми. Точкомёт бьёт по ближайшей. Клик отбрасывает.',""")
rep("      title: 'Мурмурация букв · v2',\n      volume: true,",
    "      title: 'Мурмурация букв · v3',\n      volume: true,\n      weapon: true,\n      wildFalcon: true,\n      ink: '#1c1922',")
rep("    let volume = opts.volume !== false;",
    "    let volume = opts.volume !== false;\n    let weapon = opts.weapon !== false;")

# ---------- выделение текста ----------
rep("""      'text-shadow:none!important;text-decoration-color:transparent!important}';""",
    """      'text-shadow:none!important;text-decoration-color:transparent!important;' +
      '-webkit-user-select:none!important;user-select:none!important}';""")

# ---------- массивы ----------
rep("    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, inst = new Float32Array(0);",
    "    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, WK, IV, LEADT, LEADH, inst = new Float32Array(0);\n"
    "    // ST: 0 — спит на своём месте, 1 — в полёте, 2 — сбита")
rep("    let act, ord, qx, qy, qvx, qvy, qr, nsx, nsy, nax, nay, ncx, ncy, ntx, nty, nct, cellOf, CONT;",
    "    let act, ord, qx, qy, qvx, qvy, qr, nsx, nsy, nax, nay, ncx, ncy, ntx, nty, nfg, nct, cellOf, CONT;")
rep("    let atlas = null, gSX, gSY, gCW, gCH, gR, gIM, gAcc;", "    let atlas = null, gSX, gSY, gCW, gCH, gR, gIM, gAcc, gSpd;")
rep("      VX = F(); VY = F(); ANG = F(); CALMT = F(); SC = F(); SC.fill(1);",
    "      VX = F(); VY = F(); ANG = F(); CALMT = F(); SC = F(); SC.fill(1);\n"
    "      WK = new Uint8Array(N); LEADT = new Uint8Array(N); LEADH = F();\n"
    "      IV = F(); for (let i = 0; i < N; i++) IV[i] = 0.85 + Math.random() * 0.3;   // личный темп ±15%")
rep("ncx = F(); ncy = F(); ntx = F(); nty = F(); nct = new Uint16Array(N);",
    "ncx = F(); ncy = F(); ntx = F(); nty = F(); nfg = F(); nfg.fill(9); nct = new Uint16Array(N);")
rep("      gR = new Float32Array(n); gIM = new Float32Array(n); gAcc = new Float32Array(n);",
    "      gR = new Float32Array(n); gIM = new Float32Array(n); gAcc = new Float32Array(n); gSpd = new Float32Array(n);")
rep("        gR[g] = rad; gIM[g] = 1 / (rad * rad); gAcc[g] = Math.min(1.4, Math.max(0.25, 4.2 / rad));",
    "        gR[g] = rad; gIM[g] = 1 / (rad * rad); gAcc[g] = Math.min(1.4, Math.max(0.25, 4.2 / rad));\n"
    "        // лёгкие знаки быстрее: точка ≈ ×1,6, обычная буква ≈ ×1, буквы заголовка ≈ ×0,55\n"
    "        gSpd[g] = Math.min(1.7, Math.max(0.55, Math.sqrt(4.2 / rad)));")
rep("      activeCount = 0;\n      if (mode !== 'rest') wakeAll(mode);",
    "      activeCount = 0; kills = 0; B.n = 0; PT.n = 0;\n      if (mode !== 'rest') wakeAll(mode);")

# ---------- пробуждение / сбитые ----------
rep("""      for (let i = 0; i < N; i++) {
        if (opts.wakeScope === 'near' && ST[i] === 0 && (HY[i] < top || HY[i] > bottom)) continue;
        if (ST[i] === 0) {
          ST[i] = 1;""", """      for (let i = 0; i < N; i++) {
        if (ST[i] === 2) continue;
        if (opts.wakeScope === 'near' && ST[i] === 0 && (HY[i] < top || HY[i] > bottom)) continue;
        if (ST[i] === 0) {
          ST[i] = 1; WK[i] = 0;""")
rep("      forHomesNear(px, py, R, (i) => { if (ST[i] === 0) { ST[i] = 1; VX[i] = 0; VY[i] = 0; } });\n      for (let i = 0; i < N; i++) {\n        if (!ST[i]) continue;",
    "      forHomesNear(px, py, R, (i) => { if (ST[i] === 0) { ST[i] = 1; WK[i] = 0; VX[i] = 0; VY[i] = 0; } });\n      for (let i = 0; i < N; i++) {\n        if (ST[i] !== 1) continue;")
rep("      for (let i = 0; i < N; i++) if (ST[i]) act[n++] = i;", "      for (let i = 0; i < N; i++) if (ST[i] === 1) act[n++] = i;")
rep("      forHomesNear(px, py, CFG.STARTLE_R, (i, dx, dy) => {\n        const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;\n        if (ST[i] === 0) {\n          ST[i] = 1;",
    "      forHomesNear(px, py, CFG.STARTLE_R, (i, dx, dy) => {\n        if (ST[i] === 2) return;\n        const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;\n        if (ST[i] === 0) {\n          ST[i] = 1; WK[i] = 0;")
rep("            if ((ST[i] !== 0) !== (pass === 1)) continue;", "            const st = ST[i];\n            if (pass === 0 ? st !== 0 : st !== 1) continue;")
rep("      return CFG.STEER_EVERY > 1 && CALMT[id] > 3 && ((id + stepNo) % CFG.STEER_EVERY) !== 0;",
    "      return CFG.STEER_EVERY > 1 && WK[id] > 3 && ((id + stepNo) % CFG.STEER_EVERY) !== 0;")
rep("        pw_[k] = CALMT[i] < 20 ? CALMT[i] / 20 : 1;       // только что взлетевшие расходятся плавно",
    "        pw_[k] = WK[i] < 20 ? WK[i] / 20 : 1;             // только что взлетевшие расходятся плавно")
rep("          nsx.fill(0); nsy.fill(0); ntx.fill(0); nty.fill(0); nct.fill(0);",
    "          nsx.fill(0); nsy.fill(0); ntx.fill(0); nty.fill(0); nct.fill(0); nfg.fill(9);")

# ---------- восприятие: + дистанция до впереди идущего ----------
between("    // сложить влияние выбранных соседей", "    function neighbourPass(n) {", """    // сложить влияние выбранных соседей на букву a (индексы — в отсортированных массивах q*)
    // + зазор до ближайшего соседа впереди (конус ±45°): в орде «вперёд» — к герою, иначе — по своей скорости
    let fwdMode = 0, fwdX = 0, fwdY = 0;
    function accumulate(a, list, m, id) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, tx = 0, ty = 0, fg = 9;
      const xa = qx[a], ya = qy[a], vxa = qvx[a], vya = qvy[a], ra = qr[a];
      const P2 = CFG.PERSONAL, T0 = CFG.TAU0, TK = CFG.TTC_K, TM = CFG.TTC_MAX;
      let fx0 = 0, fy0 = 0;
      if (fwdMode === 1) {
        const hx = fwdX - xa, hy = fwdY - ya, hl = Math.sqrt(hx * hx + hy * hy);
        if (hl > 1e-3) { fx0 = hx / hl; fy0 = hy / hl; }
      } else {
        const sl = Math.sqrt(vxa * vxa + vya * vya);
        if (sl > 0.3) { fx0 = vxa / sl; fy0 = vya / sl; }
      }
      const hasFwd = fx0 !== 0 || fy0 !== 0;
      for (let j = 0; j < m; j++) {
        const b = list[j];
        const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
        ax += qvx[b]; ay += qvy[b]; cx += dx; cy += dy;
        const rs = ra + qr[b];
        const ps = rs * P2;
        if (d2 < ps * ps && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (ps - d) / (ps * d);
          sx -= dx * k; sy -= dy * k;
        }
        if (hasFwd) {
          const proj = dx * fx0 + dy * fy0;
          if (proj > 0 && proj * proj > 0.5 * d2) {
            const gp = (Math.sqrt(d2) - rs) / rs;
            if (gp < fg) fg = gp;
          }
        }
        // страх столкновения: время до столкновения τ, сила ∝ e^(−τ/τ0)/τ² (Karamouzas et al., 2014)
        const rvx = vxa - qvx[b], rvy = vya - qvy[b];
        const A = rvx * rvx + rvy * rvy;
        if (A > 1e-4) {
          const B_ = dx * rvx + dy * rvy;
          if (B_ > 0) {
            const RR = rs * 1.15, C = d2 - RR * RR;
            if (C > 0) {
              const disc = B_ * B_ - A * C;
              if (disc > 0) {
                const tau = (B_ - Math.sqrt(disc)) / A;
                if (tau > 0 && tau < T0 * 3) {
                  const fx = rvx * tau - dx, fy = rvy * tau - dy;
                  const fl = Math.sqrt(fx * fx + fy * fy) + 1e-6;
                  let mag = TK * Math.exp(-tau / T0) / (tau * tau);
                  if (mag > TM) mag = TM;
                  tx += fx / fl * mag; ty += fy / fl * mag;
                }
              }
            }
          }
        }
      }
      nsx[id] = sx; nsy[id] = sy; nax[id] = ax; nay[id] = ay; ncx[id] = cx; ncy[id] = cy; ntx[id] = tx; nty[id] = ty;
      nfg[id] = fg; nct[id] = m;
    }

""")

# ---------- шаг: сокол, развороты, оружие ----------
rep("""      stepNo++;
      const t0 = performance.now();
      neighbourPass(n);
      behave(n);
      const t1 = performance.now();
      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      const t2 = performance.now();
      steerE += (t1 - t0 - steerE) * 0.1;
      collE += (t2 - t1 - collE) * 0.1;
    }""", """      stepNo++;
      const t0 = performance.now();
      fwdMode = mode === 'horde' ? 1 : 0;
      if (fwdMode) { fwdX = heroPX(); fwdY = heroPY(); }
      neighbourPass(n);
      behave(n);
      falconStep();
      turnStep();
      const t1 = performance.now();
      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      const t2 = performance.now();
      weaponStep();
      steerE += (t1 - t0 - steerE) * 0.1;
      collE += (t2 - t1 - collE) * 0.1;
    }
    const heroPX = () => P.inside ? P.cx + global.scrollX : global.scrollX + vw / 2;
    const heroPY = () => P.inside ? P.cy + global.scrollY : global.scrollY + vh / 2;""")
rep("      if (!n) { nbAvg = 0; contactsAvg = 0; overlapAvg = 0; return; }",
    "      if (!n) { nbAvg = 0; contactsAvg = 0; overlapAvg = 0; WF.present = false; particlesStep(); return; }")

# ---------- поведение ----------
between("    function behave(n) {", "    // тела: круги", r"""    function behave(n) {
      simTime += CFG.STEP_MS / 1000;
      const sxp = global.scrollX, syp = global.scrollY;
      const pX = P.cx + sxp, pY = P.cy + syp;
      // небо над гнездовьем: эллипс в верхней части экрана; вылетевшая за край птица разворачивается (как в StarDisplay)
      const skyX = sxp + vw * 0.5 + vw * 0.06 * Math.sin(simTime * 0.13);
      const skyY = syp + vh * 0.42 + vh * 0.04 * Math.sin(simTime * 0.17);
      const skyRX = Math.max(160, vw * 0.38), skyRY = Math.max(120, vh * 0.33);
      const heroX = heroPX(), heroY = heroPY();
      const FR = CFG.FALCON_R;
      const wf = WF.present, wfR = WF.fearR, wfK = WF.fearK, wfx = WF.x, wfy = WF.y;
      let sumX = 0, sumY = 0, sumVX = 0, sumVY = 0;

      for (let s = 0; s < n; s++) {
        const i = ord[s];
        const x = qx[s], y = qy[s];
        let vx = qvx[s], vy = qvy[s];
        let ax = 0, ay = 0;
        const cnt = nct[i];
        const inv = cnt ? 1 / cnt : 0;
        let minS = 0, maxS = 5, targetAng = NaN, flown = false;
        const g = GL[i];
        const am = gAcc[g];             // тяжёлые буквы разгоняются и тормозят медленнее
        CALMT[i] += 1;
        if (WK[i] < 255) WK[i]++;

        if (mode === 'flock') {
          if (cnt) {
            ax += nsx[i] * 0.9 + (nax[i] * inv - vx) * 0.1 + ncx[i] * inv * 0.003 + ntx[i];
            ay += nsy[i] * 0.9 + (nay[i] * inv - vy) * 0.1 + ncy[i] * inv * 0.003 + nty[i];
          }
          const ex = x - skyX, ey = y - skyY;
          const qe = Math.sqrt((ex / skyRX) * (ex / skyRX) + (ey / skyRY) * (ey / skyRY));
          if (qe > 1) {
            const ed = Math.sqrt(ex * ex + ey * ey) + 1e-3, k = Math.min(0.5, 0.05 + (qe - 1) * 0.6);
            ax -= ex / ed * k; ay -= ey / ed * k;
          }
          let fear = 0;
          if (P.inside) {
            const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
            if (fd < FR) { const f = 1 - fd / FR; ax += fx / fd * f * f * 1.6; ay += fy / fd * f * f * 1.6; if (f > fear) fear = f; }
          }
          if (wf) {
            const fx = x - wfx, fy = y - wfy, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
            if (fd < wfR) { const f = 1 - fd / wfR; ax += fx / fd * f * f * wfK; ay += fy / fd * f * f * wfK; if (f > fear) fear = f; }
          }
          if (LEADT[i] > 0) {      // зачинщики разворота: несколько птиц круто меняют курс, остальные подхватывают
            LEADT[i]--;
            ax += (Math.cos(LEADH[i]) * 4 - vx) * 0.15; ay += (Math.sin(LEADH[i]) * 4 - vy) * 0.15;
          }
          ax += (Math.random() - 0.5) * 0.05; ay += (Math.random() - 0.5) * 0.05;
          // полёт: скорость почти постоянна, курс меняется по дуге (крен) — птица не может зависнуть или развернуться на месте
          const cruise = CFG.FLY_CRUISE * (1 + (IV[i] - 1) * 0.5) * (qe > 2.2 ? 2.2 : 1);
          const nvx = vx + ax * am, nvy = vy + ay * am;
          const h = Math.atan2(vy, vx);
          let dh = Math.atan2(nvy, nvx) - h;
          if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
          const mt = CFG.MAX_TURN * (1 + fear * 2.5) + (LEADT[i] ? 0.03 : 0);
          if (dh > mt) dh = mt; else if (dh < -mt) dh = -mt;
          let sp = Math.sqrt(nvx * nvx + nvy * nvy);
          sp += (cruise - sp) * 0.06;
          const sMax = cruise * (1.25 + fear * 0.9), sMin = cruise * 0.7;
          if (sp > sMax) sp = sMax; else if (sp < sMin) sp = sMin;
          vx = Math.cos(h + dh) * sp; vy = Math.sin(h + dh) * sp;
          flown = true;
          sumX += x; sumY += y; sumVX += vx; sumVY += vy;
        } else if (mode === 'horde') {
          if (cnt) {
            ax += nsx[i] * 0.7 + (nax[i] * inv - vx) * 0.02 + ntx[i] * 0.8;
            ay += nsy[i] * 0.7 + (nay[i] * inv - vy) * 0.02 + nty[i] * 0.8;
          }
          const dx = heroX - x, dy = heroY - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          // свой ровный темп у каждой буквы: лёгкие быстрее тяжёлых, без разгона издалека
          const spd = CFG.HORDE_SPEED * gSpd[g] * IV[i];
          // держит дистанцию до того, кто впереди: плавно сбавляет, а не упирается и не тормозит рывком
          let follow = 1;
          if (volume) { const gp = nfg[i]; follow = gp >= 1.2 ? 1 : gp <= 0 ? 0.1 : 0.1 + 0.75 * gp; }
          const want = spd * follow;
          ax += (dx / d * want - vx) * 0.08; ay += (dy / d * want - vy) * 0.08;
          if (!volume && d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = spd * 1.2;
        } else { // rest
          const hx = HX[i] - x, hy = HY[i] - y, hd = Math.sqrt(hx * hx + hy * hy);
          if (CALMT[i] < CFG.CALM) {
            if (cnt) {
              ax += nsx[i] * 0.8 + (nax[i] * inv - vx) * 0.05 + ncx[i] * inv * 0.002 + ntx[i] * 0.6;
              ay += nsy[i] * 0.8 + (nay[i] * inv - vy) * 0.05 + ncy[i] * inv * 0.002 + nty[i] * 0.6;
            }
            if (P.inside) {
              const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
              if (fd < 90) { const f = 1 - fd / 90; ax += fx / fd * f * 0.8; ay += fy / fd * f * 0.8; }
            }
            ay -= 0.02;
            vx *= 0.985; vy *= 0.985;
          } else {
            const near = Math.min(1, hd / 30);
            if (cnt) { ax += (nsx[i] * 0.6 + ntx[i] * 0.5) * near; ay += (nsy[i] * 0.6 + nty[i] * 0.5) * near; }
            if (hd > 0.01) {
              const want = Math.min(9, hd * 0.09);
              ax += (hx / hd * want - vx) * 0.18; ay += (hy / hd * want - vy) * 0.18;
            }
            maxS = 9;
            if (hd < 40) targetAng = 0;
          }
        }

        if (!flown) {
          vx += ax * am; vy += ay * am;
          const s2 = vx * vx + vy * vy;
          if (s2 > maxS * maxS) { const k = maxS / Math.sqrt(s2); vx *= k; vy *= k; }
          else if (minS > 0 && s2 < minS * minS) {
            if (s2 > 1e-6) { const k = minS / Math.sqrt(s2); vx *= k; vy *= k; } else { vx = minS; }
          }
        }
        const sp2 = vx * vx + vy * vy;
        let nx = x + vx, ny = y + vy;

        if (targetAng !== targetAng) {
          if (sp2 > 0.36) targetAng = vx >= 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx);
          else targetAng = ANG[i];
        }
        let da = targetAng - ANG[i];
        if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
        let ang = ANG[i] + da * 0.15;

        if (mode === 'rest' && CALMT[i] >= CFG.CALM) {
          const hx = HX[i] - nx, hy = HY[i] - ny;
          if ((hx * hx + hy * hy < 0.36 && vx * vx + vy * vy < 0.25) || CALMT[i] > CFG.CALM + 600) {
            ST[i] = 0; nx = HX[i]; ny = HY[i]; vx = 0; vy = 0; ang = 0;
          }
        }
        const scT = !ST[i] ? 1 : mode === 'flock' ? CFG.FLY_SCALE : mode === 'horde' ? CFG.HORDE_SCALE : 1;
        SC[i] += (scT - SC[i]) * 0.06;
        if (ST[i] === 0) SC[i] = 1;
        X[i] = nx; Y[i] = ny; VX[i] = vx; VY[i] = vy; ANG[i] = ang;
      }
      if (mode === 'flock' && n) {
        flock.cx = sumX / n; flock.cy = sumY / n; flock.vx = sumVX / n; flock.vy = sumVY / n;
        flock.skyX = skyX; flock.skyY = skyY;
      }
    }

    // ---------- сокол-охотник ----------
    // Патрулирует в стороне, раз в 5–11 с атакует: то отбившуюся птицу, то центр стаи; пикирование быстрее бокового захода.
    // У настоящих скворцов тип ответа (вспышка-разлёт, волна, «дыра», раскол) зависит от скорости атаки (Storms et al., 2019).
    const flock = { cx: 0, cy: 0, vx: 1, vy: 0, skyX: 0, skyY: 0 };
    const WF = { on: opts.wildFalcon !== false, present: false, x: 0, y: 0, vx: 0, vy: 0, state: 0, cool: 0, th: 0, t: 0,
      tx: 0, ty: 0, speed: 3.8, fearR: 120, fearK: 1.4 };
    function falconStep() {
      if (!WF.on || mode !== 'flock' || !activeCount) { WF.present = false; return; }
      const sxp = global.scrollX, syp = global.scrollY;
      if (!WF.present) {
        WF.present = true; WF.state = 0; WF.cool = 180 + Math.random() * 120;
        WF.x = sxp - 40; WF.y = syp + vh * 0.12; WF.vx = 3.5; WF.vy = 0.4; WF.th = Math.PI;
      }
      let tx, ty, turn, speed;
      if (WF.state === 0) {
        WF.th += 0.006;
        const R = Math.max(vw, vh) * 0.45;
        tx = flock.cx + Math.cos(WF.th) * R; ty = flock.cy + Math.sin(WF.th) * R * 0.5 - vh * 0.1;
        speed = 3.8; turn = 0.05;
        if (--WF.cool <= 0) startAttack();
      } else {
        WF.t++;
        tx = WF.tx; ty = WF.ty; speed = WF.speed; turn = WF.t < 30 ? 0.09 : 0.012;
        const dx = WF.tx - WF.x, dy = WF.ty - WF.y;
        if ((WF.t > 30 && dx * WF.vx + dy * WF.vy < 0 && dx * dx + dy * dy > 250 * 250) || WF.t > 220) {
          WF.state = 0; WF.cool = 300 + Math.random() * 360;
        }
      }
      const h = Math.atan2(WF.vy, WF.vx);
      let dh = Math.atan2(ty - WF.y, tx - WF.x) - h;
      if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
      if (dh > turn) dh = turn; else if (dh < -turn) dh = -turn;
      const sp = Math.sqrt(WF.vx * WF.vx + WF.vy * WF.vy);
      const ns = sp + (speed - sp) * 0.08;
      WF.vx = Math.cos(h + dh) * ns; WF.vy = Math.sin(h + dh) * ns;
      WF.x += WF.vx; WF.y += WF.vy;
      WF.fearR = 90 + ns * 11; WF.fearK = 0.7 + ns * 0.13;
    }
    function startAttack() {
      let tx = flock.cx, ty = flock.cy;
      if (Math.random() < 0.6) {           // отбившаяся птица — самая далёкая от центра
        let best = -1, bd = -1;
        for (let s = 0; s < activeCount; s++) {
          const i = act[s], dx = X[i] - flock.cx, dy = Y[i] - flock.cy, d2 = dx * dx + dy * dy;
          if (d2 > bd) { bd = d2; best = i; }
        }
        if (best >= 0) { tx = X[best]; ty = Y[best]; }
      }
      WF.tx = tx; WF.ty = ty; WF.state = 1; WF.t = 0;
      WF.speed = Math.random() < 0.45 ? 9.5 : 6;   // пикирование или боковой заход
    }

    // ---------- самопроизвольные развороты ----------
    // Разворот начинают несколько птиц, решение пробегает по стае волной примерно за полсекунды (Attanasi et al., 2014).
    let nextTurn = 240;
    function turnStep() {
      if (mode !== 'flock' || !activeCount) return;
      if (--nextTurn > 0) return;
      nextTurn = 210 + Math.random() * 300;
      if (WF.present && WF.state === 1) return;
      const i0 = act[(Math.random() * activeCount) | 0];
      const H = Math.atan2(flock.vy, flock.vx) + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.1);
      const x0 = X[i0], y0 = Y[i0];
      for (let s = 0; s < activeCount; s++) {
        const i = act[s], dx = X[i] - x0, dy = Y[i] - y0;
        if (dx * dx + dy * dy < 45 * 45) { LEADT[i] = 40; LEADH[i] = H; }
      }
    }

    // ---------- точкомёт ----------
    let kills = 0, fireCD = 0;
    const B = { n: 0, x: new Float32Array(512), y: new Float32Array(512), vx: new Float32Array(512), vy: new Float32Array(512), life: new Int16Array(512) };
    const PT = { n: 0, x: new Float32Array(2048), y: new Float32Array(2048), vx: new Float32Array(2048), vy: new Float32Array(2048), life: new Int16Array(2048) };
    const HGW = { cs: 24, minX: 0, minY: 0, cols: 1, rows: 1, start: new Int32Array(2), idx: new Int32Array(0) };
    function buildHitGrid() {
      const n = activeCount;
      if (HGW.idx.length < N) HGW.idx = new Int32Array(N);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let s = 0; s < n; s++) {
        const i = act[s], x = X[i], y = Y[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      let cs = 24, cols = Math.floor((maxX - minX) / cs) + 1, rows = Math.floor((maxY - minY) / cs) + 1;
      while (cols * rows > 2e6) { cs *= 2; cols = Math.floor((maxX - minX) / cs) + 1; rows = Math.floor((maxY - minY) / cs) + 1; }
      const cells = cols * rows;
      if (HGW.start.length < cells + 1) HGW.start = new Int32Array(cells + 1);
      const st = HGW.start;
      st.fill(0, 0, cells + 1);
      for (let s = 0; s < n; s++) {
        const i = act[s];
        const c = Math.floor((Y[i] - minY) / cs) * cols + Math.floor((X[i] - minX) / cs);
        cellOf[s] = c; st[c + 1]++;
      }
      for (let c = 1; c <= cells; c++) st[c] += st[c - 1];
      gFill = gFill.length < cells + 1 ? new Int32Array(cells + 1) : gFill;
      gFill.set(st.subarray(0, cells + 1));
      for (let s = 0; s < n; s++) HGW.idx[gFill[cellOf[s]]++] = act[s];
      HGW.cs = cs; HGW.minX = minX; HGW.minY = minY; HGW.cols = cols; HGW.rows = rows;
    }
    function nearestActive(px, py, range) {
      const { cs, minX, minY, cols, rows, start, idx } = HGW;
      const ci = Math.floor((px - minX) / cs), ri = Math.floor((py - minY) / cs);
      let best = -1, bd2 = range * range;
      const maxK = Math.ceil(range / cs) + 1;
      for (let k = 0; k <= maxK; k++) {
        for (let r = ri - k; r <= ri + k; r++) {
          if (r < 0 || r >= rows) continue;
          const edge = r === ri - k || r === ri + k;
          for (let c = ci - k; c <= ci + k; c += (edge || k === 0) ? 1 : 2 * k) {
            if (c < 0 || c >= cols) continue;
            const cell = r * cols + c;
            for (let q = start[cell], e = start[cell + 1]; q < e; q++) {
              const i = idx[q], dx = X[i] - px, dy = Y[i] - py, d2 = dx * dx + dy * dy;
              if (d2 < bd2) { bd2 = d2; best = i; }
            }
          }
        }
        if (best >= 0 && bd2 <= (k * cs) * (k * cs)) break;
      }
      return best;
    }
    function segmentHit(x0, y0, x1, y1) {
      const { cs, minX, minY, cols, rows, start, idx } = HGW;
      const pad = 10;
      const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - pad - minX) / cs)), c1 = Math.min(cols - 1, Math.floor((Math.max(x0, x1) + pad - minX) / cs));
      const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - pad - minY) / cs)), r1 = Math.min(rows - 1, Math.floor((Math.max(y0, y1) + pad - minY) / cs));
      if (c0 > c1 || r0 > r1) return -1;
      const sx = x1 - x0, sy = y1 - y0, l2 = sx * sx + sy * sy + 1e-6;
      let best = -1, bt = 2;
      for (let r = r0; r <= r1; r++) {
        for (let q = start[r * cols + c0], e = start[r * cols + c1 + 1]; q < e; q++) {
          const i = idx[q];
          if (ST[i] !== 1) continue;
          let t = ((X[i] - x0) * sx + (Y[i] - y0) * sy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x0 + sx * t - X[i], dy = y0 + sy * t - Y[i], rr = gR[GL[i]] * SC[i] + 2;
          if (dx * dx + dy * dy < rr * rr && t < bt) { bt = t; best = i; }
        }
      }
      return best;
    }
    function kill(i) {
      ST[i] = 2; kills++;
      for (let k = 0; k < 7 && PT.n < PT.x.length; k++) {
        const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * 2.8, j = PT.n++;
        PT.x[j] = X[i]; PT.y[j] = Y[i]; PT.vx[j] = Math.cos(a) * v + VX[i] * 0.5; PT.vy[j] = Math.sin(a) * v + VY[i] * 0.5;
        PT.life[j] = 22 + (Math.random() * 14 | 0);
      }
      dirty = true;
    }
    function particlesStep() {
      for (let j = 0; j < PT.n; j++) {
        if (--PT.life[j] <= 0) {
          const L = --PT.n;
          PT.x[j] = PT.x[L]; PT.y[j] = PT.y[L]; PT.vx[j] = PT.vx[L]; PT.vy[j] = PT.vy[L]; PT.life[j] = PT.life[L];
          j--; continue;
        }
        PT.x[j] += PT.vx[j]; PT.y[j] += PT.vy[j]; PT.vx[j] *= 0.92; PT.vy[j] *= 0.92;
      }
    }
    function weaponStep() {
      particlesStep();
      const armed = weapon && (mode === 'horde' || mode === 'flock') && P.inside;
      if (!armed && !B.n) return;
      if (!activeCount) { B.n = 0; return; }
      buildHitGrid();
      const sx = P.cx + global.scrollX, sy = P.cy + global.scrollY, BS = CFG.BULLET_SPEED;
      if (armed && --fireCD <= 0) {
        const t = nearestActive(sx, sy, CFG.FIRE_RANGE);
        if (t >= 0 && B.n < B.x.length) {
          fireCD = CFG.FIRE_EVERY;
          // упреждение: целимся туда, где буква окажется к моменту встречи
          const dx0 = X[t] - sx, dy0 = Y[t] - sy, tt = Math.sqrt(dx0 * dx0 + dy0 * dy0) / BS;
          const ax = dx0 + VX[t] * tt, ay = dy0 + VY[t] * tt, al = Math.sqrt(ax * ax + ay * ay) + 1e-3;
          const j = B.n++;
          B.x[j] = sx; B.y[j] = sy; B.vx[j] = ax / al * BS; B.vy[j] = ay / al * BS; B.life[j] = CFG.BULLET_LIFE;
        } else fireCD = 3;
      }
      for (let b = 0; b < B.n; b++) {
        const x0 = B.x[b], y0 = B.y[b], x1 = x0 + B.vx[b], y1 = y0 + B.vy[b];
        const hit = segmentHit(x0, y0, x1, y1);
        if (hit >= 0 || --B.life[b] <= 0) {
          if (hit >= 0) kill(hit);
          const L = --B.n;
          B.x[b] = B.x[L]; B.y[b] = B.y[L]; B.vx[b] = B.vx[L]; B.vy[b] = B.vy[L]; B.life[b] = B.life[L];
          b--; continue;
        }
        B.x[b] = x1; B.y[b] = y1;
      }
    }
    function revive() {
      for (let i = 0; i < N; i++) {
        if (ST[i] !== 2) continue;
        ST[i] = 0; X[i] = HX[i]; Y[i] = HY[i]; VX[i] = 0; VY[i] = 0; ANG[i] = 0; SC[i] = 1;
      }
      kills = 0; dirty = true;
      if (mode !== 'rest') wakeAll(mode);
      updateHud(true);
    }

""")

# ---------- отрисовка поверх: сокол, герой, пули, осколки ----------
between("      // сокол / герой", "    // запасной путь без WebGL2", r"""      // сокол / сокол-охотник / герой / пули / осколки
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode === 'flock') {
        if (P.inside) {
          octx.strokeStyle = opts.accent; octx.globalAlpha = 0.35; octx.lineWidth = 1;
          octx.setLineDash([4, 6]);
          octx.beginPath(); octx.arc(P.cx, P.cy, CFG.FALCON_R, 0, Math.PI * 2); octx.stroke();
          octx.setLineDash([]); octx.globalAlpha = 1; octx.lineWidth = 2.2;
          octx.beginPath();
          octx.moveTo(P.cx - 13, P.cy - 3); octx.quadraticCurveTo(P.cx - 6, P.cy - 8, P.cx, P.cy + 2);
          octx.quadraticCurveTo(P.cx + 6, P.cy - 8, P.cx + 13, P.cy - 3); octx.stroke();
        }
        if (WF.present) drawFalcon(WF.x - sx, WF.y - sy, Math.atan2(WF.vy, WF.vx), WF.state === 1);
      } else if (mode === 'horde') {
        const hx = P.inside ? P.cx : vw / 2, hy = P.inside ? P.cy : vh / 2;
        octx.fillStyle = opts.accent;
        octx.globalAlpha = 0.18; octx.beginPath(); octx.arc(hx, hy, 18, 0, Math.PI * 2); octx.fill();
        octx.globalAlpha = 1; octx.beginPath(); octx.arc(hx, hy, 8, 0, Math.PI * 2); octx.fill();
      }
      if (B.n) {
        octx.strokeStyle = opts.ink; octx.fillStyle = opts.ink; octx.lineWidth = 1.2;
        octx.globalAlpha = 0.3;
        octx.beginPath();
        for (let b = 0; b < B.n; b++) {
          const x = B.x[b] - sx, y = B.y[b] - sy;
          octx.moveTo(x, y); octx.lineTo(x - B.vx[b] * 1.6, y - B.vy[b] * 1.6);
        }
        octx.stroke();
        octx.globalAlpha = 1;
        octx.beginPath();
        for (let b = 0; b < B.n; b++) {
          const x = B.x[b] - sx, y = B.y[b] - sy;
          octx.moveTo(x + 2.4, y); octx.arc(x, y, 2.4, 0, Math.PI * 2);
        }
        octx.fill();
      }
      if (PT.n) {
        octx.fillStyle = opts.ink;
        for (let j = 0; j < PT.n; j++) {
          octx.globalAlpha = Math.min(1, PT.life[j] / 24);
          octx.fillRect(PT.x[j] - sx - 1, PT.y[j] - sy - 1, 2.2, 2.2);
        }
      }
      octx.globalAlpha = 1;
    }

    // силуэт сокола: острые крылья, при атаке сложены
    function drawFalcon(x, y, a, stoop) {
      const c = Math.cos(a), s = Math.sin(a);
      octx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * x, dpr * y);
      const w = stoop ? 6 : 14, back = stoop ? -10 : -6;
      octx.fillStyle = opts.accent;
      octx.beginPath();
      octx.moveTo(12, 0);
      octx.quadraticCurveTo(3, -2.5, back, -w);
      octx.lineTo(-2, -2.6); octx.lineTo(-13, -2.2); octx.lineTo(-13, 2.2); octx.lineTo(-2, 2.6);
      octx.lineTo(back, w);
      octx.quadraticCurveTo(3, 2.5, 12, 0);
      octx.fill();
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

""")

# ---------- переход в «Покой»: стая стекает на ночлег ----------
rep("""      mode = m;
      if (m === 'rest') {
        for (let i = 0; i < N; i++) if (ST[i]) CALMT[i] = CFG.CALM;
      } else {""", """      const prev = mode;
      mode = m;
      if (m === 'rest') {
        // птицы садятся не разом: нижние раньше, верхние позже — стая «стекает» на ночлег
        const syp = global.scrollY;
        for (let i = 0; i < N; i++) {
          if (ST[i] !== 1) continue;
          const yN = Math.min(1, Math.max(0, (Y[i] - syp) / vh));
          CALMT[i] = CFG.CALM - (prev === 'flock' ? (1 - yN) * 150 + Math.random() * 40 : Math.random() * 25);
        }
        B.n = 0;
      } else {""")

# ---------- панель ----------
rep("      else if (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М') setVolume(!volume);",
    "      else if (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М') setVolume(!volume);\n"
    "      else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') setWeapon(!weapon);\n"
    "      else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') setFalcon(!WF.on);")
rep("    function setVolume(on) {", """    function setWeapon(on) { weapon = on; if (!on) B.n = 0; updateHud(true); }
    function setFalcon(on) { WF.on = on; if (!on) WF.present = false; updateHud(true); }
    function setVolume(on) {""")
rep("      else if (g === 'vol') setVolume(v === '1');",
    "      else if (g === 'vol') setVolume(v === '1');\n"
    "      else if (g === 'gun') setWeapon(v === '1');\n"
    "      else if (g === 'wf') setFalcon(v === '1');\n"
    "      else if (g === 'revive') revive();")
rep("            (b.dataset.g === 'vol' && (b.dataset.v === '1') === volume) ||",
    "            (b.dataset.g === 'vol' && (b.dataset.v === '1') === volume) ||\n"
    "            (b.dataset.g === 'gun' && (b.dataset.v === '1') === weapon) ||\n"
    "            (b.dataset.g === 'wf' && (b.dataset.v === '1') === WF.on) ||")
rep("          if (b.dataset.g !== 'min') b.setAttribute('aria-pressed', on ? 'true' : 'false');",
    "          if (b.dataset.g !== 'min' && b.dataset.g !== 'revive') b.setAttribute('aria-pressed', on ? 'true' : 'false');")
rep("      $('#fps').textContent = Math.round(fpsE);",
    "      $('#fps').textContent = Math.round(fpsE);\n      $('#kills').textContent = fmtInt(kills);\n      $('#revive').disabled = kills === 0;")
rep("return { fps: fpsE, simMs: simE,", "return { kills, falcon: WF.present ? (WF.state ? 'attack' : 'patrol') : 'off', weapon, fps: fpsE, simMs: simE,")
rep("""        <div class="row"><span class="lbl">Тела букв</span><div class="seg">
          <button type="button" data-g="vol" data-v="1" aria-pressed="false"><kbd>V</kbd>С объёмом и массой</button>
          <button type="button" data-g="vol" data-v="0" aria-pressed="false">Призраки</button></div></div>""",
    """        <div class="row"><span class="lbl">Тела букв</span><div class="seg">
          <button type="button" data-g="vol" data-v="1" aria-pressed="false"><kbd>V</kbd>С объёмом и массой</button>
          <button type="button" data-g="vol" data-v="0" aria-pressed="false">Призраки</button></div></div>
        <div class="row"><span class="lbl">Хищник в мурмурации</span><div class="seg">
          <button type="button" data-g="wf" data-v="1" aria-pressed="false"><kbd>H</kbd>Сокол-охотник</button>
          <button type="button" data-g="wf" data-v="0" aria-pressed="false">Нет</button></div></div>
        <div class="row"><span class="lbl">Оружие героя</span><div class="seg">
          <button type="button" data-g="gun" data-v="1" aria-pressed="false"><kbd>F</kbd>Точкомёт</button>
          <button type="button" data-g="gun" data-v="0" aria-pressed="false">Выкл</button>
          <button type="button" data-g="revive" id="revive" disabled>Вернуть сбитые · <span id="kills">0</span></button></div></div>""")
rep("        width: min(372px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px 14px 12px;",
    "        width: min(372px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px 14px 12px;\n"
    "        max-height: calc(100vh - 32px); overflow-y: auto;")
rep("      button.on { background: var(--acc); border-color: var(--acc); }",
    "      button.on { background: var(--acc); border-color: var(--acc); }\n"
    "      button:disabled { opacity: 0.45; cursor: default; }")

# ---------- запуск: снять случайное выделение ----------
rep("    // ---------- запуск ----------\n    sizeCanvas();",
    "    // ---------- запуск ----------\n    try { global.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }\n    sizeCanvas();")

p.write_text(s, encoding="utf-8")
print("patched", len(s))
