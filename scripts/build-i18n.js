#!/usr/bin/env node
/*
  Собирает казахскую и английскую копии бандла главной из русского.

    node scripts/build-i18n.js          — пересобрать assets/index-*.kk.js и .en.js
    node scripts/build-i18n.js --list   — показать все русские строки бандла

  Исходников Vue в репозитории нет, поэтому переводим уже собранный бандл:
  каждую русскую строку в `...` (а в HTML-кусках — каждый текстовый узел)
  ищем в словаре i18n/bundle.<lang>.json. Ключ — русский текст без
  краевых пробелов. Если строки нет в словаре, сборка падает и печатает,
  чего не хватает: так после правки текста на русской главной перевод
  не отстанет молча.

  Запускать после каждого изменения бандла (в т.ч. после patch-bundle.js).
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = 'assets/index-C9VrdjED.js';
const LANGS = ['kk', 'en'];
const CYR = /[А-Яа-яЁё]/;

// Внутренние страницы, на которые бандл ведёт ссылками и window.open.
const PAGE_PATHS = ['/ai-for-work/', '/ai-for-leaders/', '/blog/'];

const js = fs.readFileSync(path.join(ROOT, SRC), 'utf8');

// Текстовые куски одного шаблонного литерала: [{text}] для подстановки.
function segments(lit) {
  if (lit.includes('<')) {
    const out = [];
    lit.replace(/>([^<]*)</g, (m, t) => {
      if (CYR.test(t)) out.push(t.trim());
      return m;
    });
    return out;
  }
  return CYR.test(lit) ? [lit.trim()] : [];
}

function translateLiteral(lit, dict, missing) {
  const tr = (raw) => {
    const key = raw.trim();
    if (!(key in dict)) {
      missing.add(key);
      return raw;
    }
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    return lead + dict[key] + trail;
  };
  if (lit.includes('<')) {
    return lit.replace(/>([^<]*)</g, (m, t) => (CYR.test(t) ? '>' + tr(t) + '<' : m));
  }
  return CYR.test(lit) ? tr(lit) : lit;
}

if (process.argv.includes('--list')) {
  const seen = new Set();
  js.replace(/`([^`]*)`/g, (m, lit) => {
    segments(lit).forEach((s) => seen.add(s));
    return m;
  });
  console.log(JSON.stringify([...seen], null, 2));
  process.exit(0);
}

let failed = false;
for (const lang of LANGS) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `i18n/bundle.${lang}.json`), 'utf8'));
  const missing = new Set();
  let out = js.replace(/`([^`]*)`/g, (m, lit) => '`' + translateLiteral(lit, dict, missing) + '`');

  for (const p of PAGE_PATHS) out = out.split('`' + p + '`').join('`/' + lang + p + '`');

  if (missing.size) {
    failed = true;
    console.error(`[${lang}] нет перевода для ${missing.size} строк:`);
    missing.forEach((k) => console.error('  ' + JSON.stringify(k)));
    continue;
  }
  if (lang === 'en' && CYR.test(out)) {
    failed = true;
    const left = out.match(/.{0,40}[А-Яа-яЁё].{0,40}/g) || [];
    console.error('[en] в бандле осталась кириллица:\n  ' + left.slice(0, 10).join('\n  '));
    continue;
  }
  const dest = SRC.replace(/\.js$/, `.${lang}.js`);
  fs.writeFileSync(path.join(ROOT, dest), out);
  console.log(`[${lang}] ${dest}`);
}

/* --- hreflang и переключатель языка во всех страницах ------------------

   Страница считается переведённой, если есть и kk/<путь>, и en/<путь>.
   В <head> каждой из трёх версий ставим блок между маркерами i18n:
   ссылки hreflang и lang-switch.js. Блок перезаписывается при каждом
   запуске, поэтому скрипт можно гонять сколько угодно раз. */

const SITE = 'https://airl.kz';
const START = '<!-- i18n:start -->';
const END = '<!-- i18n:end -->';

function htmlFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.posix.join(dir, d.name);
    if (d.isDirectory()) return htmlFiles(rel);
    return d.name.endsWith('.html') ? [rel] : [];
  });
}

const pages = htmlFiles('kk')
  .map((f) => f.slice('kk/'.length))
  .filter((rel) => fs.existsSync(path.join(ROOT, rel)) && fs.existsSync(path.join(ROOT, 'en', rel)))
  .sort();

const urls = [];
for (const rel of pages) {
  const ru = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = ru.match(/<link rel="canonical" href="https:\/\/airl\.kz(\/[^"]*)"/);
  if (!m) {
    failed = true;
    console.error(`${rel}: нет canonical — не знаю адрес страницы`);
    continue;
  }
  const p = m[1];
  const href = { ru: SITE + p, kk: SITE + '/kk' + p, en: SITE + '/en' + p };
  urls.push(href);

  const block = [
    START,
    `    <link rel="alternate" hreflang="ru" href="${href.ru}" />`,
    `    <link rel="alternate" hreflang="kk" href="${href.kk}" />`,
    `    <link rel="alternate" hreflang="en" href="${href.en}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${href.ru}" />`,
    `    <script src="/lang-switch.js?v=1"></script>`,
    `    ${END}`,
  ].join('\n');

  for (const file of [rel, 'kk/' + rel, 'en/' + rel]) {
    const full = path.join(ROOT, file);
    let html = fs.readFileSync(full, 'utf8');
    const s = html.indexOf(START);
    if (s !== -1) {
      html = html.slice(0, s) + block + html.slice(html.indexOf(END) + END.length);
    } else {
      // Сразу после canonical: lang-switch.js должен выполниться раньше
      // скриптов страницы, которые читают AIRL_LANG.
      html = html.replace(/(<link rel="canonical"[^>]*>)/, `$1\n    ${block}`);
    }
    fs.writeFileSync(full, html);
  }
}
console.log(`hreflang: ${pages.length} страниц × 3 языка`);

/* --- sitemap.xml: все три языка с перекрёстными ссылками ---------------- */

const today = new Date().toISOString().slice(0, 10);
const priority = (p) => (p === '/' ? '1.0' : /^\/(ai-for-work|ai-for-leaders)\//.test(p) ? '0.9' : '0.8');
const entries = urls.flatMap((href) =>
  ['ru', 'kk', 'en'].map((lang) => {
    const p = href.ru.slice(SITE.length);
    return [
      '  <url>',
      `    <loc>${href[lang]}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <priority>${priority(p)}</priority>`,
      ...['ru', 'kk', 'en'].map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${href[l]}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${href.ru}" />`,
      '  </url>',
    ].join('\n');
  })
);
fs.writeFileSync(
  path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') +
    '\n</urlset>\n'
);
console.log(`sitemap.xml: ${entries.length} адресов`);

process.exit(failed ? 1 : 0);
