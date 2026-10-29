// Сборка букмарклета из движка: node build_bm.js v6 → dist/bm/{bookmarklet.txt, index.html}
// Если есть bm/install.ru.html — ещё и русская закладка в dist/bm/ru/ (панель с lang: 'ru')
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ver = process.argv[2] || 'v5';
const here = __dirname;
const engine = fs.readFileSync(path.join(here, ver, 'engine.js'), 'utf8');

// в javascript:-адресе браузер раскодирует %XX, а # начинает «якорь» — их кодируем; кириллицу и управляющие символы тоже
const enc = (s) => s.replace(/[%#\u0000-\u001f\u007f-￿]/g, (c) => encodeURIComponent(c));
const kb = (n) => Math.round(n / 1024);

async function build(tplName, outDir, langOpt) {
  // Повторное нажатие закладки выключает мурмурацию; берём всю страницу
  const wrapper = `(function () {
  var L = window.LetterSwarm;
  if (L && L.__instance) { L.__instance.destroy(); return; }
${engine}
  window.LetterSwarm.start(document.body, { wakeScope: 'near', escToDestroy: true${langOpt} });
})();`;
  const out = await minify(wrapper, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  const code = out.code;
  if (/<\/script|<!--/i.test(code)) throw new Error('в коде есть последовательность, ломающая <script>');
  const bm = 'javascript:' + enc(code);
  const dir = path.join(here, 'dist', ...outDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), bm);
  fs.writeFileSync(path.join(dir, 'bookmarklet.min.js'), code);
  const tpl = fs.readFileSync(path.join(here, 'bm', tplName), 'utf8');
  const page = tpl
    .replace('/*__RUN__*/', () => 'window.__runBM = function () {' + code + '};')
    .replace('/*__BM__*/', () => 'const BM = ' + JSON.stringify(bm).replace(/</g, '\\u003c') + ';')
    .replace(/__SIZE__/g, String(kb(bm.length)));
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  console.log(`${ver} ${['dist', ...outDir].join('/')}: минифицировано ${kb(code.length)} КБ, закладка ${kb(bm.length)} КБ, страница ${kb(page.length)} КБ`);
}

(async () => {
  await build('install.html', ['bm'], '');
  if (fs.existsSync(path.join(here, 'bm', 'install.ru.html'))) await build('install.ru.html', ['bm', 'ru'], ", lang: 'ru'");
})().catch((e) => { console.error(e); process.exit(1); });
