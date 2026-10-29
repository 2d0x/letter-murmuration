/*!
 * LetterSwarm — каждая буква страницы становится птицей.
 * Правила Рейнольдса (расталкивание, выравнивание, сближение) + лимит 7 соседей
 * (скворцы, Ballerini et al., PNAS 2008). Соседи ищутся через равномерную сетку.
 * Использование: LetterSwarm.start(rootElement, options)
 */
(function (global) {
  'use strict';

  if (global.LetterSwarm && global.LetterSwarm.__instance) {
    try { global.LetterSwarm.__instance.destroy(); } catch (e) { /* ignore */ }
  }

  const CFG = {
    R: 24,             // радиус соседства, px
    SEP: 11,           // радиус расталкивания, px
    SEP_FLY: 8,        // то же в мурмурации: летящие буквы мельче
    SEP_HORDE: 10,
    FLY_SCALE: 0.55,   // размер буквы в полёте (птицы вдалеке)
    HORDE_SCALE: 0.8,  // размер буквы-моба в орде
    K: 7,              // лимит соседей в режиме «сетка + 7»
    NAIVE_LIMIT: 9000, // выше этого перебор всех пар вешает вкладку
    FALCON_R: 130,     // радиус испуга от сокола (курсора)
    STARTLE_R: 40,     // радиус, в котором курсор спугивает спящие буквы
    SHOCK_R: 240,      // радиус взрывной волны по клику
    CALM: 70,          // шагов «паники» до возвращения домой
    STEP_MS: 1000 / 60,
  };

  const OFF_C = [0, -1, 1, 0, 0, -1, 1, -1, 1];
  const OFF_R = [0, 0, 0, -1, 1, -1, -1, 1, 1];

  const MODES = [
    ['rest', 'Покой', '1'],
    ['flock', 'Мурмурация', '2'],
    ['horde', 'Орда', '3'],
  ];
  const ALGOS = [
    ['straight', 'По прямой'],
    ['naive', 'Все пары O(N²)'],
    ['grid', 'Сетка'],
    ['gridK', 'Сетка + 7 соседей'],
  ];
  const HINTS = {
    rest: 'Проведите курсором по строкам: буквы вспорхнут и вернутся. Клик даёт взрывную волну.',
    flock: 'Курсор стал соколом: стая расступается волной. Клик даёт взрывную волну.',
    horde: 'Курсор стал героем: буквы бегут к нему и окружают. Клик отбрасывает их.',
  };

  function start(root, userOpts) {
    const opts = Object.assign({
      wakeScope: 'all',        // 'all' — будить все буквы; 'near' — только около экрана
      escToDestroy: false,
      multipliers: null,       // например [1, 2, 4, 8] — кнопки объёма текста
      multiplier: 1,
      onMultiplier: null,
      accent: '#8c2f39',
      title: 'Мурмурация букв',
    }, userOpts || {});
    root = root || document.body;
    const doc = document;

    let dpr = Math.min(global.devicePixelRatio || 1, 2);
    let vw = global.innerWidth, vh = global.innerHeight;
    let mode = 'rest', algo = 'gridK';
    let destroyed = false;

    // ---------- DOM: холст, стиль скрытия текста, панель ----------
    const mkCanvas = (cls) => {
      const c = doc.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      c.className = cls;
      Object.assign(c.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483000' });
      doc.body.appendChild(c);
      return c;
    };
    const canvas = mkCanvas('ls-canvas');          // буквы
    const overlay = mkCanvas('ls-overlay');        // сокол, герой
    const octx = overlay.getContext('2d');
    let glr = opts.renderer === '2d' ? null : makeGLRenderer(canvas);
    const ctx = glr ? null : canvas.getContext('2d');

    const hideStyle = doc.createElement('style');
    hideStyle.textContent =
      '.ls-hidden,.ls-hidden *{color:transparent!important;-webkit-text-fill-color:transparent!important;' +
      'text-shadow:none!important;text-decoration-color:transparent!important}';
    doc.head.appendChild(hideStyle);

    const hudHost = doc.createElement('div');
    Object.assign(hudHost.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483001' });
    doc.body.appendChild(hudHost);
    const shadow = hudHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = hudMarkup(opts);
    const $ = (sel) => shadow.querySelector(sel);

    // ---------- данные букв ----------
    let N = 0;
    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, inst = new Float32Array(0);
    let act, ord, qx, qy, qvx, qvy, nsx, nsy, nax, nay, ncx, ncy, nct, cellOf;
    let gStart = new Int32Array(2), gFill = new Int32Array(2);
    // глифы
    let atlas = null, gSX, gSY, gCW, gCH;
    // статичная сетка по «домашним» позициям — для пробуждения
    const HG = { cell: 48, minX: 0, minY: 0, cols: 1, rows: 1, start: null, idx: null };

    let activeCount = 0, nbAvg = 0;

    function build() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      root.classList.remove('ls-hidden');
      const sx = global.scrollX, sy = global.scrollY;
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          if (p.closest('script,style,noscript,textarea,input,select,option,svg,math,canvas,iframe')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const range = doc.createRange();
      const styleCache = new Map();
      const keyMap = new Map();
      const gCh = [], gFont = [], gColor = [], gW = [], gH = [];
      const iG = [], iX = [], iY = [];
      let node;
      while ((node = walker.nextNode())) {
        const p = node.parentElement;
        let st = styleCache.get(p);
        if (st === undefined) {
          const cs = global.getComputedStyle(p);
          st = cs.visibility !== 'visible' ? null : {
            font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily,
            color: cs.color,
            tt: cs.textTransform,
          };
          styleCache.set(p, st);
        }
        if (!st) continue;
        const t = node.nodeValue;
        for (let i = 0; i < t.length; i++) {
          const c = t.charCodeAt(i);
          if (c === 32 || c === 10 || c === 9 || c === 13 || c === 160 || c === 0x200b || c === 0xad) continue;
          const len = (c >= 0xd800 && c <= 0xdbff && i + 1 < t.length) ? 2 : 1;
          range.setStart(node, i);
          range.setEnd(node, i + len);
          const r = range.getBoundingClientRect();
          let ch = t.slice(i, i + len);
          i += len - 1;
          if (r.width < 0.5 || r.height < 0.5) continue;
          if (st.tt === 'uppercase') ch = ch.toUpperCase();
          else if (st.tt === 'lowercase') ch = ch.toLowerCase();
          const key = st.font + '\u0001' + st.color + '\u0001' + ch;
          let g = keyMap.get(key);
          if (g === undefined) {
            g = gCh.length;
            keyMap.set(key, g);
            gCh.push(ch); gFont.push(st.font); gColor.push(st.color); gW.push(r.width); gH.push(r.height);
          }
          iG.push(g);
          iX.push(r.left + sx + r.width / 2);
          iY.push(r.top + sy + r.height / 2);
        }
      }
      root.classList.add('ls-hidden');

      buildAtlas(gCh, gFont, gColor, gW, gH);

      N = iG.length;
      const F = () => new Float32Array(N);
      HX = Float32Array.from(iX); HY = Float32Array.from(iY);
      X = Float32Array.from(iX); Y = Float32Array.from(iY);
      VX = F(); VY = F(); ANG = F(); CALMT = F(); SC = F(); SC.fill(1);
      inst = new Float32Array(N * 5);
      GL = Uint16Array.from(iG); ST = new Uint8Array(N);
      act = new Int32Array(N); ord = new Int32Array(N); cellOf = new Int32Array(N);
      qx = F(); qy = F(); qvx = F(); qvy = F();
      nsx = F(); nsy = F(); nax = F(); nay = F(); ncx = F(); ncy = F(); nct = new Uint16Array(N);
      buildHomeGrid();
      activeCount = 0;
      if (mode !== 'rest') wakeAll(mode);
      dirty = true;
    }

    function buildAtlas(gCh, gFont, gColor, gW, gH) {
      const n = gCh.length;
      gSX = new Float32Array(n); gSY = new Float32Array(n); gCW = new Float32Array(n); gCH = new Float32Array(n);
      const pads = new Float32Array(n), bases = new Float32Array(n);
      const m = doc.createElement('canvas').getContext('2d');
      const AW = 1024;
      let cx = 0, cy = 0, rowH = 0;
      for (let g = 0; g < n; g++) {
        m.font = gFont[g];
        const mt = m.measureText(gCh[g]);
        const w = gW[g], h = gH[g];
        const asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent;
        bases[g] = (asc > 0 && desc >= 0) ? h * asc / (asc + desc) : h * 0.8;
        const pad = Math.ceil(Math.max(3, h * 0.25));
        pads[g] = pad;
        const cw = w + pad * 2, chh = h + pad * 2;
        if (cx + cw > AW) { cx = 0; cy += Math.ceil(rowH) + 1; rowH = 0; }
        gSX[g] = cx; gSY[g] = cy; gCW[g] = cw; gCH[g] = chh;
        cx += Math.ceil(cw) + 1;
        if (chh > rowH) rowH = chh;
      }
      atlas = doc.createElement('canvas');
      atlas.width = Math.ceil(AW * dpr);
      atlas.height = Math.max(1, Math.ceil((cy + rowH + 1) * dpr));
      const a = atlas.getContext('2d');
      a.setTransform(dpr, 0, 0, dpr, 0, 0);
      a.textBaseline = 'alphabetic';
      for (let g = 0; g < n; g++) {
        a.font = gFont[g];
        a.fillStyle = gColor[g];
        a.fillText(gCh[g], gSX[g] + pads[g], gSY[g] + pads[g] + bases[g]);
      }
      // в пикселях атласа
      for (let g = 0; g < n; g++) { gSX[g] *= dpr; gSY[g] *= dpr; }
      if (glr) glr.upload(atlas, gSX, gSY, gCW, gCH);
    }

    function buildHomeGrid() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < N; i++) {
        if (HX[i] < minX) minX = HX[i]; if (HX[i] > maxX) maxX = HX[i];
        if (HY[i] < minY) minY = HY[i]; if (HY[i] > maxY) maxY = HY[i];
      }
      if (!N) { minX = minY = 0; maxX = maxY = 1; }
      const c = HG.cell;
      HG.minX = minX; HG.minY = minY;
      HG.cols = Math.floor((maxX - minX) / c) + 1;
      HG.rows = Math.floor((maxY - minY) / c) + 1;
      const cells = HG.cols * HG.rows;
      HG.start = new Int32Array(cells + 1);
      HG.idx = new Int32Array(N);
      const cell = new Int32Array(N);
      for (let i = 0; i < N; i++) {
        const k = Math.floor((HY[i] - minY) / c) * HG.cols + Math.floor((HX[i] - minX) / c);
        cell[i] = k; HG.start[k + 1]++;
      }
      for (let k = 1; k <= cells; k++) HG.start[k] += HG.start[k - 1];
      const fill = HG.start.slice();
      for (let i = 0; i < N; i++) HG.idx[fill[cell[i]]++] = i;
    }

    // обойти буквы, чей дом в радиусе rad от точки (px, py)
    function forHomesNear(px, py, rad, fn) {
      if (!N) return;
      const c = HG.cell;
      const c0 = Math.max(0, Math.floor((px - rad - HG.minX) / c)), c1 = Math.min(HG.cols - 1, Math.floor((px + rad - HG.minX) / c));
      const r0 = Math.max(0, Math.floor((py - rad - HG.minY) / c)), r1 = Math.min(HG.rows - 1, Math.floor((py + rad - HG.minY) / c));
      const rad2 = rad * rad;
      for (let r = r0; r <= r1; r++) {
        for (let k = HG.start[r * HG.cols + c0], e = HG.start[r * HG.cols + c1 + 1]; k < e; k++) {
          const i = HG.idx[k];
          const dx = HX[i] - px, dy = HY[i] - py;
          if (dx * dx + dy * dy < rad2) fn(i, dx, dy);
        }
      }
    }

    function wakeAll(m) {
      const top = global.scrollY - vh, bottom = global.scrollY + vh * 2;
      for (let i = 0; i < N; i++) {
        if (opts.wakeScope === 'near' && ST[i] === 0 && (HY[i] < top || HY[i] > bottom)) continue;
        if (ST[i] === 0) {
          ST[i] = 1;
          if (m === 'flock') { VX[i] = (Math.random() - 0.5) * 2; VY[i] = -1 - Math.random() * 2.5; }
          else { VX[i] = 0; VY[i] = 0; }
        }
        CALMT[i] = 0;
      }
    }

    // ---------- указатель ----------
    const P = { cx: -1e4, cy: -1e4, pcx: -1e4, pcy: -1e4, vx: 0, vy: 0, inside: false };
    const onMove = (e) => { P.cx = e.clientX; P.cy = e.clientY; P.inside = true; };
    const onLeave = () => { P.inside = false; };
    const onDown = (e) => {
      if (e.button !== 0 || e.composedPath().includes(hudHost)) return;
      shockwave(e.clientX + global.scrollX, e.clientY + global.scrollY);
    };
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === '1') setMode('rest');
      else if (e.key === '2') setMode('flock');
      else if (e.key === '3') setMode('horde');
      else if (e.key === 'Escape' && opts.escToDestroy) destroy();
    };
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { sizeCanvas(); build(); }, 250);
    };
    global.addEventListener('pointermove', onMove, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onLeave);
    global.addEventListener('pointerdown', onDown);
    global.addEventListener('keydown', onKey);
    global.addEventListener('resize', onResize);
    const onFonts = () => onResize();
    if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', onFonts);

    function shockwave(px, py) {
      const R = CFG.SHOCK_R;
      forHomesNear(px, py, R, (i) => { if (ST[i] === 0) { ST[i] = 1; VX[i] = 0; VY[i] = 0; } });
      for (let i = 0; i < N; i++) {
        if (!ST[i]) continue;
        const dx = X[i] - px, dy = Y[i] - py, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
        if (d < R) {
          const f = (1 - d / R) * 9;
          VX[i] += dx / d * f; VY[i] += dy / d * f;
          if (mode === 'rest') CALMT[i] = 0;
        }
      }
      dirty = true;
    }

    // ---------- симуляция ----------
    function collectActive() {
      let n = 0;
      for (let i = 0; i < N; i++) if (ST[i]) act[n++] = i;
      return n;
    }

    let sepR = CFG.SEP;
    function neighbourPass(n) {
      sepR = mode === 'flock' ? CFG.SEP_FLY : mode === 'horde' ? CFG.SEP_HORDE : CFG.SEP;
      if (algo === 'straight') {
        for (let s = 0; s < n; s++) {
          const i = act[s];
          ord[s] = i; qx[s] = X[i]; qy[s] = Y[i]; qvx[s] = VX[i]; qvy[s] = VY[i]; nct[s] = 0;
        }
        nbAvg = 0;
        return;
      }
      if (algo === 'naive') {
        for (let s = 0; s < n; s++) {
          const i = act[s];
          ord[s] = i; qx[s] = X[i]; qy[s] = Y[i]; qvx[s] = VX[i]; qvy[s] = VY[i];
        }
        const R2 = CFG.R * CFG.R, S2 = sepR * sepR;
        let tot = 0;
        for (let a = 0; a < n; a++) {
          let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
          const xa = qx[a], ya = qy[a];
          for (let b = 0; b < n; b++) {
            if (b === a) continue;
            const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              cnt++; ax += qvx[b]; ay += qvy[b]; cx += dx; cy += dy;
              if (d2 < S2 && d2 > 1e-4) { sx -= dx / d2; sy -= dy / d2; }
            }
          }
          nsx[a] = sx; nsy[a] = sy; nax[a] = ax; nay[a] = ay; ncx[a] = cx; ncy[a] = cy; nct[a] = cnt; tot += cnt;
        }
        nbAvg = n ? tot / n : 0;
        return;
      }
      // равномерная сетка: сортировка подсчётом по ячейкам, данные переложены подряд
      const K = algo === 'gridK' ? CFG.K : 1 << 30;
      let cs = CFG.R;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let s = 0; s < n; s++) {
        const i = act[s];
        const x = X[i], y = Y[i];
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
        const i = act[s];
        const k = fill[cellOf[s]]++;
        ord[k] = i; qx[k] = X[i]; qy[k] = Y[i]; qvx[k] = VX[i]; qvy[k] = VY[i];
      }
      const R2 = CFG.R * CFG.R, S2 = sepR * sepR;
      let tot = 0;
      for (let a = 0; a < n; a++) {
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
        const xa = qx[a], ya = qy[a];
        const ci = Math.floor((xa - minX) / cs), ri = Math.floor((ya - minY) / cs);
        // обход: своя ячейка, затем 4 по сторонам, затем 4 по диагонали —
        // при лимите K первыми попадаются ближайшие соседи
        outer:
        for (let t = 0; t < 9; t++) {
          const c = ci + OFF_C[t], r = ri + OFF_R[t];
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const cell = r * cols + c;
          for (let b = start[cell], e = start[cell + 1]; b < e; b++) {
            if (b === a) continue;
            const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              cnt++; ax += qvx[b]; ay += qvy[b]; cx += dx; cy += dy;
              if (d2 < S2 && d2 > 1e-4) { sx -= dx / d2; sy -= dy / d2; }
              if (cnt >= K) break outer;
            }
          }
        }
        nsx[a] = sx; nsy[a] = sy; nax[a] = ax; nay[a] = ay; ncx[a] = cx; ncy[a] = cy; nct[a] = cnt; tot += cnt;
      }
      nbAvg = n ? tot / n : 0;
    }

    let simTime = 0;
    function step() {
      const n = collectActive();
      activeCount = n;
      if (!n) { nbAvg = 0; return; }
      if (algo === 'naive' && n > CFG.NAIVE_LIMIT) {
        toast(`Все пары для ${fmtInt(n)} букв — это ${fmtBig(n * n)} проверок за кадр, вкладка зависнет. Переключил на сетку + 7 соседей.`);
        setAlgo('gridK', true);
      }
      neighbourPass(n);
      simTime += CFG.STEP_MS / 1000;

      const sxp = global.scrollX, syp = global.scrollY;
      const pX = P.cx + sxp, pY = P.cy + syp;
      const rx = sxp + vw / 2 + vw * 0.22 * Math.sin(simTime * 0.31);
      const ry = syp + vh * 0.45 + vh * 0.16 * Math.sin(simTime * 0.47 + 1.3);
      // радиус «неба» над гнездовьем растёт с числом птиц, чтобы стая не спрессовалась в ком
      const r0 = Math.max(140, Math.min(Math.min(vw, vh) * 0.42, Math.sqrt(n * CFG.SEP_FLY * CFG.SEP_FLY / Math.PI)));
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

        if (mode === 'flock') {
          if (cnt) {
            ax += nsx[s] * 1.8 + (nax[s] * inv - vx) * 0.08 + ncx[s] * inv * 0.003;
            ay += nsy[s] * 1.8 + (nay[s] * inv - vy) * 0.08 + ncy[s] * inv * 0.003;
          }
          const dx = rx - x, dy = ry - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          const pull = d > r0 ? Math.min(0.4, 0.04 + 0.15 * (d - r0) / r0) : 0.003;
          ax += dx / d * pull; ay += dy / d * pull;
          // мягкие стенки: стая разворачивается у краёв экрана
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
            ax += nsx[s] * 3.0 + (nax[s] * inv - vx) * 0.02;
            ay += nsy[s] * 3.0 + (nay[s] * inv - vy) * 0.02;
          }
          const dx = heroX - x, dy = heroY - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          const boost = Math.min(8, Math.max(0, d - 500) / 100);
          // в давке задние не продавливают передних: напор слабеет, когда вокруг тесно
          const crowd = cnt >= 6 ? 0.45 : 1;
          const want = (3.3 + boost) * crowd;
          ax += (dx / d * want - vx) * 0.07; ay += (dy / d * want - vy) * 0.07;
          if (d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = 3.6 + boost;
        } else { // rest
          CALMT[i] += 1;
          const hx = HX[i] - x, hy = HY[i] - y, hd = Math.sqrt(hx * hx + hy * hy);
          if (CALMT[i] < CFG.CALM) {
            if (cnt) {
              ax += nsx[s] * 1.2 + (nax[s] * inv - vx) * 0.05 + ncx[s] * inv * 0.002;
              ay += nsy[s] * 1.2 + (nay[s] * inv - vy) * 0.05 + ncy[s] * inv * 0.002;
            }
            if (P.inside) {
              const fx = x - pX, fy = y - pY, fd = Math.sqrt(fx * fx + fy * fy) + 1e-3;
              if (fd < 90) { const f = 1 - fd / 90; ax += fx / fd * f * 0.8; ay += fy / fd * f * 0.8; }
            }
            ay -= 0.02;
            vx *= 0.985; vy *= 0.985;
          } else {
            if (cnt) {
              const sepW = Math.min(1, hd / 30) * 0.6;
              ax += nsx[s] * sepW; ay += nsy[s] * sepW;
            }
            if (hd > 0.01) {
              const want = Math.min(9, hd * 0.09);
              ax += (hx / hd * want - vx) * 0.18; ay += (hy / hd * want - vy) * 0.18;
            }
            maxS = 9;
            if (hd < 40) targetAng = 0;
          }
        }

        vx += ax; vy += ay;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > maxS * maxS) { const k = maxS / Math.sqrt(sp2); vx *= k; vy *= k; }
        else if (minS > 0 && sp2 < minS * minS) {
          if (sp2 > 1e-6) { const k = minS / Math.sqrt(sp2); vx *= k; vy *= k; } else { vx = minS; }
        }
        let nx = x + vx, ny = y + vy;

        // курс: буква наклоняется в сторону полёта, но остаётся «головой вверх»
        if (targetAng !== targetAng) { // NaN
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

    // спугнуть буквы под быстро движущимся курсором (режим «Покой»)
    const reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function startle() {
      if (reduceMotion || mode !== 'rest' || !P.inside) return; // при «уменьшить движение» — только по явным действиям
      const sp = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
      if (sp < 4) return;
      const px = P.cx + global.scrollX, py = P.cy + global.scrollY;
      forHomesNear(px, py, CFG.STARTLE_R, (i, dx, dy) => {
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
        if (ST[i] === 0) {
          ST[i] = 1;
          const k = 2 + Math.random() * 1.5;
          VX[i] = dx / d * k + P.vx * 0.25;
          VY[i] = dy / d * k + P.vy * 0.25 - 1;
        }
        CALMT[i] = 0;
      });
      dirty = true;
    }

    // ---------- отрисовка ----------
    function sizeCanvas() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      vw = global.innerWidth; vh = global.innerHeight;
      for (const c of [canvas, overlay]) {
        c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr);
        c.style.width = vw + 'px'; c.style.height = vh + 'px';
      }
      dirty = true;
    }

    function draw() {
      const sx = global.scrollX, sy = global.scrollY;
      const m = 40;
      if (atlas && N) {
        // буфер экземпляров: x, y (экран, css px), угол, глиф, масштаб; сначала спящие, потом летящие
        let k = 0;
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < N; i++) {
            if ((ST[i] !== 0) !== (pass === 1)) continue;
            const x = (pass ? X[i] : HX[i]) - sx, y = (pass ? Y[i] : HY[i]) - sy;
            if (y < -m || y > vh + m || x < -m || x > vw + m) continue;
            inst[k] = x; inst[k + 1] = y; inst[k + 2] = pass ? ANG[i] : 0; inst[k + 3] = GL[i]; inst[k + 4] = pass ? SC[i] : 1;
            k += 5;
          }
        }
        if (glr && !glr.lost) glr.draw(inst, k / 5, vw, vh, dpr);
        else if (ctx) draw2D(k / 5);
      }
      // сокол / герой
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (P.inside && mode === 'flock') {
        octx.strokeStyle = opts.accent; octx.globalAlpha = 0.35; octx.lineWidth = 1;
        octx.setLineDash([4, 6]);
        octx.beginPath(); octx.arc(P.cx, P.cy, CFG.FALCON_R, 0, Math.PI * 2); octx.stroke();
        octx.setLineDash([]); octx.globalAlpha = 1; octx.lineWidth = 2.2;
        octx.beginPath();
        octx.moveTo(P.cx - 13, P.cy - 3); octx.quadraticCurveTo(P.cx - 6, P.cy - 8, P.cx, P.cy + 2);
        octx.quadraticCurveTo(P.cx + 6, P.cy - 8, P.cx + 13, P.cy - 3); octx.stroke();
      } else if (mode === 'horde') {
        const hx = P.inside ? P.cx : vw / 2, hy = P.inside ? P.cy : vh / 2;
        octx.fillStyle = opts.accent;
        octx.globalAlpha = 0.18; octx.beginPath(); octx.arc(hx, hy, 18, 0, Math.PI * 2); octx.fill();
        octx.globalAlpha = 1; octx.beginPath(); octx.arc(hx, hy, 8, 0, Math.PI * 2); octx.fill();
      }
      octx.globalAlpha = 1;
    }

    // запасной путь без WebGL2: Canvas2D, по одному drawImage на букву
    function draw2D(count) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      for (let j = 0; j < count; j++) {
        const o = j * 5;
        const x = inst[o], y = inst[o + 1], a = inst[o + 2], g = inst[o + 3], sc = inst[o + 4];
        const w = gCW[g], h = gCH[g];
        if (a === 0 && sc === 1) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.drawImage(atlas, gSX[g], gSY[g], w * dpr, h * dpr,
            Math.round((x - w / 2) * dpr) / dpr, Math.round((y - h / 2) * dpr) / dpr, w, h);
        } else {
          const c = Math.cos(a) * dpr * sc, s = Math.sin(a) * dpr * sc;
          ctx.setTransform(c, s, -s, c, dpr * x, dpr * y);
          ctx.drawImage(atlas, gSX[g], gSY[g], w * dpr, h * dpr, -w / 2, -h / 2, w, h);
        }
      }
    }

    // ---------- цикл ----------
    let raf = 0, last = 0, acc = 0, dirty = true, lastSX = -1, lastSY = -1, lastHud = 0;
    let fpsE = 60, simE = 0, drawE = 0;
    function frame(now) {
      if (destroyed) return;
      raf = global.requestAnimationFrame(frame);
      const dt = last ? Math.min(100, now - last) : CFG.STEP_MS;
      last = now;
      fpsE += (1000 / Math.max(1, dt) - fpsE) * 0.08;

      P.vx = P.pcx > -1e3 ? P.cx - P.pcx : 0; P.vy = P.pcy > -1e3 ? P.cy - P.pcy : 0;
      P.pcx = P.cx; P.pcy = P.cy;
      startle();

      acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= CFG.STEP_MS && steps < 2) { step(); acc -= CFG.STEP_MS; steps++; }
      if (steps === 2 && acc > CFG.STEP_MS) acc = 0;
      const t1 = performance.now();
      if (steps) simE += ((t1 - t0) / steps - simE) * 0.1;

      const sx = global.scrollX, sy = global.scrollY;
      if (activeCount || dirty || sx !== lastSX || sy !== lastSY || mode !== 'rest') {
        draw();
        drawE += (performance.now() - t1 - drawE) * 0.1;
        dirty = false; lastSX = sx; lastSY = sy;
      }
      if (now - lastHud > 250) { lastHud = now; updateHud(); }
    }

    // ---------- панель ----------
    function setMode(m, silent) {
      if (m === mode) return;
      if ((m === 'flock' || m === 'horde') && algo === 'naive' && N > CFG.NAIVE_LIMIT) {
        setAlgo('gridK', true);
        toast(`В полёт поднимутся ${fmtInt(N)} букв: перебор всех пар не потянет. Включил сетку + 7 соседей.`);
      }
      mode = m;
      if (m === 'rest') {
        for (let i = 0; i < N; i++) if (ST[i]) CALMT[i] = CFG.CALM;
      } else {
        wakeAll(m);
      }
      dirty = true;
      if (!silent) updateHud(true);
    }
    function setAlgo(a, silent) {
      if (a === 'naive') {
        const n = mode === 'rest' ? activeCount : N;
        if (n > CFG.NAIVE_LIMIT) {
          toast(`Все пары для ${fmtInt(n)} букв — это ${fmtBig(n * n)} проверок за кадр, вкладка зависнет. Уменьшите текст или выберите сетку.`);
          return;
        }
      }
      algo = a;
      if (!silent) updateHud(true);
      else updateHud(true);
    }

    shadow.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'mode') setMode(v);
      else if (g === 'algo') setAlgo(v);
      else if (g === 'mult' && opts.onMultiplier) {
        opts.multiplier = +v;
        updateHud(true);
        opts.onMultiplier(+v);
      } else if (g === 'min') {
        $('.hud').classList.toggle('collapsed');
        b.setAttribute('aria-expanded', $('.hud').classList.contains('collapsed') ? 'false' : 'true');
      }
    });

    let toastTimer = 0;
    function toast(msg) {
      const t = $('.toast');
      t.textContent = msg; t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
    }

    function updateHud(structural) {
      if (structural) {
        shadow.querySelectorAll('button[data-g]').forEach((b) => {
          const on = (b.dataset.g === 'mode' && b.dataset.v === mode) ||
            (b.dataset.g === 'algo' && b.dataset.v === algo) ||
            (b.dataset.g === 'mult' && +b.dataset.v === opts.multiplier);
          b.classList.toggle('on', on);
          if (b.dataset.g !== 'min') b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('.hint').textContent = HINTS[mode];
      }
      $('#fps').textContent = Math.round(fpsE);
      $('#sim').textContent = fmtMs(simE);
      $('#drw').textContent = fmtMs(drawE);
      $('#tot').textContent = fmtInt(N);
      $('#act').textContent = fmtInt(activeCount);
      $('#rnd').textContent = glr && !glr.lost ? 'WebGL2' : 'Canvas2D';
      $('#nb').textContent = activeCount && algo !== 'straight' ? nbAvg.toFixed(1).replace('.', ',') : '—';
      const budget = CFG.STEP_MS;
      const ws = Math.min(100, simE / budget * 100), wd = Math.min(100 - ws, drawE / budget * 100);
      $('#bsim').style.width = ws + '%';
      $('#bdrw').style.width = wd + '%';
      $('.bar').classList.toggle('over', simE + drawE > budget);
    }

    function destroy() {
      destroyed = true;
      global.cancelAnimationFrame(raf);
      global.removeEventListener('pointermove', onMove);
      doc.documentElement.removeEventListener('pointerleave', onLeave);
      global.removeEventListener('pointerdown', onDown);
      global.removeEventListener('keydown', onKey);
      global.removeEventListener('resize', onResize);
      if (doc.fonts && doc.fonts.removeEventListener) doc.fonts.removeEventListener('loadingdone', onFonts);
      root.classList.remove('ls-hidden');
      canvas.remove(); overlay.remove(); hudHost.remove(); hideStyle.remove();
      if (global.LetterSwarm && global.LetterSwarm.__instance === api) global.LetterSwarm.__instance = null;
    }

    // ---------- запуск ----------
    sizeCanvas();
    build();
    updateHud(true);
    raf = global.requestAnimationFrame(frame);

    const api = {
      setMode, setAlgo, destroy,
      rebuild() { build(); updateHud(true); },
      // прогнать симуляцию на n шагов синхронно (для тестов и замеров)
      advance(n) { const t0 = performance.now(); for (let k = 0; k < n; k++) { startle(); step(); } const ms = (performance.now() - t0) / n; draw(); updateHud(); return ms; },
      pointer(cx, cy) { P.cx = cx; P.cy = cy; P.inside = true; },
      stats() {
        return { fps: fpsE, simMs: simE, drawMs: drawE, letters: N, active: activeCount, neighbours: nbAvg, mode, algo, renderer: glr && !glr.lost ? 'webgl2' : 'canvas2d' };
      },
      cfg: CFG,
    };
    global.LetterSwarm.__instance = api;
    return api;
  }


  // ---------- WebGL2: все буквы одним вызовом (instanced quads + атлас глифов) ----------
  function makeGLRenderer(canvas) {
    let gl;
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    const VS = `#version 300 es
      layout(location=0) in vec2 aCorner;
      layout(location=1) in vec4 aInst;   // x, y, angle, glyph
      layout(location=2) in float aScale;
      uniform vec2 uView; uniform float uDpr; uniform vec2 uAtlas;
      uniform highp sampler2D uGlyphs;    // RGBA32F: atlasX, atlasY (px), w, h (css px)
      out vec2 vUV;
      void main() {
        int g = int(aInst.w + 0.5);
        vec4 gr = texelFetch(uGlyphs, ivec2(g % 256, g / 256), 0);
        vec2 size = gr.zw;
        vec2 center = aInst.xy;
        if (aInst.z == 0.0 && aScale == 1.0) {          // спящая буква: привязка к пиксельной сетке
          vec2 tl = floor((center - size * 0.5) * uDpr + 0.5) / uDpr;
          center = tl + size * 0.5;
        }
        vec2 p = aCorner * size * aScale;
        float c = cos(aInst.z), s = sin(aInst.z);
        p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        vec2 pos = (center + p) / uView * 2.0 - 1.0;
        gl_Position = vec4(pos.x, -pos.y, 0.0, 1.0);
        vUV = (gr.xy + (aCorner + 0.5) * size * uDpr) / uAtlas;
      }`;
    const FS = `#version 300 es
      precision mediump float;
      in vec2 vUV; uniform sampler2D uTex; out vec4 o;
      void main() { o = texture(uTex, vUV); }`;
    const sh = (type, src) => {
      const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('LetterSwarm: WebGL2 недоступен, рисую через Canvas2D', e);
      return null;
    }
    const U = (n) => gl.getUniformLocation(prog, n);
    const uView = U('uView'), uDpr = U('uDpr'), uAtlas = U('uAtlas'), uGlyphs = U('uGlyphs'), uTex = U('uTex');
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    const texAtlas = gl.createTexture(), texGlyphs = gl.createTexture();
    let atlasW = 1, atlasH = 1;
    let lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

    return {
      get lost() { return lost; },
      upload(atlas, gSX, gSY, gCW, gCH) {
        atlasW = atlas.width; atlasH = atlas.height;
        gl.bindTexture(gl.TEXTURE_2D, texAtlas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const n = gSX.length, rows = Math.max(1, Math.ceil(n / 256));
        const t = new Float32Array(256 * rows * 4);
        for (let g = 0; g < n; g++) { t[g * 4] = gSX[g]; t[g * 4 + 1] = gSY[g]; t[g * 4 + 2] = gCW[g]; t[g * 4 + 3] = gCH[g]; }
        gl.bindTexture(gl.TEXTURE_2D, texGlyphs);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, rows, 0, gl.RGBA, gl.FLOAT, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      },
      draw(inst, count, vw, vh, dpr) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!count) return;
        gl.useProgram(prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform2f(uView, vw, vh); gl.uniform1f(uDpr, dpr); gl.uniform2f(uAtlas, atlasW, atlasH);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texAtlas); gl.uniform1i(uTex, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGlyphs); gl.uniform1i(uGlyphs, 1);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, count * 5), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        gl.bindVertexArray(null);
      },
    };
  }

  function fmtInt(n) { return Math.round(n).toLocaleString('ru-RU'); }
  function fmtMs(ms) { return ms.toFixed(1).replace('.', ',') + ' мс'; }
  function fmtBig(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' млрд';
    if (n >= 1e6) return Math.round(n / 1e6) + ' млн';
    return fmtInt(n);
  }

  function hudMarkup(opts) {
    const seg = (g, list) => list.map(([v, label, key]) =>
      `<button type="button" data-g="${g}" data-v="${v}" aria-pressed="false">${key ? `<kbd>${key}</kbd>` : ''}${label}</button>`).join('');
    const mult = opts.multipliers ? `
      <div class="row"><span class="lbl">Объём текста</span><div class="seg">${
        opts.multipliers.map((k) => `<button type="button" data-g="mult" data-v="${k}" aria-pressed="false">×${k}</button>`).join('')
      }</div></div>` : '';
    return `<style>
      :host { all: initial; }
      .hud { --bg: rgba(24, 21, 31, 0.86); --fg: #f3ede6; --mut: #b9b0bd; --line: rgba(243, 237, 230, 0.16);
        --acc: ${opts.accent}; --acc2: #d9a441;
        width: min(372px, calc(100vw - 32px)); box-sizing: border-box; padding: 14px 14px 12px;
        background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 12px;
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
        box-shadow: 0 12px 40px rgba(20, 16, 30, 0.35);
        font: 13px/1.4 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .top b { font-weight: 600; font-size: 14px; letter-spacing: 0.01em; }
      .body { display: grid; gap: 10px; margin-top: 10px; }
      .collapsed .body { display: none; }
      .row { display: grid; gap: 5px; }
      .lbl { color: var(--mut); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .seg { display: flex; flex-wrap: wrap; gap: 4px; }
      button { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line);
        border-radius: 7px; padding: 5px 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      button:hover { border-color: rgba(243, 237, 230, 0.45); }
      button:focus-visible { outline: 2px solid var(--acc2); outline-offset: 2px; }
      button.on { background: var(--acc); border-color: var(--acc); }
      .min { padding: 2px 9px; font-size: 15px; line-height: 1; }
      kbd { font: 11px 'IBM Plex Mono', ui-monospace, monospace; color: var(--mut); border: 1px solid var(--line);
        border-radius: 4px; padding: 0 4px; }
      button.on kbd { color: var(--fg); border-color: rgba(243, 237, 230, 0.5); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 10px; padding-top: 10px; border-top: 1px solid var(--line); }
      .stats div { display: grid; gap: 1px; }
      .stats span { color: var(--mut); font-size: 11px; }
      .stats b { font: 500 15px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .budget { display: grid; gap: 4px; }
      .budget span { color: var(--mut); font-size: 11px; }
      .budget em { font-style: normal; color: var(--fg); }
      .bar { display: flex; height: 6px; border-radius: 3px; background: rgba(243, 237, 230, 0.1); overflow: hidden; }
      .bar i { display: block; height: 100%; }
      #bsim { background: var(--acc2); }
      #bdrw { background: #8fb3d9; }
      .bar.over { box-shadow: 0 0 0 1px #e0645a; }
      .legend { display: flex; gap: 12px; color: var(--mut); font-size: 11px; }
      .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
      .hint { color: var(--mut); font-size: 12px; }
      .toast { background: rgba(224, 100, 90, 0.16); border: 1px solid rgba(224, 100, 90, 0.5); color: #ffd9d3;
        border-radius: 7px; padding: 7px 9px; font-size: 12px; }
      .toast[hidden] { display: none; }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    </style>
    <div class="hud" role="region" aria-label="Управление стаей букв">
      <div class="top"><b>${opts.title}</b>
        <button type="button" class="min" data-g="min" aria-expanded="true" aria-label="Свернуть или развернуть панель">–</button></div>
      <div class="body">
        <div class="row"><span class="lbl">Поведение</span><div class="seg">${seg('mode', MODES)}</div></div>
        <div class="row"><span class="lbl">Поиск соседей</span><div class="seg">${seg('algo', ALGOS)}</div></div>
        ${mult}
        <div class="stats">
          <div><span>кадров/с</span><b id="fps">—</b></div>
          <div><span>симуляция</span><b id="sim">—</b></div>
          <div><span>отрисовка</span><b id="drw">—</b></div>
          <div><span>букв всего</span><b id="tot">—</b></div>
          <div><span>в полёте</span><b id="act">—</b></div>
          <div><span>соседей ⌀</span><b id="nb">—</b></div>
        </div>
        <div class="budget">
          <span>Бюджет кадра 16,7 мс при 60 кадрах/с · <em id="rnd"></em></span>
          <div class="bar"><i id="bsim"></i><i id="bdrw"></i></div>
          <div class="legend"><span><i style="background:var(--acc2)"></i>симуляция</span><span><i style="background:#8fb3d9"></i>отрисовка</span></div>
        </div>
        <div class="hint"></div>
        <div class="toast" role="status" hidden></div>
      </div>
    </div>`;
  }

  global.LetterSwarm = { start, __instance: null };
})(window);

// Автозапуск: на Википедии — текст статьи, на любом другом сайте — вся страница.
// Буквы поднимаются только около экрана. Esc — выключить и вернуть страницу как было.
LetterSwarm.start(
  document.querySelector('#mw-content-text') || document.querySelector('main, article') || document.body,
  { wakeScope: 'near', escToDestroy: true }
);
