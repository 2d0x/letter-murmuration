// Сборка букмарклета из движка: node build_bm.js v5 → dist/bm/{bookmarklet.txt, index.html}
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ver = process.argv[2] || 'v5';
const here = __dirname;
const engine = fs.readFileSync(path.join(here, ver, 'engine.js'), 'utf8');

// Повторное нажатие закладки выключает мурмурацию; берём всю страницу
const wrapper = `(function () {
  var L = window.LetterSwarm;
  if (L && L.__instance) { L.__instance.destroy(); return; }
${engine}
  window.LetterSwarm.start(document.body, { wakeScope: 'near', escToDestroy: true });
})();`;

// в javascript:-адресе браузер раскодирует %XX, а # начинает «якорь» — их кодируем; кириллицу и управляющие символы тоже
const enc = (s) => s.replace(/[%#\u0000-\u001f\u007f-￿]/g, (c) => encodeURIComponent(c));

(async () => {
  const out = await minify(wrapper, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  const code = out.code;
  if (/<\/script|<!--/i.test(code)) throw new Error('в коде есть последовательность, ломающая <script>');
  const bm = 'javascript:' + enc(code);
  const dir = path.join(here, 'dist', 'bm');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), bm);
  fs.writeFileSync(path.join(dir, 'bookmarklet.min.js'), code);
  const tpl = fs.readFileSync(path.join(here, 'bm', 'install.html'), 'utf8');
  const kb = (n) => Math.round(n / 1024);
  const page = tpl
    .replace('/*__RUN__*/', () => 'window.__runBM = function () {' + code + '};')
    .replace('/*__BM__*/', () => 'const BM = ' + JSON.stringify(bm).replace(/</g, '\\u003c') + ';')
    .replace(/__SIZE__/g, String(kb(bm.length)));
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  console.log(`${ver}: минифицировано ${kb(code.length)} КБ, закладка ${kb(bm.length)} КБ, страница ${kb(page.length)} КБ`);
})().catch((e) => { console.error(e); process.exit(1); });
