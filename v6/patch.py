from pathlib import Path
p = Path(__file__).parent / 'engine.js'; s = p.read_text(encoding='utf-8')
def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (s.count(a), a[:80])
    s = s.replace(a, b)

rep(" * LetterSwarm v5 — каждая буква страницы становится птицей с телом.", " * LetterSwarm v6 — каждая буква страницы становится птицей с телом.")
rep("      title: 'Мурмурация букв · v5',", "      title: 'Мурмурация букв · v6',")

# --- оружие: скорострельность и скорость пуль ---
rep("""    FIRE_EVERY: 6,     // точкомёт: выстрел раз в 6 шагов (10 в секунду)
    BULLET_SPEED: 12,""", """    FIRE_RATE: 10,     // точкомёт: выстрелов в секунду; каждая пуля берёт свою цель
    BULLET_SPEED: 12,  // px/шаг""")
rep("""    ['OB_MARGIN', 'Отступ птиц от картинок', 0, 100, 2, 'px'],
""", """    ['OB_MARGIN', 'Отступ птиц от картинок', 0, 100, 2, 'px'],
    ['FIRE_RATE', 'Скорострельность', 2, 240, 1, 'в с'],
    ['BULLET_SPEED', 'Скорость пуль', 4, 40, 1, 'px/шаг'],
""")
rep("""    let kills = 0, fireCD = 0;
    const B = { n: 0, x: new Float32Array(512), y: new Float32Array(512), vx: new Float32Array(512), vy: new Float32Array(512), life: new Int16Array(512) };""",
"""    let kills = 0, fireAcc = 0, TGT = new Int32Array(0);   // TGT: до какого шага буква уже взята на прицел
    const B = { n: 0, x: new Float32Array(4096), y: new Float32Array(4096), vx: new Float32Array(4096), vy: new Float32Array(4096), life: new Int16Array(4096) };""")
rep("""              const i = idx[q], dx = X[i] - px, dy = Y[i] - py, d2 = dx * dx + dy * dy;
              if (d2 < bd2) { bd2 = d2; best = i; }""", """              const i = idx[q];
              if (TGT[i] > stepNo) continue;            // в неё уже летит пуля — ищем следующую
              const dx = X[i] - px, dy = Y[i] - py, d2 = dx * dx + dy * dy;
              if (d2 < bd2) { bd2 = d2; best = i; }""")
rep("""      if (armed && --fireCD <= 0) {
        const t = nearestActive(sx, sy, CFG.FIRE_RANGE);
        if (t >= 0 && B.n < B.x.length) {
          fireCD = CFG.FIRE_EVERY;
          // упреждение: целимся туда, где буква окажется к моменту встречи
          const dx0 = X[t] - sx, dy0 = Y[t] - sy, tt = Math.sqrt(dx0 * dx0 + dy0 * dy0) / BS;
          const ax = dx0 + VX[t] * tt, ay = dy0 + VY[t] * tt, al = Math.sqrt(ax * ax + ay * ay) + 1e-3;
          const j = B.n++;
          B.x[j] = sx; B.y[j] = sy; B.vx[j] = ax / al * BS; B.vy[j] = ay / al * BS; B.life[j] = CFG.BULLET_LIFE;
        } else fireCD = 3;
      }""", """      if (armed) {
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
      } else fireAcc = 0;""")

# --- курсор в мурмурации без круга и «галочки» ---
rep("""        if (P.inside) {
          octx.strokeStyle = opts.accent; octx.globalAlpha = 0.35; octx.lineWidth = 1;
          octx.setLineDash([4, 6]);
          octx.beginPath(); octx.arc(P.cx, P.cy, CFG.FALCON_R, 0, Math.PI * 2); octx.stroke();
          octx.setLineDash([]); octx.globalAlpha = 1; octx.lineWidth = 2.2;
          octx.beginPath();
          octx.moveTo(P.cx - 13, P.cy - 3); octx.quadraticCurveTo(P.cx - 6, P.cy - 8, P.cx, P.cy + 2);
          octx.quadraticCurveTo(P.cx + 6, P.cy - 8, P.cx + 13, P.cy - 3); octx.stroke();
        }
""", "")

# --- скрытие текста: панель и закреплённые элементы не трогаем ---
rep("""      '.ls-hidden,.ls-hidden *{color:transparent!important;""", """      '.ls-hidden,.ls-hidden *:not(.ls-ui):not(.ls-keep):not(.ls-keep *){color:transparent!important;""")
rep("""    Object.assign(hudHost.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483001' });""",
"""    hudHost.className = 'ls-ui';
    Object.assign(hudHost.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483001', color: '#000', webkitTextFillColor: 'currentcolor' });""")

