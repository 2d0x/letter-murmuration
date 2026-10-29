/*!
 * LetterSwarm v6 — каждая буква страницы становится птицей с телом.
 * Правила Рейнольдса (расталкивание, выравнивание, сближение) + лимит 7 соседей
 * (скворцы, Ballerini et al., PNAS 2008), страх столкновения по времени до него
 * (Karamouzas et al., PRL 2014), тела-круги с массой и жёсткими столкновениями (position-based).
 * Использование: LetterSwarm.start(rootElement, options)
 */
(function (global) {
  'use strict';

  if (global.LetterSwarm && global.LetterSwarm.__instance) {
    try { global.LetterSwarm.__instance.destroy(); } catch (e) { /* ignore */ }
  }

  const CFG = {
    K: 7,              // топологический лимит: 7 ближайших соседей (скворцы)
    R_REST: 24,        // радиус обзора в покое, px
    R_FLY: 14,         // в мурмурации
    R_HORDE: 12,       // в орде
    STEER_EVERY: 2,    // восприятие соседей обновляется раз в 2 шага (по очереди), тела — каждый шаг
    PERSONAL: 1.7,     // личное пространство: × сумма радиусов тел
    TAU0: 24,          // горизонт страха столкновения, шагов (≈0,4 с)
    TTC_K: 20,         // сила страха столкновения
    TTC_MAX: 0.6,
    R_SMALL: 5,        // буквы с радиусом больше — «крупные», ищут контакты шире
    COLL_ITERS: 2,     // итераций разведения тел за шаг (в разреженной стае — 1)
    RELAX: 0.8,
    BOUNCE: 0.15,      // упругость удара (0 — вязко, 1 — мячики)
    HERO_R: 16,
    NAIVE_LIMIT: 9000, // выше этого перебор всех пар вешает вкладку
    FALCON_R: 130,     // радиус испуга от сокола (курсора)
    STARTLE_R: 40,     // радиус, в котором курсор спугивает спящие буквы
    SHOCK_R: 240,      // радиус взрывной волны по клику
    CALM: 70,          // шагов «паники» до возвращения домой
    FLY_SCALE: 0.55,   // размер буквы в полёте (птицы вдалеке)
    HORDE_SCALE: 0.8,  // размер буквы-моба в орде
    HORDE_SPEED: 3.0,  // базовый шаг орды, px/шаг; × лёгкость знака × личный разброс ±10%
    FLY_CRUISE: 4.0,   // крейсерская скорость птицы: почти постоянна, птица не умеет зависать
    MAX_TURN: 0.09,    // поворот за шаг, рад: разворот по дуге с креном, а не на месте
    FIRE_RATE: 10,     // точкомёт: выстрелов в секунду; каждая пуля берёт свою цель
    BULLET_SPEED: 12,  // px/шаг
    BULLET_LIFE: 60,
    FIRE_RANGE: 420,
    ZOMBIE_SIGHT: 450, // с какого расстояния зомби замечает героя, px; крупные буквы видят дальше
    WAVE_SPEED: 22,    // скорость волны взлёта, px/шаг: экран примерно за секунду
    HORDE_REACT: 0.25, // среднее время реакции зомби, с: у каждого своё (×0,5…×1,5), так толпа не дёргается разом
    OB_MARGIN: 34,     // отступ птиц от картинок, px
    OB_LOOK: 22,       // на сколько шагов вперёд птица высматривает препятствие
    LOOKAHEAD: 12,     // на сколько шагов вперёд птица прикидывает путь сокола
    PANIC_DECAY: 0.94, // как быстро гаснет паника
    STEP_MS: 1000 / 60,
  };

  const COS_TURN = Math.cos(CFG.MAX_TURN), SIN_TURN = Math.sin(CFG.MAX_TURN);
  // ползунки панели: ключ CFG, подпись, мин, макс, шаг, единицы
  const TUNABLES = [
    ['HORDE_SPEED', 'Базовая скорость орды', 0.5, 8, 0.1, 'px/шаг'],
    ['ZOMBIE_SIGHT', 'Обзор зомби', 40, 2000, 10, 'px'],
    ['FLY_CRUISE', 'Скорость птиц', 1.5, 8, 0.1, 'px/шаг'],
    ['FALCON_R', 'Испуг от сокола', 40, 400, 5, 'px'],
    ['K', 'Соседей (K)', 1, 20, 1, ''],
    ['WAVE_SPEED', 'Волна взлёта', 4, 80, 1, 'px/шаг'],
    ['HORDE_REACT', 'Реакция зомби', 0, 1.5, 0.05, 'с'],
    ['OB_MARGIN', 'Отступ птиц от картинок', 0, 100, 2, 'px'],
    ['FIRE_RATE', 'Скорострельность', 2, 240, 1, 'в с'],
    ['BULLET_SPEED', 'Скорость пуль', 4, 40, 1, 'px/шаг'],
  ];
  const TUNE_DEFAULTS = {};
  TUNABLES.forEach(([k]) => { TUNE_DEFAULTS[k] = CFG[k]; });
  const fmtTune = (k, v) => k === 'ZOMBIE_SIGHT' && v >= 1990 ? 'видят всех'
    : (Math.round(v * 10) / 10).toString().replace('.', ',') + (TUNABLES.find((t) => t[0] === k)[5] ? ' ' + TUNABLES.find((t) => t[0] === k)[5] : '');
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
    flock: 'Стая кружит над гнездовьем и сама затевает развороты. Сокол-охотник атакует сам, курсор — второй сокол: птицы уходят с его пути, тревога бежит по стае волной. Картинки — препятствия.',
    horde: 'Курсор стал героем. Зомби замечают его в радиусе обзора и реагируют каждый со своей задержкой, остальные бродят, пока их не увлечёт толпа. Точки и запятые бегут быстрее, великаны — медленнее всех. Клик отбрасывает.',
  };

  function start(root, userOpts) {
    const opts = Object.assign({
      wakeScope: 'all',        // 'all' — будить все буквы; 'near' — только около экрана
      escToDestroy: false,
      multipliers: null,       // например [1, 2, 4, 8] — кнопки объёма текста
      multiplier: 1,
      onMultiplier: null,
      accent: '#8c2f39',
      title: 'Мурмурация букв · v6',
      volume: true,
      weapon: false,
      wildFalcon: true,
      ink: '#1c1922',
    }, userOpts || {});
    root = root || document.body;
    const doc = document;

    let dpr = Math.min(global.devicePixelRatio || 1, 2);
    let vw = global.innerWidth, vh = global.innerHeight;
    let mode = 'rest', algo = 'gridK';
    let volume = opts.volume !== false;
    let weapon = opts.weapon === true;
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
      '.ls-hidden,.ls-hidden *:not(.ls-ui):not(.ls-ui *):not(.ls-keep):not(.ls-keep *){color:transparent!important;-webkit-text-fill-color:transparent!important;' +
      'text-shadow:none!important;text-decoration-color:transparent!important;' +
      '-webkit-user-select:none!important;user-select:none!important}' +
      '.ls-hidden ::marker{color:initial!important;-webkit-text-fill-color:initial!important}' +
      '.ls-hidden .ls-ui{-webkit-text-fill-color:currentcolor!important}';
    doc.head.appendChild(hideStyle);

    const hudHost = doc.createElement('div');
    hudHost.className = 'ls-ui';
    Object.assign(hudHost.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483001', color: '#000', webkitTextFillColor: 'currentcolor' });
    doc.body.appendChild(hudHost);
    const shadow = hudHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = hudMarkup(opts);
    const $ = (sel) => shadow.querySelector(sel);

    // ---------- данные букв ----------
    let N = 0;
    let HX, HY, X, Y, VX, VY, ANG, SC, GL, ST, CALMT, WK, IV, LEADT, LEADH, inst = new Float32Array(0);
    let WAKEAT, AG, WA, PN;      // время взлёта в волне, «в погоне» (зомби), курс бродяги, паника (птицы)
    let TX, TY, RT, WS, SIDE, SDT; // зомби: где он «видит» героя (с запаздыванием), личная реакция, решённый темп, сторона обхода и сколько её держать
    let OB = new Float32Array(0), OBN = 0;   // препятствия: прямоугольники картинок x0, y0, x1, y1
    // ST: 0 — спит на своём месте, 1 — в полёте, 2 — сбита
    let act, ord, qx, qy, qvx, qvy, qr, nsx, nsy, nax, nay, ncx, ncy, ntx, nty, nfg, nfv, nfl, nct, nag, npm, cellOf, CONT;
    let cAct, cOrd, cCell, cCol, cRow, px_, py_, pvx_, pvy_, pr_, pm_, pw_, cX, cY, cVX, cVY, cCnt;
    let cStart = new Int32Array(2), cFill = new Int32Array(2);
    let gStart = new Int32Array(2), gFill = new Int32Array(2);
    // глифы
    let atlas = null, gSX, gSY, gCW, gCH, gR, gIM, gAcc, gSpd, gSee;
    let glyphChars = [];
    // статичная сетка по «домашним» позициям — для пробуждения
    const HG = { cell: 48, minX: 0, minY: 0, cols: 1, rows: 1, start: null, idx: null };

    let activeCount = 0, nbAvg = 0;

    // закреплённые блоки (шапки, липкие меню) при прокрутке едут вместе с экраном, а буквы живут в координатах страницы —
    // такие блоки не превращаем в птиц, а оставляем обычным видимым текстом
    let keepEls = [];
    function releaseKeep() {
      for (const [el, c, f] of keepEls) { el.classList.remove('ls-keep'); el.style.color = c; el.style.webkitTextFillColor = f; }
      keepEls = [];
    }
    function build() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      root.classList.remove('ls-hidden');
      releaseKeep();
      const pinMemo = new Map();
      const pinnedTop = (el) => {
        if (!el || el === root || el === doc.body || el === doc.documentElement) return null;
        let v = pinMemo.get(el);
        if (v !== undefined) return v;
        const up = pinnedTop(el.parentElement);
        if (up) v = up;
        else { const pos = global.getComputedStyle(el).position; v = pos === 'fixed' || pos === 'sticky' ? el : null; }
        pinMemo.set(el, v);
        return v;
      };
      const keepSet = new Set();
      const sx = global.scrollX, sy = global.scrollY;
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          if (p.closest('script,style,noscript,textarea,input,select,option,svg,math,canvas,iframe,.ls-ui')) {
            return NodeFilter.FILTER_REJECT;
          }
          const pin = pinnedTop(p);
          if (pin) { keepSet.add(pin); return NodeFilter.FILTER_REJECT; }
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
      for (const el of keepSet) {
        const cs = global.getComputedStyle(el);
        keepEls.push([el, el.style.color, el.style.webkitTextFillColor]);
        el.style.color = cs.color; el.style.webkitTextFillColor = cs.webkitTextFillColor || 'currentcolor';
        el.classList.add('ls-keep');
      }
      root.classList.add('ls-hidden');

      buildAtlas(gCh, gFont, gColor, gW, gH);
      glyphChars = gCh;

      N = iG.length;
      const F = () => new Float32Array(N);
      HX = Float32Array.from(iX); HY = Float32Array.from(iY);
      X = Float32Array.from(iX); Y = Float32Array.from(iY);
      VX = F(); VY = F(); ANG = F(); CALMT = F(); SC = F(); SC.fill(1);
      WK = new Uint8Array(N); LEADT = new Uint8Array(N); LEADH = F();
      IV = F(); for (let i = 0; i < N; i++) IV[i] = 0.9 + Math.random() * 0.2;    // личный темп ±10%
      WAKEAT = F(); WAKEAT.fill(-1); AG = F(); PN = F();
      TX = F(); TY = F(); WS = F(); SIDE = new Int8Array(N); SDT = new Uint8Array(N);
      RT = F(); for (let i = 0; i < N; i++) RT[i] = Math.random();               // 0 — самый шустрый, 1 — самый медлительный
      WA = F(); for (let i = 0; i < N; i++) WA[i] = Math.random() * Math.PI * 2;
      inst = new Float32Array(N * 5);
      GL = Uint16Array.from(iG); ST = new Uint8Array(N);
      act = new Int32Array(N); ord = new Int32Array(N); cellOf = new Int32Array(N);
      qx = F(); qy = F(); qvx = F(); qvy = F(); qr = F();
      nsx = F(); nsy = F(); nax = F(); nay = F(); ncx = F(); ncy = F(); ntx = F(); nty = F(); nfg = F(); nfg.fill(1e3); nfv = F(); nfl = F(); nag = new Uint8Array(N); npm = F(); nct = new Uint16Array(N);
      CONT = new Uint8Array(N);
      cAct = new Int32Array(N); cOrd = new Int32Array(N); cCell = new Int32Array(N); cCol = new Int32Array(N); cRow = new Int32Array(N);
      px_ = F(); py_ = F(); pvx_ = F(); pvy_ = F(); pr_ = F(); pm_ = F(); pw_ = F();
      cX = F(); cY = F(); cVX = F(); cVY = F(); cCnt = new Uint16Array(N);
      buildHomeGrid();
      activeCount = 0; kills = 0; B.n = 0; PT.n = 0; pendingWakes = 0;
      collectObstacles();
      if (mode !== 'rest') wakeAll(mode);
      dirty = true;
    }

    function buildAtlas(gCh, gFont, gColor, gW, gH) {
      const n = gCh.length;
      gSX = new Float32Array(n); gSY = new Float32Array(n); gCW = new Float32Array(n); gCH = new Float32Array(n);
      gR = new Float32Array(n); gIM = new Float32Array(n); gAcc = new Float32Array(n); gSpd = new Float32Array(n); gSee = new Float32Array(n);
      const pads = new Float32Array(n), bases = new Float32Array(n);
      const m = doc.createElement('canvas').getContext('2d');
      const AW = 1024;
      for (let g = 0; g < n; g++) {
        m.font = gFont[g];
        const mt = m.measureText(gCh[g]);
        const w = gW[g], h = gH[g];
        const asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent;
        bases[g] = (asc > 0 && desc >= 0) ? h * asc / (asc + desc) : h * 0.8;
        // тело буквы: круг по размеру «чернил» (среднее геометрическое ширины и высоты знака), масса ∝ площади
        const inkW = Math.min(w, (mt.actualBoundingBoxLeft || 0) + (mt.actualBoundingBoxRight || w)) || w;
        const inkH = ((mt.actualBoundingBoxAscent || h * 0.5) + (mt.actualBoundingBoxDescent || 0)) || h * 0.5;
        const rad = Math.min(220, Math.max(1.5, 0.5 * Math.sqrt(Math.max(1, inkW) * Math.max(1, inkH))));
        gR[g] = rad; gIM[g] = 1 / (rad * rad); gAcc[g] = Math.min(1.4, Math.max(0.1, 4.2 / rad));
        // лёгкие знаки быстрее: точка ≈ ×1,9, обычная буква ≈ ×1,1; крупные медленнее — заголовок ≈ ×0,5, великаны ×0,36 и ×0,27
        const q = 4.2 / rad;
        gSpd[g] = Math.min(2, Math.max(0.2, Math.pow(q, q >= 1 ? 0.7 : 0.45)));
        // жирное начертание — тяжелее: масса × (вес/400), разгон и темп ниже
        const wt = Math.max(1, (parseInt(gFont[g].split(' ')[1], 10) || 400) / 400);
        gIM[g] /= wt; gAcc[g] /= Math.sqrt(wt); gSpd[g] /= Math.pow(wt, 0.35);
        // обзор: крупные буквы видят дальше (×0,6 … ×4 от базового радиуса)
        gSee[g] = Math.min(4, Math.max(0.6, Math.sqrt(rad / 3.6)));
        const pad = Math.ceil(Math.max(3, h * 0.25));
        pads[g] = pad;
        gCW[g] = w + pad * 2; gCH[g] = h + pad * 2;
      }
      // укладка полками: сначала высокие глифы — великаны не раздувают высоту атласа
      const order = Array.from({ length: n }, (_, g) => g).sort((a, b) => gCH[b] - gCH[a]);
      let cx = 0, cy = 0, rowH = 0;
      for (const g of order) {
        const cw = gCW[g], chh = gCH[g];
        if (cx + cw > AW) { cx = 0; cy += Math.ceil(rowH) + 1; rowH = 0; }
        gSX[g] = cx; gSY[g] = cy;
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

    function collectObstacles() {
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

    // взлёт волной: от курсора (или центра экрана) буквы срываются по очереди, фронт идёт со скоростью WAVE_SPEED
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
    function wakeNearScroll() {
      const top = global.scrollY - vh, bottom = global.scrollY + vh * 2;
      let woke = 0;
      for (let i = 0; i < N; i++) {
        if (ST[i] !== 0 || WAKEAT[i] >= 0 || HY[i] < top || HY[i] > bottom) continue;
        WAKEAT[i] = stepNo + Math.random() * 30; CALMT[i] = 0; pendingWakes++; woke++;
      }
      return woke;
    }
    function wakePending() {
      if (!pendingWakes) return;
      for (let i = 0; i < N; i++) {
        const w = WAKEAT[i];
        if (w < 0 || w > stepNo) continue;
        WAKEAT[i] = -1; pendingWakes--;
        if (ST[i] !== 0) continue;
        ST[i] = 1; WK[i] = 0; CALMT[i] = 0; AG[i] = 0; PN[i] = 0; SIDE[i] = 0; SDT[i] = 0; WS[i] = 0;
        X[i] = HX[i]; Y[i] = HY[i];
        if (mode === 'flock') {
          const dx = HX[i] - waveOX, dy = HY[i] - waveOY, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          VX[i] = dx / d * 1.5 + (Math.random() - 0.5); VY[i] = dy / d * 1.5 - 1.5 - Math.random() * 1.5;
        } else { VX[i] = 0; VY[i] = 0; }
      }
      if (pendingWakes < 0) pendingWakes = 0;
      dirty = true;
    }

    // ---------- указатель ----------
    const P = { cx: -1e4, cy: -1e4, pcx: -1e4, pcy: -1e4, vx: 0, vy: 0, svx: 0, svy: 0, inside: false };
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
      else if (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М') setVolume(!volume);
      else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') setWeapon(!weapon);
      else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') setFalcon(!WF.on);
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

    // сколько буква кружит после испуга: 0,6…1,5 от CALM — садятся вразнобой, а не все разом
    const calmStart = (i) => CFG.CALM * (0.4 - 0.9 * RT[i]);
    function shockwave(px, py) {
      const R = CFG.SHOCK_R;
      forHomesNear(px, py, R, (i) => { if (ST[i] === 0) { ST[i] = 1; WK[i] = 0; VX[i] = 0; VY[i] = 0; } });
      for (let i = 0; i < N; i++) {
        if (ST[i] !== 1) continue;
        const dx = X[i] - px, dy = Y[i] - py, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
        if (d < R) {
          const f = (1 - d / R) * 9;
          VX[i] += dx / d * f; VY[i] += dy / d * f;
          if (mode === 'rest') CALMT[i] = calmStart(i);
        }
      }
      dirty = true;
    }

    // ---------- симуляция ----------
    function collectActive() {
      let n = 0;
      for (let i = 0; i < N; i++) if (ST[i] === 1) act[n++] = i;
      return n;
    }

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
    // + зазор до ближайшего соседа впереди (конус ±45°) и с какой он стороны:
    // в орде «вперёд» — к тому месту, где этот зомби видит героя, иначе — по своей скорости
    let fwdMode = 0;
    function accumulate(a, list, m, id) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, tx = 0, ty = 0, fg = 1e3, fv = 0, fl = 0, ag = 0, pm = 0;
      const xa = qx[a], ya = qy[a], vxa = qvx[a], vya = qvy[a], ra = qr[a];
      const P2 = CFG.PERSONAL, T0 = CFG.TAU0, TK = CFG.TTC_K, TM = CFG.TTC_MAX;
      let fx0 = 0, fy0 = 0;
      if (fwdMode === 1 && AG[id] > 0) {
        const hx = TX[id] - xa, hy = TY[id] - ya, hl = Math.sqrt(hx * hx + hy * hy);
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
        const ob = ord[b];
        if (AG[ob] > 0) ag++;
        if (PN[ob] > pm) pm = PN[ob];
        const rs = ra + qr[b];
        const ps = rs * P2;
        if (d2 < ps * ps && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (ps - d) / (ps * d);
          sx -= dx * k; sy -= dy * k;
        }
        if (hasFwd) {
          const proj = dx * fx0 + dy * fy0;
          if (proj > 0 && proj * proj > 0.5 * d2) {
            const dd = Math.sqrt(d2), gp = dd - rs;
            if (gp < fg) {     // зазор (px), скорость переднего вдоль «вперёд» и с какого он боку (+ — слева от курса)
              fg = gp; fv = qvx[b] * fx0 + qvy[b] * fy0; fl = (fx0 * dy - fy0 * dx) / (dd + 1e-3);
            }
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
      nfg[id] = fg; nfv[id] = fv; nfl[id] = fl; nct[id] = m; nag[id] = ag; npm[id] = pm;
    }

    function neighbourPass(n) {
      // на большой скорости орда смотрит дальше: иначе передний попадает в обзор, когда тормозить уже поздно
      R_SEE = mode === 'flock' ? CFG.R_FLY : mode === 'horde' ? Math.max(CFG.R_HORDE, Math.min(26, CFG.HORDE_SPEED * 3)) : CFG.R_REST;
      const R2 = R_SEE * R_SEE, K = CFG.K;
      if (algo === 'straight' || algo === 'naive') {
        for (let s = 0; s < n; s++) {
          const i = act[s];
          ord[s] = i; qx[s] = X[i]; qy[s] = Y[i]; qvx[s] = VX[i]; qvy[s] = VY[i]; qr[s] = gR[GL[i]] * SC[i];
        }
        if (algo === 'straight') {
          nsx.fill(0); nsy.fill(0); ntx.fill(0); nty.fill(0); nct.fill(0); nfg.fill(1e3); nfl.fill(0); nag.fill(0); npm.fill(0);
          nbAvg = 0;
          return;
        }
        let tot = 0, upd = 0;
        for (let a = 0; a < n; a++) {
          const id = ord[a];
          if (skipPerception(id)) continue;
          const xa = qx[a], ya = qy[a];
          let kc = 0;
          for (let b = 0; b < n; b++) {
            if (b === a) continue;
            const dx = qx[b] - xa, dy = qy[b] - ya, d2 = dx * dx + dy * dy;
            if (d2 < R2) kc = kInsert(kc, K, b, d2);
          }
          accumulate(a, kIdx, kc, id); tot += kc; upd++;
        }
        nbAvg = upd ? tot / upd : nbAvg;
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
      let tot = 0, upd = 0;
      for (let a = 0; a < n; a++) {
        const id = ord[a];
        if (skipPerception(id)) continue;
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
        if (topK) { accumulate(a, kIdx, kc, id); tot += kc; } else { accumulate(a, allIdx, m, id); tot += m; }
        upd++;
      }
      nbAvg = upd ? tot / upd : nbAvg;
    }

    // восприятие по очереди: чётные буквы на чётных шагах, нечётные — на нечётных; только что взлетевшие — всегда
    let stepNo = 0;
    function skipPerception(id) {
      return CFG.STEER_EVERY > 1 && WK[id] > 3 && PN[id] < 0.05 && ((id + stepNo) % CFG.STEER_EVERY) !== 0;
    }

    let simTime = 0;
    function step() {
      stepNo++;
      wakePending();
      const n = collectActive();
      activeCount = n;
      if (!n) { nbAvg = 0; contactsAvg = 0; overlapAvg = 0; WF.present = false; particlesStep(); return; }
      if (algo === 'naive' && n > CFG.NAIVE_LIMIT) {
        toast(`Все пары для ${fmtInt(n)} букв — это ${fmtBig(n * n)} проверок за кадр, вкладка зависнет. Переключил на сетку + 7 соседей.`);
        setAlgo('gridK', true);
      }
      const t0 = performance.now();
      fwdMode = mode === 'horde' ? 1 : 0;
      neighbourPass(n);
      behave(n);
      falconStep();
      turnStep();
      const t1 = performance.now();
      if (volume) collide(n); else { contactsAvg = 0; overlapAvg = 0; }
      obstaclesStep(n);
      const t2 = performance.now();
      weaponStep();
      steerE += (t1 - t0 - steerE) * 0.1;
      collE += (t2 - t1 - collE) * 0.1;
    }
    const heroPX = () => P.inside ? P.cx + global.scrollX : global.scrollX + vw / 2;
    const heroPY = () => P.inside ? P.cy + global.scrollY : global.scrollY + vh / 2;

    // угроза от хищника в точке (px, py), летящего со скоростью (pvx, pvy): птица учитывает и текущую дистанцию,
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

    // облёт препятствий (Рейнольдс, 1999): луч по курсу на OB_LOOK шагов против прямоугольника, раздутого на отступ,
    // и мягкое поле в полосе отступа. Пишет силу в oax/oay, возвращает срочность 0…1
    let oax = 0, oay = 0;
    const SEC = new Float32Array(16), SEC_K = 16 / (2 * Math.PI);
    function avoidObstacles(x, y, vx, vy, r) {
      oax = 0; oay = 0;
      const M = CFG.OB_MARGIN, L = CFG.OB_LOOK;
      if (M <= 0) return 0;
      const sp = Math.sqrt(vx * vx + vy * vy) + 1e-6, fx = vx / sp, fy = vy / sp, reach = M + sp * L;
      let urg = 0;
      for (let o = 0; o < OBN; o++) {
        const x0 = OB[o * 4] - r, y0 = OB[o * 4 + 1] - r, x1 = OB[o * 4 + 2] + r, y1 = OB[o * 4 + 3] + r;
        if (x < x0 - reach || x > x1 + reach || y < y0 - reach || y > y1 + reach) continue;
        // поле отступа: чем ближе к краю, тем сильнее отжимает (квадратично)
        const cx = x < x0 ? x0 : x > x1 ? x1 : x, cy = y < y0 ? y0 : y > y1 ? y1 : y;
        const ex = x - cx, ey = y - cy, ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < M && ed > 1e-3) {
          const f = 1 - ed / M, k = f * f * 1.2;
          oax += ex / ed * k; oay += ey / ed * k;
          if (f > urg) urg = f;
        }
        // луч по курсу: попадёт ли птица в прямоугольник, раздутый на половину отступа, и через сколько шагов
        const m2 = M * 0.5, X0 = x0 - m2, Y0 = y0 - m2, X1 = x1 + m2, Y1 = y1 + m2;
        if (x > X0 && x < X1 && y > Y0 && y < Y1) continue;
        let t0 = 0, t1 = L;
        if (Math.abs(vx) < 1e-6) { if (x < X0 || x > X1) continue; }
        else { let a = (X0 - x) / vx, b = (X1 - x) / vx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
        if (t0 > t1) continue;
        if (Math.abs(vy) < 1e-6) { if (y < Y0 || y > Y1) continue; }
        else { let a = (Y0 - y) / vy, b = (Y1 - y) / vy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
        if (t0 > t1) continue;
        // отвернуть в ту сторону, где у препятствия меньше «тела» относительно курса
        const ocx = (x0 + x1) * 0.5 - x, ocy = (y0 + y1) * 0.5 - y;
        const s = fx * ocy - fy * ocx > 0 ? -1 : 1;
        const u = 1 - t0 / L, k = u * 1.1;
        oax += -fy * s * k; oay += fx * s * k;
        if (u > urg) urg = u;
      }
      return urg;
    }

    function behave(n) {
      simTime += CFG.STEP_MS / 1000;
      const sxp = global.scrollX, syp = global.scrollY;
      const pX = P.cx + sxp, pY = P.cy + syp;
      // небо над гнездовьем: эллипс в верхней части экрана; вылетевшая за край птица разворачивается (как в StarDisplay)
      const skyX = sxp + vw * 0.5 + vw * 0.06 * Math.sin(simTime * 0.13);
      const skyY = syp + vh * 0.42 + vh * 0.04 * Math.sin(simTime * 0.17);
      const skyRX = Math.max(160, vw * 0.38), skyRY = Math.max(120, vh * 0.33);
      const heroX = heroPX(), heroY = heroPY();
      const FR = CFG.FALCON_R;
      // быстрый курсор пугает раньше: дистанция вспугивания растёт со скоростью хищника
      const pSpeed = Math.sqrt(P.svx * P.svx + P.svy * P.svy);
      const FRc = FR * (1 + Math.min(2, pSpeed / 10));
      const wf = WF.present, wfR = WF.fearR, wfK = WF.fearK, wfx = WF.x, wfy = WF.y;
      let sumX = 0, sumY = 0, sumVX = 0, sumVY = 0;
      // орда: сколько преследователей в каждом из 16 секторов вокруг героя — по этой карте зомби ищут, где свободнее
      if (mode === 'horde') {
        SEC.fill(0);
        const sr = Math.min(900, Math.max(150, Math.sqrt(reactCount * 110 / Math.PI) * 1.15)), sr2 = sr * sr;
        for (let s = 0; s < n; s++) {
          if (AG[ord[s]] <= 0) continue;
          const dx = qx[s] - heroX, dy = qy[s] - heroY;
          if (dx * dx + dy * dy > sr2) continue;
          SEC[((Math.atan2(dy, dx) + Math.PI) * SEC_K | 0) & 15]++;
        }
      }
      reactCount = 0;

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
          thx = 0; thy = 0;
          if (P.inside) fear = threat(x, y, pX, pY, P.svx, P.svy, FRc, 1.6, fear);
          if (wf) fear = threat(x, y, wfx, wfy, WF.vx, WF.vy, wfR, wfK, fear);
          ax += thx; ay += thy;
          // картинки: птица заранее высматривает их по курсу и отворачивает, а у самого края её отжимает поле отступа
          let avU = 0;
          if (OBN) avU = avoidObstacles(x, y, vx, vy, gR[g] * SC[i]);
          ax += oax; ay += oay;
          // паника: свой испуг или от соседей — так тревога бежит по стае волной быстрее самого сокола
          let pn = PN[i] * CFG.PANIC_DECAY;
          if (fear > pn) pn = fear;
          const np = npm[i] * 0.85;
          if (np > pn && np > 0.15) pn = np;
          PN[i] = pn;
          if (pn > 0.2) reactCount++;
          if (cnt && pn > 0.05) { ax += (nax[i] * inv - vx) * 0.25 * pn; ay += (nay[i] * inv - vy) * 0.25 * pn; }
          if (LEADT[i] > 0) {      // зачинщики разворота: несколько птиц круто меняют курс, остальные подхватывают
            LEADT[i]--;
            ax += (Math.cos(LEADH[i]) * 4 - vx) * 0.15; ay += (Math.sin(LEADH[i]) * 4 - vy) * 0.15;
          }
          ax += (Math.random() - 0.5) * 0.05; ay += (Math.random() - 0.5) * 0.05;
          // полёт: скорость почти постоянна, курс меняется по дуге (крен) — птица не может зависнуть или развернуться на месте
          const cruise = CFG.FLY_CRUISE * (1 + (IV[i] - 1) * 0.5) * (qe > 2.2 ? 2.2 : 1);
          const nvx = vx + ax * am, nvy = vy + ay * am;
          // поворот не круче mt за шаг — через скалярное/векторное произведение, без углов
          const s0 = Math.sqrt(vx * vx + vy * vy) + 1e-6, ux = vx / s0, uy = vy / s0;
          let sp = Math.sqrt(nvx * nvx + nvy * nvy) + 1e-6;
          const wx = nvx / sp, wy = nvy / sp;
          let cmt = COS_TURN, smt = SIN_TURN;
          const tu = pn > avU * 0.7 ? pn : avU * 0.7;       // перед стеной можно и круче, как в панике
          if (tu > 0.01 || LEADT[i]) { const mt = CFG.MAX_TURN * (1 + tu * 4) + (LEADT[i] ? 0.03 : 0); cmt = Math.cos(mt); smt = Math.sin(mt); }
          let hx, hy;
          if (ux * wx + uy * wy >= cmt) { hx = wx; hy = wy; }
          else { const sg = ux * wy - uy * wx >= 0 ? smt : -smt; hx = ux * cmt - uy * sg; hy = uy * cmt + ux * sg; }
          // в панике — рывок: скорость быстро поднимается, а не тянется к крейсерской
          sp += (cruise * (1 + 0.7 * pn) - sp) * (0.06 + 0.25 * pn);
          const sMax = cruise * (1.3 + 1.2 * pn), sMin = cruise * 0.7;
          if (sp > sMax) sp = sMax; else if (sp < sMin) sp = sMin;
          vx = hx * sp; vy = hy * sp;
          flown = true;
          sumX += x; sumY += y; sumVX += vx; sumVY += vy;
        } else if (mode === 'horde') {
          if (cnt) {
            // бродячие стоят толпой и почти не расталкиваются; в погоне — держат дистанцию
            const hk = AG[i] > 0 ? 1 : 0.25;
            ax += (nsx[i] * 0.7 + ntx[i] * 0.8) * hk + (nax[i] * inv - vx) * 0.02;
            ay += (nsy[i] * 0.7 + nty[i] * 0.8) * hk + (nay[i] * inv - vy) * 0.02;
          }
          // свой ровный темп у каждой буквы: лёгкие быстрее тяжёлых, без разгона издалека
          const spd = CFG.HORDE_SPEED * gSpd[g] * IV[i];
          // личное время реакции: 0,5…1,5 × среднего, в шагах; великаны ещё и тугодумы
          const rs_ = CFG.HORDE_REACT * 60 * (0.5 + RT[i]) * (gAcc[g] < 0.5 ? 1.5 : 1);
          const kt = 1 / (1 + rs_);
          // обзор: увидел героя — помнит его ~3 с; не видит — может увлечься, если рядом бегут другие
          const hdx = heroX - x, hdy = heroY - y;
          const sight = CFG.ZOMBIE_SIGHT >= 1990 ? 1e9 : CFG.ZOMBIE_SIGHT * gSee[g];
          const seen = hdx * hdx + hdy * hdy < sight * sight;
          if (seen) {
            // где зомби «видит» героя: эта точка догоняет настоящую с его личной задержкой,
            // поэтому толпа поворачивает не разом, а волной от быстрых к медленным
            if (AG[i] <= 0) { TX[i] = x + hdx * kt; TY[i] = y + hdy * kt; WS[i] = 0; }
            else { TX[i] += (heroX - TX[i]) * kt; TY[i] += (heroY - TY[i]) * kt; }
            AG[i] = 180;
          } else if (AG[i] > 0) AG[i]--;
          if (AG[i] <= 0 && nag[i] >= 2 && Math.random() < 0.03) {
            // увлёкся толпой: идёт примерно туда, где герой, со слов соседей
            AG[i] = 120; WS[i] = 0;
            TX[i] = heroX + (Math.random() - 0.5) * 160; TY[i] = heroY + (Math.random() - 0.5) * 160;
          }
          const dx = TX[i] - x, dy = TY[i] - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
          if (!seen && AG[i] > 30 && d < 25) AG[i] = 30;     // пришёл туда, где видел героя, а его нет — остывает
          if (AG[i] <= 0) {
            // бродит: медленно, курс плывёт
            WA[i] += (Math.random() - 0.5) * 0.25;
            const ws = spd * 0.12;
            ax += (Math.cos(WA[i]) * ws - vx) * 0.05; ay += (Math.sin(WA[i]) * ws - vy) * 0.05;
            // топчется у своего места: дальше 30 px его слабо тянет обратно
            const hx = HX[i] - x, hy = HY[i] - y, hd = Math.sqrt(hx * hx + hy * hy);
            if (hd > 30) { const k = Math.min(0.03, (hd - 30) * 0.0006); ax += hx / hd * k; ay += hy / hd * k; }
            maxS = spd * 0.4;
            sumX += x; sumY += y;
          } else {
          reactCount++;
          // следование за передним: не быстрее него плюс запас по зазору, у каждого свой интервал (как в моделях потока машин)
          let want = spd;
          if (volume) {
            const gp = nfg[i];
            if (gp < 1e3) {
              const lv = nfv[i] > 0 ? nfv[i] : 0, lim = lv + (gp > 0 ? gp : 0) / (2.5 + 4 * RT[i]);
              if (lim < want) want = lim;
            }
          }
          // решение «идти или стоять» тоже приходит с задержкой: задние не повторяют рывок передних в тот же миг
          const kw = kt * 2 > 1 ? 1 : kt * 2;
          WS[i] += (want - WS[i]) * kw;
          const wv = WS[i];
          const ux = dx / d, uy = dy / d;
          const kv = 0.08 * (1.25 - 0.5 * RT[i]);          // инерция: медлительные и разгоняются плавнее
          ax += (ux * wv - vx) * kv; ay += (uy * wv - vy) * kv;
          // упёрся, а сбоку свободно — обходит. Сторону выбирает сам, по тому, что видит со своего места: где вокруг героя
          // реже, от какого бока стоит передний, куда давит толпа, — и держит её 0,7–1,7 с.
          // Никакой общей оси на всех — значит, никакой общей линии и общей качки.
          const held = spd - wv;
          if (SDT[i] > 0) SDT[i]--;
          if (held > 0.3 * spd && d > 30 && CONT[i] < 4) {
            if (SDT[i] === 0 || SIDE[i] === 0) {
              // куда идти в обход: туда, где вокруг героя толпа реже (видно по секторам рядом со своим местом),
              // а если разницы нет — от того бока, где стоит передний
              const ph = Math.atan2(y - heroY, x - heroX);
              const si = ((ph + Math.PI) * SEC_K | 0) & 15;
              const cDec = SEC[(si + 15) & 15] * 0.5 + SEC[(si + 14) & 15], cInc = SEC[(si + 1) & 15] * 0.5 + SEC[(si + 2) & 15];
              let sd = 0;
              if (Math.abs(cDec - cInc) > 0.15 * (cDec + cInc) + 3) sd = cDec < cInc ? 1 : -1;   // +1 — по ходу, где угол убывает
              const fl = nfl[i];
              if (!sd) sd = fl > 0.2 ? -1 : fl < -0.2 ? 1 : 0;
              if (!sd) {
                const lat = -uy * nsx[i] + ux * nsy[i];
                sd = lat > 0.01 ? 1 : lat < -0.01 ? -1 : (SIDE[i] || (Math.random() < 0.5 ? -1 : 1));
              }
              SIDE[i] = sd; SDT[i] = 40 + ((Math.random() * 60) | 0);
            }
            const k = 0.07 * held;
            ax += -uy * SIDE[i] * k; ay += ux * SIDE[i] * k;
          }
          sumX += x; sumY += y;
          if (!volume && d < 16) { ax -= dx / d * (16 - d) * 0.3; ay -= dy / d * (16 - d) * 0.3; }
          maxS = spd * 1.2;
          }
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
            if (hd < 1.5) { vx = hx; vy = hy; }              // последние полтора пикселя — сесть точно на место
            else {
              // домой — как птица: курс поворачивается не круче заданного, скорость падает к месту посадки,
              // и чем медленнее, тем круче поворот. Издалека заходит дугой сбоку и чуть сверху, вблизи — прямо на место
              const far = hd > 160 ? 1 : hd / 160;
              const gx = hx, gy = hy - Math.min(30, hd * 0.25);
              const gl = Math.sqrt(gx * gx + gy * gy) + 1e-6;
              const off = (RT[i] > 0.5 ? 0.7 : -0.7) * far, co = Math.cos(off), so = Math.sin(off);
              const tx = (gx * co - gy * so) / gl, ty = (gx * so + gy * co) / gl;
              const sp0 = Math.sqrt(vx * vx + vy * vy);
              let ux = tx, uy = ty;
              if (sp0 > 0.05) {
                ux = vx / sp0; uy = vy / sp0;
                const turn = 0.08 + 0.45 / (1 + hd / 25), ct = Math.cos(turn);
                if (ux * tx + uy * ty >= ct) { ux = tx; uy = ty; }
                else { const st = ux * ty - uy * tx >= 0 ? Math.sin(turn) : -Math.sin(turn); const nx = ux * ct - uy * st; uy = uy * ct + ux * st; ux = nx; }
              }
              const want = Math.min(5.5 * (0.85 + 0.3 * RT[i]), 0.3 + hd * 0.07);
              const sp = sp0 + (want - sp0) * 0.12;
              vx = ux * sp; vy = uy * sp;
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
          if ((hx * hx + hy * hy < 0.36 && vx * vx + vy * vy < 2.3) || CALMT[i] > CFG.CALM + 600) {
            ST[i] = 0; nx = HX[i]; ny = HY[i]; vx = 0; vy = 0; ang = 0;
          }
        }
        const scT = !ST[i] ? 1 : mode === 'flock' ? CFG.FLY_SCALE : mode === 'horde' ? CFG.HORDE_SCALE : 1;
        SC[i] += (scT - SC[i]) * 0.06;
        if (ST[i] === 0) SC[i] = 1;
        X[i] = nx; Y[i] = ny; VX[i] = vx; VY[i] = vy; ANG[i] = ang;
      }
      if (mode === 'horde' && n) { hordeCX = sumX / n; hordeCY = sumY / n; }
      if (mode === 'flock' && n) {
        flock.cx = sumX / n; flock.cy = sumY / n; flock.vx = sumVX / n; flock.vy = sumVY / n;
        flock.skyX = skyX; flock.skyY = skyY;
      }
    }

    // ---------- сокол-охотник ----------
    // Патрулирует в стороне, раз в 5–11 с атакует: то отбившуюся птицу, то центр стаи; пикирование быстрее бокового захода.
    // У настоящих скворцов тип ответа (вспышка-разлёт, волна, «дыра», раскол) зависит от скорости атаки (Storms et al., 2019).
    const flock = { cx: 0, cy: 0, vx: 1, vy: 0, skyX: 0, skyY: 0 };
    let hordeCX = 0, hordeCY = 0, reactCount = 0;
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
    let kills = 0, fireAcc = 0, TGT = new Int32Array(0);   // TGT: до какого шага буква уже взята на прицел
    const B = { n: 0, x: new Float32Array(4096), y: new Float32Array(4096), vx: new Float32Array(4096), vy: new Float32Array(4096), life: new Int16Array(4096) };
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
              const i = idx[q];
              if (TGT[i] > stepNo) continue;            // в неё уже летит пуля — ищем следующую
              const dx = X[i] - px, dy = Y[i] - py, d2 = dx * dx + dy * dy;
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
      if (armed) {
        if (TGT.length !== N) TGT = new Int32Array(N);
        fireAcc += CFG.FIRE_RATE / 60;
        const range = Math.max(CFG.FIRE_RANGE, BS * CFG.BULLET_LIFE * 0.8);
        while (fireAcc >= 1 && B.n < B.x.length) {
          const t = nearestActive(sx, sy, range);
          if (t < 0) { fireAcc = 0; break; }
          fireAcc -= 1;
          // упреждение: целимся туда, где буква окажется к моменту встречи
          const dx0 = X[t] - sx, dy0 = Y[t] - sy, tt = Math.sqrt(dx0 * dx0 + dy0 * dy0) / BS;
          TGT[t] = stepNo + Math.ceil(tt) + 4;
          const ax = dx0 + VX[t] * tt, ay = dy0 + VY[t] * tt, al = Math.sqrt(ax * ax + ay * ay) + 1e-3;
          const j = B.n++;
          B.x[j] = sx; B.y[j] = sy; B.vx[j] = ax / al * BS; B.vy[j] = ay / al * BS; B.life[j] = CFG.BULLET_LIFE;
        }
        if (fireAcc > 4) fireAcc = 4;
      } else fireAcc = 0;
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
        pw_[k] = WK[i] < 20 ? WK[i] / 20 : 1;             // только что взлетевшие расходятся плавно
        cCol[k] = Math.floor((X[i] - minX) / cs); cRow[k] = Math.floor((Y[i] - minY) / cs);
      }
      let contacts = 0, ovSum = 0;
      const RELAX = CFG.RELAX, BOUNCE = CFG.BOUNCE;
      cCnt.fill(0, 0, n);
      // одна пара — один раз, поправка сразу на месте (Гаусс–Зейдель): мелкие смотрят «вперёд»
      // (своя ячейка дальше себя, правая и строка ниже), крупные — всё окно вокруг себя
      const iters = mode === 'flock' ? 1 : CFG.COLL_ITERS;
      for (let it = 0; it < iters; it++) {
        const count = it === 0;
        for (let a = 0; a < n; a++) {
          const ra = pr_[a], bigA = ra > half;
          const ci = cCol[a], ri = cRow[a];
          let xa = px_[a], ya = py_[a], vxa = pvx_[a], vya = pvy_[a];
          const ima = pm_[a], wA = pw_[a];
          for (let seg = 0; seg < (bigA ? 1 : 2); seg++) {
            let rFrom, rTo, c0, c1;
            if (bigA) {
              const span = Math.ceil((ra + half) / cs);
              rFrom = ri - span > 0 ? ri - span : 0; rTo = ri + span < rows ? ri + span : rows - 1;
              c0 = ci - span > 0 ? ci - span : 0; c1 = ci + span < cols ? ci + span : cols - 1;
            } else if (seg === 0) {
              rFrom = rTo = ri; c0 = ci; c1 = ci + 1 < cols ? ci + 1 : cols - 1;
            } else {
              if (ri + 1 >= rows) break;
              rFrom = rTo = ri + 1; c0 = ci > 0 ? ci - 1 : 0; c1 = ci + 1 < cols ? ci + 1 : cols - 1;
            }
            for (let r = rFrom; r <= rTo; r++) {
              const base = r * cols;
              let b = start[base + c0];
              const e = start[base + c1 + 1];
              if (!bigA && seg === 0 && b <= a) b = a + 1;
              for (; b < e; b++) {
                if (b === a) continue;
                const rb = pr_[b], bigB = rb > half;
                if (bigB && (!bigA || b < a)) continue;   // крупную разберёт она сама; пару крупных — один раз
                let dx = xa - px_[b], dy = ya - py_[b];
                const rs = ra + rb, d2 = dx * dx + dy * dy;
                if (d2 >= rs * rs) continue;
                let d = Math.sqrt(d2), nx, ny;
                if (d < 1e-3) { const g = (a * 2.399963 + b) % 6.2832; nx = Math.cos(g); ny = Math.sin(g); d = 0; }
                else { nx = dx / d; ny = dy / d; }
                const ov = rs - d;
                const imb = pm_[b], wa = ima / (ima + imb), wb = 1 - wa;
                const st = wA < pw_[b] ? wA : pw_[b];
                const corr = ov * RELAX * st;
                xa += nx * corr * wa; ya += ny * corr * wa;
                px_[b] -= nx * corr * wb; py_[b] -= ny * corr * wb;
                const vn = (vxa - pvx_[b]) * nx + (vya - pvy_[b]) * ny;
                if (vn < 0) {
                  const imp = -(1 + BOUNCE) * vn * st;
                  vxa += nx * imp * wa; vya += ny * imp * wa;
                  pvx_[b] -= nx * imp * wb; pvy_[b] -= ny * imp * wb;
                }
                if (count) { cCnt[a]++; cCnt[b]++; contacts += 2; ovSum += ov * 2; }
              }
            }
          }
          px_[a] = xa; py_[a] = ya; pvx_[a] = vxa; pvy_[a] = vya;
        }
      }
      for (let a = 0; a < n; a++) { const c = cCnt[a]; CONT[cOrd[a]] = c > 255 ? 255 : c; }
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

    // спугнуть буквы под быстро движущимся курсором (режим «Покой»)
    const reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function startle() {
      if (reduceMotion || mode !== 'rest' || !P.inside) return; // при «уменьшить движение» — только по явным действиям
      const sp = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
      if (sp < 4) return;
      const px = P.cx + global.scrollX, py = P.cy + global.scrollY;
      forHomesNear(px, py, CFG.STARTLE_R, (i, dx, dy) => {
        if (ST[i] === 2) return;
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
        if (ST[i] === 0) {
          ST[i] = 1; WK[i] = 0;
          const k = 2 + Math.random() * 1.5;
          VX[i] = dx / d * k + P.vx * 0.25;
          VY[i] = dy / d * k + P.vy * 0.25 - 1.4;
        }
        CALMT[i] = calmStart(i);
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
            const st = ST[i];
            if (pass === 0 ? st !== 0 : st !== 1) continue;
            const x = (pass ? X[i] : HX[i]) - sx, y = (pass ? Y[i] : HY[i]) - sy;
            if (y < -m || y > vh + m || x < -m || x > vw + m) continue;
            inst[k] = x; inst[k + 1] = y; inst[k + 2] = pass ? ANG[i] : 0; inst[k + 3] = GL[i]; inst[k + 4] = pass ? SC[i] : 1;
            k += 5;
          }
        }
        if (glr && !glr.lost) glr.draw(inst, k / 5, vw, vh, dpr);
        else if (ctx) draw2D(k / 5);
      }
      // сокол / сокол-охотник / герой / пули / осколки
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mode === 'flock') {
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

    // скорость курсора в px за шаг симуляции (кадр может быть длиннее шага)
    function pointerVel(dt) {
      P.vx = P.pcx > -1e3 ? P.cx - P.pcx : 0; P.vy = P.pcy > -1e3 ? P.cy - P.pcy : 0;
      P.pcx = P.cx; P.pcy = P.cy;
      const kf = CFG.STEP_MS / Math.max(CFG.STEP_MS, dt);
      P.svx += (P.vx * kf - P.svx) * 0.5; P.svy += (P.vy * kf - P.svy) * 0.5;
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

      pointerVel(dt);
      startle();

      acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (acc >= CFG.STEP_MS && steps < 2) { step(); acc -= CFG.STEP_MS; steps++; }
      if (steps === 2 && acc > CFG.STEP_MS) acc = 0;
      const t1 = performance.now();
      if (steps) simE += ((t1 - t0) / steps - simE) * 0.1;

      const sx = global.scrollX, sy = global.scrollY;
      if (mode !== 'rest' && opts.wakeScope === 'near' && sy !== lastSY) wakeNearScroll();
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
      const prev = mode;
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
        WAKEAT.fill(-1); pendingWakes = 0;
      } else {
        wakeAll(m);
      }
      dirty = true;
      if (!silent) updateHud(true);
    }
    function setWeapon(on) { weapon = on; if (!on) B.n = 0; updateHud(true); }
    function setFalcon(on) { WF.on = on; if (!on) WF.present = false; updateHud(true); }
    function setVolume(on) {
      volume = on;
      if (!on && CONT) CONT.fill(0);
      updateHud(true);
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
      else if (g === 'vol') setVolume(v === '1');
      else if (g === 'gun') setWeapon(v === '1');
      else if (g === 'wf') setFalcon(v === '1');
      else if (g === 'revive') revive();
      else if (g === 'tune-reset') { Object.assign(CFG, TUNE_DEFAULTS); syncTunes(); }
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

    function syncTunes() {
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
            (b.dataset.g === 'vol' && (b.dataset.v === '1') === volume) ||
            (b.dataset.g === 'gun' && (b.dataset.v === '1') === weapon) ||
            (b.dataset.g === 'wf' && (b.dataset.v === '1') === WF.on) ||
            (b.dataset.g === 'mult' && +b.dataset.v === opts.multiplier);
          b.classList.toggle('on', on);
          if (b.dataset.g !== 'min' && b.dataset.g !== 'revive') b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('.hint').textContent = HINTS[mode];
      }
      $('#fps').textContent = Math.round(fpsE);
      $('#rlbl').textContent = mode === 'horde' ? 'в погоне' : mode === 'flock' ? 'в панике' : 'реагируют';
      $('#rc').textContent = mode === 'rest' || !activeCount ? '—' : fmtInt(reactCount);
      $('#pw').textContent = fmtInt(pendingWakes);
      $('#obn').textContent = fmtInt(OBN);
      $('#kills').textContent = fmtInt(kills);
      $('#revive').disabled = kills === 0;
      $('#st').textContent = fmtMs(steerE);
      $('#co').textContent = volume ? fmtMs(collE) : '—';
      $('#drw').textContent = fmtMs(drawE);
      $('#tot').textContent = fmtInt(N);
      $('#act').textContent = fmtInt(activeCount);
      $('#rnd').textContent = glr && !glr.lost ? 'WebGL2' : 'Canvas2D';
      $('#nb').textContent = activeCount && algo !== 'straight' ? nbAvg.toFixed(1).replace('.', ',') : '—';
      $('#ct').textContent = volume && activeCount ? contactsAvg.toFixed(1).replace('.', ',') : '—';
      $('#ov').textContent = volume && activeCount ? overlapAvg.toFixed(2).replace('.', ',') + ' px' : '—';
      const budget = CFG.STEP_MS;
      const ws = Math.min(100, steerE / budget * 100);
      const wc = Math.min(100 - ws, (volume ? collE : 0) / budget * 100);
      const wd = Math.min(100 - ws - wc, drawE / budget * 100);
      $('#bsim').style.width = ws + '%';
      $('#bcol').style.width = wc + '%';
      $('#bdrw').style.width = wd + '%';
      $('.bar').classList.toggle('over', steerE + (volume ? collE : 0) + drawE > budget);
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
      canvas.remove(); overlay.remove(); hudHost.remove(); hideStyle.remove(); releaseKeep();
      if (global.LetterSwarm && global.LetterSwarm.__instance === api) global.LetterSwarm.__instance = null;
    }

    // ---------- запуск ----------
    try { global.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    sizeCanvas();
    build();
    updateHud(true);
    syncTunes();
    raf = global.requestAnimationFrame(frame);

    const api = {
      setMode, setAlgo, destroy,
      rebuild() { build(); updateHud(true); },
      // прогнать симуляцию на n шагов синхронно (для тестов и замеров)
      advance(n) { const t0 = performance.now(); for (let k = 0; k < n; k++) { pointerVel(CFG.STEP_MS); startle(); step(); } const ms = (performance.now() - t0) / n; draw(); updateHud(); return ms; },
      pointer(cx, cy) { P.cx = cx; P.cy = cy; P.inside = true; },
      // снимок состояния букв — для тестов
      snapshot() { return { x: Array.from(X), y: Array.from(Y), vx: Array.from(VX), vy: Array.from(VY), st: Array.from(ST), ch: Array.from(GL, (g) => glyphChars[g]) }; },
      falcon() { return { x: WF.x, y: WF.y, state: WF.state, present: WF.present }; },
      stats() {
        return { atlas: atlas ? [atlas.width, atlas.height] : null, maxR: gR ? Math.max(...gR) : 0, reacting: reactCount, pending: pendingWakes, obstacles: OBN, kills, falcon: WF.present ? (WF.state ? 'attack' : 'patrol') : 'off', weapon, fps: fpsE, simMs: simE, steerMs: steerE, collMs: collE, drawMs: drawE, letters: N, active: activeCount, neighbours: nbAvg, contacts: contactsAvg, overlap: overlapAvg, volume, mode, algo, renderer: glr && !glr.lost ? 'webgl2' : 'canvas2d' };
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
        max-height: calc(100vh - 32px); overflow-y: auto;
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
      button:disabled { opacity: 0.45; cursor: default; }
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
      #bcol { background: #8cc7a1; }
      #bdrw { background: #8fb3d9; }
      .bar.over { box-shadow: 0 0 0 1px #e0645a; }
      .legend { display: flex; gap: 12px; color: var(--mut); font-size: 11px; }
      .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
      .hint { color: var(--mut); font-size: 12px; }
      .tune { border-top: 1px solid var(--line); padding-top: 8px; }
      .tune summary { cursor: pointer; color: var(--mut); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .tune summary:focus-visible { outline: 2px solid var(--acc2); outline-offset: 2px; }
      .tunes { display: grid; gap: 8px; margin: 8px 0; }
      .sl { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; font-size: 12px; }
      .sl b { font: 500 12px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .sl input { grid-column: 1 / -1; width: 100%; accent-color: var(--acc2); }
      .note { margin: 0 0 8px; color: var(--mut); font-size: 11px; }
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
        <div class="row"><span class="lbl">Тела букв</span><div class="seg">
          <button type="button" data-g="vol" data-v="1" aria-pressed="false"><kbd>V</kbd>С объёмом и массой</button>
          <button type="button" data-g="vol" data-v="0" aria-pressed="false">Призраки</button></div></div>
        <div class="row"><span class="lbl">Хищник в мурмурации</span><div class="seg">
          <button type="button" data-g="wf" data-v="1" aria-pressed="false"><kbd>H</kbd>Сокол-охотник</button>
          <button type="button" data-g="wf" data-v="0" aria-pressed="false">Нет</button></div></div>
        <div class="row"><span class="lbl">Оружие героя</span><div class="seg">
          <button type="button" data-g="gun" data-v="1" aria-pressed="false"><kbd>F</kbd>Точкомёт</button>
          <button type="button" data-g="gun" data-v="0" aria-pressed="false">Выкл</button>
          <button type="button" data-g="revive" id="revive" disabled>Вернуть сбитые · <span id="kills">0</span></button></div></div>
        ${mult}
        <details class="tune"><summary>Настройки динамики</summary>
          <div class="tunes">${TUNABLES.map(([k, label, min, max, st]) => `
            <label class="sl" for="t-${k}"><span>${label}</span><b id="v-${k}"></b>
              <input type="range" id="t-${k}" data-k="${k}" min="${min}" max="${max}" step="${st}"></label>`).join('')}
          </div>
          <p class="note">Обзор: крупные буквы видят дальше базового радиуса, мелкие — ближе. Скорость орды умножается на лёгкость знака.</p>
          <button type="button" data-g="tune-reset">Сбросить настройки</button>
        </details>
        <div class="stats">
          <div><span>кадров/с</span><b id="fps">—</b></div>
          <div><span>правила</span><b id="st">—</b></div>
          <div><span>тела</span><b id="co">—</b></div>
          <div><span>букв всего</span><b id="tot">—</b></div>
          <div><span>в полёте</span><b id="act">—</b></div>
          <div><span>отрисовка</span><b id="drw">—</b></div>
          <div><span>соседей ⌀</span><b id="nb">—</b></div>
          <div><span>касаний ⌀</span><b id="ct">—</b></div>
          <div><span>вдавливание ⌀</span><b id="ov">—</b></div>
          <div><span id="rlbl">реагируют</span><b id="rc">—</b></div>
          <div><span>ждут взлёта</span><b id="pw">—</b></div>
          <div><span>препятствий</span><b id="obn">—</b></div>
        </div>
        <div class="budget">
          <span>Бюджет кадра 16,7 мс при 60 кадрах/с · <em id="rnd"></em></span>
          <div class="bar"><i id="bsim"></i><i id="bcol"></i><i id="bdrw"></i></div>
          <div class="legend"><span><i style="background:var(--acc2)"></i>правила</span><span><i style="background:#8cc7a1"></i>тела</span><span><i style="background:#8fb3d9"></i>отрисовка</span></div>
        </div>
        <div class="hint"></div>
        <div class="toast" role="status" hidden></div>
      </div>
    </div>`;
  }

  global.LetterSwarm = { start, __instance: null };
})(window);
