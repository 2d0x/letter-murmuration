    // ---------- симуляция v2 ----------
    // 1) восприятие: K ближайших соседей (честно ближайших, не «первых найденных»);
    // 2) правила: дистанция, выравнивание, сближение + страх столкновения по времени до него;
    // 3) тело: жёсткие столкновения кругов с массой (position-based), отдельной мелкой сеткой.
    let R_SEE = CFG.R_REST;
    const kIdx = new Int32Array(64), kD2 = new Float32Array(64), allIdx = new Int32Array(1024);
    let steerE = 0, collE = 0, contactsAvg = 0, overlapAvg = 0;

    function kInsert(kc, K, b, d2) {
      let j;
      if (kc < K) j = kc++;
      else if (d2 < kD2[K - 1]) j = K - 1;
      else return kc;
      while (j > 0 && kD2[j - 1] > d2) { kD2[j] = kD2[j - 1]; kIdx[j] = kIdx[j - 1]; j--; }
      kD2[j] = d2; kIdx[j] = b;
      return kc;
    }

    // сложить влияние выбранных соседей на букву a (индексы — в отсортированных массивах q*)
    function accumulate(a, list, m) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, tx = 0, ty = 0;
      const xa = qx[a], ya = qy[a], vxa = qvx[a], vya = qvy[a], ra = qr[a];
      const P2 = CFG.PERSONAL, T0 = CFG.TAU0, TK = CFG.TTC_K, TM = CFG.TTC_MAX;
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
        // страх столкновения: время до столкновения τ, сила ∝ e^(−τ/τ0)/τ² (Karamouzas et al., 2014)
        const rvx = vxa - qvx[b], rvy = vya - qvy[b];
        const A = rvx * rvx + rvy * rvy;
        if (A > 1e-4) {
          const B = dx * rvx + dy * rvy;
          if (B > 0) {
            const RR = rs * 1.15, C = d2 - RR * RR;
            if (C > 0) {
              const disc = B * B - A * C;
              if (disc > 0) {
                const tau = (B - Math.sqrt(disc)) / A;
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
      nsx[a] = sx; nsy[a] = sy; nax[a] = ax; nay[a] = ay; ncx[a] = cx; ncy[a] = cy; ntx[a] = tx; nty[a] = ty; nct[a] = m;
    }

    function neighbourPass(n) {
      R_SEE = mode === 'flock' ? CFG.R_FLY : mode === 'horde' ? CFG.R_HORDE : CFG.R_REST;
      const R2 = R_SEE * R_SEE, K = CFG.K;
      if (algo === 'straight' || algo === 'naive') {
        for (let s = 0; s < n; s++) {
          const i = act[s];
          ord[s] = i; qx[s] = X[i]; qy[s] = Y[i]; qvx[s] = VX[i]; qvy[s] = VY[i]; qr[s] = gR[GL[i]] * SC[i];
        }
        if (algo === 'straight') {
          nsx.fill(0, 0, n); nsy.fill(0, 0, n); ntx.fill(0, 0, n); nty.fill(0, 0, n); nct.fill(0, 0, n);
          nbAvg = 0;
          return;
        }
        let tot = 0;
        for (let a = 0; a < n; a++) {
          const xa = qx[a], ya = qy[a];
          let kc = 0;
          for (let b = 0; b < n; b++) {
            if (b === a) continue;
            const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
            if (d2 < R2) kc = kInsert(kc, K, b, d2);
          }
          accumulate(a, kIdx, kc); tot += kc;
        }
        nbAvg = n ? tot / n : 0;
        return;
      }
      // равномерная сетка с ячейкой = радиусу обзора; данные переложены подряд по ячейкам
      let cs = R_SEE;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let s = 0; s < n; s++) {
        const i = act[s], x = X[i], y = Y[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      let cols = Math.floor((maxX - minX) / cs) + 1, rows = Math.floor((maxY - minY) / cs) + 1;
      while (cols * rows > 4e6) { cs *= 2; cols = Math.floor((maxX - minX) / cs) + 1; rows = Math.floor((maxY - minY) / cs) + 1; }
      const cells = cols * rows;
      if (gStart.length < cells + 1) { gStart = new Int32Array(cells + 1); gFill = new Int32Array(cells + 1); }
      const start = gStart, fill = gFill;
      start.fill(0, 0, cells + 1);
      for (let s = 0; s < n; s++) {
        const i = act[s];
        const c = Math.floor((Y[i] - minY) / cs) * cols + Math.floor((X[i] - minX) / cs);
        cellOf[s] = c; start[c + 1]++;
      }
      for (let c = 1; c <= cells; c++) start[c] += start[c - 1];
      fill.set(start.subarray(0, cells + 1));
      for (let s = 0; s < n; s++) {
        const i = act[s], k = fill[cellOf[s]]++;
        ord[k] = i; qx[k] = X[i]; qy[k] = Y[i]; qvx[k] = VX[i]; qvy[k] = VY[i]; qr[k] = gR[GL[i]] * SC[i];
      }
      const topK = algo === 'gridK';
      const cap = allIdx.length;
      let tot = 0;
      for (let a = 0; a < n; a++) {
        const xa = qx[a], ya = qy[a];
        const ci = Math.floor((xa - minX) / cs), ri = Math.floor((ya - minY) / cs);
        const c0 = ci > 0 ? ci - 1 : 0, c1 = ci + 1 < cols ? ci + 1 : cols - 1;
        const r0 = ri > 0 ? ri - 1 : 0, r1 = ri + 1 < rows ? ri + 1 : rows - 1;
        let kc = 0, m = 0;
        for (let r = r0; r <= r1; r++) {
          const base = r * cols;
          for (let b = start[base + c0], e = start[base + c1 + 1]; b < e; b++) {
            if (b === a) continue;
            const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              if (topK) kc = kInsert(kc, K, b, d2);
              else if (m < cap) allIdx[m++] = b;
            }
          }
        }
        if (topK) { accumulate(a, kIdx, kc); tot += kc; } else { accumulate(a, allIdx, m); tot += m; }
      }
      nbAvg = n ? tot / n : 0;
    }

    let simTime = 0;
    function step() {
      const n = collectActive();
      activeCount = n;
      if (!n) { nbAvg = 0; contactsAvg = 0; overlapAvg = 0; return; }
      if (algo === 'naive' && n > CFG.NAIVE_LIMIT) {
        toast(`Все пары для ${fmtInt(n)} букв — это ${fmtBig(n * n)} проверок за кадр, вкладка зависнет. Переключил на сетку + 7 соседей.`);
        setAlgo('gridK', true);
      }
      const t0 = performance.now();
      neighbourPass(n);
      behave(n);
      const t1 = performance.now();
      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      const t2 = performance.now();
      steerE += (t1 - t0 - steerE) * 0.1;
      collE += (t2 - t1 - collE) * 0.1;
    }

    function behave(n) {
      simTime += CFG.STEP_MS / 1000;
      const sxp = global.scrollX, syp = global.scrollY;
      const pX = P.cx + sxp, pY = P.cy + syp;
      const rx = sxp + vw / 2 + vw * 0.22 * Math.sin(simTime * 0.31);
      const ry = syp + vh * 0.45 + vh * 0.16 * Math.sin(simTime * 0.47 + 1.3);
      // радиус «неба» над гнездовьем растёт с числом птиц, чтобы стая не спрессовалась
      const r0 = Math.max(140, Math.min(Math.min(vw, vh) * 0.42, Math.sqrt(n * 81 / Math.PI)));
      const heroX = P.inside ? pX : sxp + vw / 2, heroY = P.inside ? pY : syp + vh / 2;
      const FR = CFG.FALCON_R;

      for (let s = 0; s < n; s++) {
        const i = ord[s];
        const x = qx[s], y = qy[s];
        let vx = qvx[s], vy = qvy[s];
        let ax = 0, ay = 0;
        const cnt = nct[s];
        const inv = cnt ? 1 / cnt : 0;
        let minS = 0, maxS = 5, targetAng = NaN;
        const am = gAcc[GL[i]];         // тяжёлые буквы разгоняются и тормозят медленнее
        CALMT[i] += 1;

        if (mode === 'flock') {
          if (cnt) {
            ax += nsx[s] * 0.9 + (nax[s] * inv - vx) * 0.08 + ncx[s] * inv * 0.003 + ntx[s];
            ay += nsy[s] * 0.9 + (nay[s] * inv - vy) * 0.08 + ncy[s] * inv * 0.003 + nty[s];
          }
          const dx = rx - x, dy = ry - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          const pull = d > r0 ? Math.min(0.4, 0.04 + 0.15 * (d - r0) / r0) : 0.003;
          ax += dx / d * pull; ay += dy / d * pull;
          const ex = x - sxp, ey = y - syp, wm = 70;
          if (ex < wm) ax += (wm - ex) * 0.006; else if (ex > vw - wm) ax -= (ex - vw + wm) * 0.006;
          if (ey < wm) ay += (wm - ey) * 0.006; else if (ey > vh - wm) ay -= (ey - vh + wm) * 0.006;
          maxS = 4.6 + Math.min(9, Math.max(0, d - r0 * 2) / 120);
          minS = 2;
          if (P.inside) {
            const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
            if (fd < FR) {
              const f = 1 - fd / FR;
              ax += fx / fd * f * f * 1.6; ay += fy / fd * f * f * 1.6;
              maxS += f * 3;
            }
          }
          ax += (Math.random() - 0.5) * 0.06; ay += (Math.random() - 0.5) * 0.06;
        } else if (mode === 'horde') {
          if (cnt) {
            ax += nsx[s] * 0.7 + (nax[s] * inv - vx) * 0.02 + ntx[s] * 0.8;
            ay += nsy[s] * 0.7 + (nay[s] * inv - vy) * 0.02 + nty[s] * 0.8;
          }
          const dx = heroX - x, dy = heroY - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          const boost = Math.min(8, Math.max(0, d - 500) / 100);
          // в давке задние не продавливают передних: напор слабеет, когда тело упирается в соседей
          const c = CONT[i];
          const crowd = volume ? (c >= 3 ? 0.35 : c >= 1 ? 0.7 : 1) : (cnt >= 6 ? 0.45 : 1);
          const want = (3.3 + boost) * crowd;
          ax += (dx / d * want - vx) * 0.07; ay += (dy / d * want - vy) * 0.07;
          if (!volume && d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = 3.6 + boost;
        } else { // rest
          const hx = HX[i] - x, hy = HY[i] - y, hd = Math.sqrt(hx * hx + hy * hy);
          if (CALMT[i] < CFG.CALM) {
            if (cnt) {
              ax += nsx[s] * 0.8 + (nax[s] * inv - vx) * 0.05 + ncx[s] * inv * 0.002 + ntx[s] * 0.6;
              ay += nsy[s] * 0.8 + (nay[s] * inv - vy) * 0.05 + ncy[s] * inv * 0.002 + nty[s] * 0.6;
            }
            if (P.inside) {
              const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
              if (fd < 90) { const f = 1 - fd / 90; ax += fx / fd * f * 0.8; ay += fy / fd * f * 0.8; }
            }
            ay -= 0.02;
            vx *= 0.985; vy *= 0.985;
          } else {
            const near = Math.min(1, hd / 30);
            if (cnt) { ax += (nsx[s] * 0.6 + ntx[s] * 0.5) * near; ay += (nsy[s] * 0.6 + nty[s] * 0.5) * near; }
            if (hd > 0.01) {
              const want = Math.min(9, hd * 0.09);
              ax += (hx / hd * want - vx) * 0.18; ay += (hy / hd * want - vy) * 0.18;
            }
            maxS = 9;
            if (hd < 40) targetAng = 0;
          }
        }

        vx += ax * am; vy += ay * am;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > maxS * maxS) { const k = maxS / Math.sqrt(sp2); vx *= k; vy *= k; }
        else if (minS > 0 && sp2 < minS * minS) {
          if (sp2 > 1e-6) { const k = minS / Math.sqrt(sp2); vx *= k; vy *= k; } else { vx = minS; }
        }
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
    }

    // тела: круги с радиусом по «чернилам» буквы и массой ∝ площади; жёсткое разведение пересечений
    function collide(nAct) {
      const modeScale = mode === 'flock' ? CFG.FLY_SCALE : mode === 'horde' ? CFG.HORDE_SCALE : 1;
      let n = 0;
      for (let s = 0; s < nAct; s++) {
        const i = act[s];
        if (mode === 'rest' && CALMT[i] >= CFG.CALM) {
          const hx = HX[i] - X[i], hy = HY[i] - Y[i];
          if (hx * hx + hy * hy < 400) { CONT[i] = 0; continue; } // у своего места буква «садится» без толкотни
        }
        cAct[n++] = i;
      }
      if (n < 2) { contactsAvg = 0; overlapAvg = 0; return; }
      let cs = Math.max(4, 2 * CFG.R_SMALL * modeScale);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let s = 0; s < n; s++) {
        const i = cAct[s], x = X[i], y = Y[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      let cols = Math.floor((maxX - minX) / cs) + 1, rows = Math.floor((maxY - minY) / cs) + 1;
      while (cols * rows > 4e6) { cs *= 2; cols = Math.floor((maxX - minX) / cs) + 1; rows = Math.floor((maxY - minY) / cs) + 1; }
      const half = cs / 2, cells = cols * rows;
      if (cStart.length < cells + 1) { cStart = new Int32Array(cells + 1); cFill = new Int32Array(cells + 1); }
      const start = cStart;
      start.fill(0, 0, cells + 1);
      for (let s = 0; s < n; s++) {
        const i = cAct[s];
        const c = Math.floor((Y[i] - minY) / cs) * cols + Math.floor((X[i] - minX) / cs);
        cCell[s] = c; start[c + 1]++;
      }
      for (let c = 1; c <= cells; c++) start[c] += start[c - 1];
      cFill.set(start.subarray(0, cells + 1));
      for (let s = 0; s < n; s++) {
        const i = cAct[s], k = cFill[cCell[s]]++;
        cOrd[k] = i; px_[k] = X[i]; py_[k] = Y[i]; pvx_[k] = VX[i]; pvy_[k] = VY[i];
        pr_[k] = gR[GL[i]] * SC[i]; pm_[k] = gIM[GL[i]];
        pw_[k] = CALMT[i] < 20 ? CALMT[i] / 20 : 1;       // только что взлетевшие расходятся плавно
        cCol[k] = Math.floor((X[i] - minX) / cs); cRow[k] = Math.floor((Y[i] - minY) / cs);
      }
      let contacts = 0, ovSum = 0;
      const RELAX = CFG.RELAX, BOUNCE = CFG.BOUNCE;
      for (let it = 0; it < CFG.COLL_ITERS; it++) {
        cX.fill(0, 0, n); cY.fill(0, 0, n); cVX.fill(0, 0, n); cVY.fill(0, 0, n); cCnt.fill(0, 0, n);
        for (let a = 0; a < n; a++) {
          const ra = pr_[a], bigA = ra > half;
          const xa = px_[a], ya = py_[a];
          const span = bigA ? Math.ceil((ra + half) / cs) : 1;
          const ci = cCol[a], ri = cRow[a];
          const c0 = ci - span > 0 ? ci - span : 0, c1 = ci + span < cols ? ci + span : cols - 1;
          const r0 = ri - span > 0 ? ri - span : 0, r1 = ri + span < rows ? ri + span : rows - 1;
          for (let r = r0; r <= r1; r++) {
            const base = r * cols;
            for (let b = start[base + c0], e = start[base + c1 + 1]; b < e; b++) {
              if (b === a) continue;
              const rb = pr_[b], bigB = rb > half;
              if (bigB && !bigA) continue;          // пару «мелкая–крупная» разбирает крупная
              if (bigA && bigB && b < a) continue;  // пару крупных — один раз
              let dx = xa - px_[b], dy = ya - py_[b];
              const rs = ra + rb, d2 = dx * dx + dy * dy;
              if (d2 >= rs * rs) continue;
              let d = Math.sqrt(d2), nx, ny;
              if (d < 1e-3) { const g = (a * 2.399963 + b) % 6.2832; nx = Math.cos(g); ny = Math.sin(g); d = 0; }
              else { nx = dx / d; ny = dy / d; }
              const ov = rs - d;
              const ima = pm_[a], imb = pm_[b], wa = ima / (ima + imb), wb = 1 - wa;
              const st = pw_[a] < pw_[b] ? pw_[a] : pw_[b];
              const corr = ov * RELAX * st;
              const vn = (pvx_[a] - pvx_[b]) * nx + (pvy_[a] - pvy_[b]) * ny;
              const imp = vn < 0 ? -(1 + BOUNCE) * vn * st : 0;
              cX[a] += nx * corr * wa; cY[a] += ny * corr * wa; cVX[a] += nx * imp * wa; cVY[a] += ny * imp * wa; cCnt[a]++;
              if (bigA) { cX[b] -= nx * corr * wb; cY[b] -= ny * corr * wb; cVX[b] -= nx * imp * wb; cVY[b] -= ny * imp * wb; cCnt[b]++; }
              if (it === 0) { const w = bigA ? 2 : 1; contacts += w; ovSum += ov * w; }
            }
          }
        }
        for (let a = 0; a < n; a++) {
          const c = cCnt[a];
          if (it === 0) CONT[cOrd[a]] = c > 255 ? 255 : c;
          if (!c) continue;
          const k = c > 2 ? 2 / c : 1;   // усреднение по числу контактов (Якоби) — без «взрывов» в давке
          px_[a] += cX[a] * k; py_[a] += cY[a] * k; pvx_[a] += cVX[a] * k; pvy_[a] += cVY[a] * k;
        }
      }
      if (mode === 'horde') {   // герой — твёрдое тело бесконечной массы
        const hx = P.inside ? P.cx + global.scrollX : global.scrollX + vw / 2;
        const hy = P.inside ? P.cy + global.scrollY : global.scrollY + vh / 2;
        for (let a = 0; a < n; a++) {
          const dx = px_[a] - hx, dy = py_[a] - hy, rs = CFG.HERO_R + pr_[a], d2 = dx * dx + dy * dy;
          if (d2 < rs * rs) {
            const d = Math.sqrt(d2) + 1e-3, nx = dx / d, ny = dy / d;
            px_[a] = hx + nx * rs; py_[a] = hy + ny * rs;
            const vn = pvx_[a] * nx + pvy_[a] * ny;
            if (vn < 0) { pvx_[a] -= nx * vn; pvy_[a] -= ny * vn; }
          }
        }
      }
      for (let a = 0; a < n; a++) {
        const i = cOrd[a];
        X[i] = px_[a]; Y[i] = py_[a]; VX[i] = pvx_[a]; VY[i] = pvy_[a];
      }
      contactsAvg = contacts / n;
      overlapAvg = contacts ? ovSum / contacts : 0;
    }