# --- извлечение: закреплённые (fixed/sticky) блоки остаются текстом ---
rep("""    function build() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      root.classList.remove('ls-hidden');""", """    // закреплённые блоки (шапки, липкие меню) при прокрутке едут вместе с экраном, а буквы живут в координатах страницы —
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
      const keepSet = new Set();""")
rep("""          if (p.closest('script,style,noscript,textarea,input,select,option,svg,math,canvas,iframe')) {
            return NodeFilter.FILTER_REJECT;
          }""", """          if (p.closest('script,style,noscript,textarea,input,select,option,svg,math,canvas,iframe,.ls-ui')) {
            return NodeFilter.FILTER_REJECT;
          }
          const pin = pinnedTop(p);
          if (pin) { keepSet.add(pin); return NodeFilter.FILTER_REJECT; }""")
rep("""      root.classList.add('ls-hidden');

      buildAtlas(""", """      for (const el of keepSet) {
        const cs = global.getComputedStyle(el);
        keepEls.push([el, el.style.color, el.style.webkitTextFillColor]);
        el.style.color = cs.color; el.style.webkitTextFillColor = cs.webkitTextFillColor || 'currentcolor';
        el.classList.add('ls-keep');
      }
      root.classList.add('ls-hidden');

      buildAtlas(""")
rep("canvas.remove(); overlay.remove(); hudHost.remove(); hideStyle.remove();", "canvas.remove(); overlay.remove(); hudHost.remove(); hideStyle.remove(); releaseKeep();")

# --- «около экрана»: при прокрутке в стае и орде взлетают и новые буквы ---
rep("""    function wakePending() {""", """    function wakeNearScroll() {
      const top = global.scrollY - vh, bottom = global.scrollY + vh * 2;
      let woke = 0;
      for (let i = 0; i < N; i++) {
        if (ST[i] !== 0 || WAKEAT[i] >= 0 || HY[i] < top || HY[i] > bottom) continue;
        WAKEAT[i] = stepNo + Math.random() * 30; CALMT[i] = 0; pendingWakes++; woke++;
      }
      return woke;
    }
    function wakePending() {""")
rep("""      const sx = global.scrollX, sy = global.scrollY;
      if (activeCount || dirty || sx !== lastSX || sy !== lastSY || mode !== 'rest') {""", """      const sx = global.scrollX, sy = global.scrollY;
      if (mode !== 'rest' && opts.wakeScope === 'near' && sy !== lastSY) wakeNearScroll();
      if (activeCount || dirty || sx !== lastSX || sy !== lastSY || mode !== 'rest') {""")

# --- «Покой»: каждая буква паникует своё время, домой летит по дуге с креном, а не резинкой ---
rep("""          ST[i] = 1; WK[i] = 0;
          const k = 2 + Math.random() * 1.5;
          VX[i] = dx / d * k + P.vx * 0.25;
          VY[i] = dy / d * k + P.vy * 0.25 - 1;
        }
        CALMT[i] = 0;""", """          ST[i] = 1; WK[i] = 0;
          const k = 2 + Math.random() * 1.5;
          VX[i] = dx / d * k + P.vx * 0.25;
          VY[i] = dy / d * k + P.vy * 0.25 - 1.4;
        }
        CALMT[i] = calmStart(i);""")
rep("""          if (mode === 'rest') CALMT[i] = 0;""", """          if (mode === 'rest') CALMT[i] = calmStart(i);""")
rep("""    function shockwave(px, py) {""", """    // сколько буква кружит после испуга: 0,6…1,5 от CALM — садятся вразнобой, а не все разом
    const calmStart = (i) => CFG.CALM * (0.4 - 0.9 * RT[i]);
    function shockwave(px, py) {""")
rep("""            if (hd > 0.01) {
              // домой тянет не слабее, чем с разгоном 0,4: иначе великаны садятся на место по полминуты
              const want = Math.min(9, hd * 0.09), hk = am < 0.4 ? 0.072 / am : 0.18;
              ax += (hx / hd * want - vx) * hk; ay += (hy / hd * want - vy) * hk;
            }
            maxS = 9;""", """            if (hd > 0.01) {
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
              if (hd < 2 && CALMT[i] > CFG.CALM + 120) { vx = hx; vy = hy; }   // страховка: не кружить у самого места
            }
            maxS = 9;""")
p.write_text(s, encoding='utf-8')
print('ok')
