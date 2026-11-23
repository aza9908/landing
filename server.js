// Сервер лендинга airl.kz.
// Раздаёт статические файлы так же, как раньше это делал `serve .`,
// и дополнительно проксирует внутренний хаб /airl-hub/ на сервер AIRL.
// Данные хаба в этом репозитории не хранятся: они лежат на сервере и
// отдаются только после ввода логина и пароля (проверяет сам сервер).
// Форма входа — hub-login.html.
const http = require('http');
const https = require('https');
const { promisify } = require('util');
const handler = require('serve-handler');
const compress = promisify(require('compression')());

const PORT = process.env.PORT || 8080;
const HUB_UPSTREAM = new URL(process.env.HUB_UPSTREAM || 'https://server.airl.kz');
const HUB_PATH = '/airl-hub/';
const UP_PATH = '/airl-1c-hub/';   // путь хаба на сервере AIRL (исторический)
// латинская c/C и кириллическая с/С в адресе — все варианты ведут в хаб
const HUB_RE = /^\/airl-(1[cCсС]-)?hub(\/.*)?$/i;   // и прежний адрес /airl-1c-hub/ — он перенаправляется
const PASS_HEADERS = ['content-type', 'content-length', 'last-modified', 'etag'];

function hubPath(url) {
  let path;
  try { path = decodeURIComponent(url.split('?')[0]); } catch (e) { return null; }
  return HUB_RE.test(path) ? path : null;
}

const fs = require('fs');
const path_ = require('path');
const LOGIN_HTML = fs.readFileSync(path_.join(__dirname, 'hub-login.html'), 'utf8');
// Интерфейс хаба (без данных) лежит в hub-app/ и отдаётся только после входа;
// сами данные (data.json) каждый раз берутся с сервера AIRL.
const HUB_APP = {
  '': ['text/html; charset=utf-8', fs.readFileSync(path_.join(__dirname, 'hub-app', 'index.html'))],
  'chart.umd.js': ['text/javascript; charset=utf-8', fs.readFileSync(path_.join(__dirname, 'hub-app', 'chart.umd.js'))],
};
const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
// Сессия хаба: в cookie лежат введённые логин и пароль (как при обычной
// HTTP-авторизации браузер шлёт их с каждым запросом). Cookie недоступна
// скриптам (HttpOnly), передаётся только по HTTPS и только на адреса хаба.
// Имя __session — единственное, которое гарантированно пропускает хостинг Firebase.
const COOKIE = '__session';
const COOKIE_ATTRS = `Path=${HUB_PATH}; HttpOnly; Secure; SameSite=Strict`;
const SESSION_SECONDS = 7 * 24 * 3600;

function hubAuth(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)__session=([A-Za-z0-9+/=_-]+)/);
  return m ? 'Basic ' + m[1] : null;
}

function loginPage(res, status, error, extra) {
  const html = LOGIN_HTML.replace('<!--ERROR-->', error ? `<p class="err" role="alert">${error}</p>` : '');
  res.writeHead(status, { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', ...extra });
  res.end(html);
}

function upstream(method, path, auth, cb, body) {
  const headers = { host: HUB_UPSTREAM.host, accept: '*/*', 'x-airl-hub': 'landing-proxy' };
  if (auth) headers.authorization = auth;
  if (body) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(body); }
  const lib = HUB_UPSTREAM.protocol === 'http:' ? http : https;
  const up = lib.request({
    protocol: HUB_UPSTREAM.protocol, hostname: HUB_UPSTREAM.hostname, port: HUB_UPSTREAM.port || undefined,
    method, path: encodeURI(path), headers, timeout: body ? 290000 : 20000,   // ответ агента в чате идёт дольше
  }, (r) => cb(null, r));
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (e) => cb(e));
  up.end(body || undefined);
}

// Чат с агентами: единственное место, где хаб принимает данные от пользователя.
// Только JSON и только с этой страницы (cookie SameSite=Strict + проверка типа содержимого).
function hubApiPost(req, res, path, auth) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { res.writeHead(415, NO_STORE); return res.end(); }
  // обычные сообщения — до 20 КБ; файл ТЗ для агента КП — до 10 МБ (в JSON он занимает на треть больше)
  const limit = path === HUB_PATH + 'api/kp' ? 15 * 1024 * 1024 : 20000;
  const chunks = [];
  let size = 0, big = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { if (!big) { big = true; res.writeHead(413, NO_STORE); res.end(); req.destroy(); } return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (big) return;
    upstream('POST', UP_PATH + path.slice(HUB_PATH.length), auth, (err, r) => {
      if (err) return unavailable(res);
      const out = { ...NO_STORE };
      for (const h of PASS_HEADERS) if (r.headers[h]) out[h] = r.headers[h];
      res.writeHead(r.statusCode === 401 ? 403 : r.statusCode, out);
      r.pipe(res);
    }, size ? Buffer.concat(chunks) : '{}');
  });
}

function unavailable(res) {
  if (res.headersSent) return res.end();
  res.writeHead(502, { ...NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Хаб временно недоступен');
}

function hubLogin(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    const f = new URLSearchParams(body);
    const user = (f.get('username') || '').trim(), pass = f.get('password') || '';
    if (!user || !pass || user.includes(':')) return loginPage(res, 401, 'Введите логин и пароль.');
    const token = Buffer.from(`${user}:${pass}`).toString('base64');
    upstream('HEAD', UP_PATH, 'Basic ' + token, (err, r) => {
      if (err) return unavailable(res);
      r.resume();
      if (r.statusCode === 200) {
        res.writeHead(303, { ...NO_STORE, Location: HUB_PATH,
          'Set-Cookie': `${COOKIE}=${token}; Max-Age=${SESSION_SECONDS}; ${COOKIE_ATTRS}` });
        return res.end();
      }
      if (r.statusCode !== 401) return unavailable(res);
      // небольшая пауза затрудняет перебор паролей
      setTimeout(() => loginPage(res, 401, 'Неверный логин или пароль.'), 1200);
    });
  });
}

function hubMe(req, res, auth) {
  let user = '';
  try { user = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')[0]; } catch (e) { /* пусто */ }
  const send = (code, body) => { res.writeHead(code, { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  upstream('GET', UP_PATH + 'private/roles.json', auth, (err, r) => {
    if (err) return unavailable(res);
    let body = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { if (body.length < 65536) body += c; });
    r.on('end', () => {
      if (r.statusCode === 200) {
        let roles = {};
        try { roles = JSON.parse(body); } catch (e) { /* пусто */ }
        return send(200, { user, role: roles[user] === 'superadmin' ? 'superadmin' : 'admin' });
      }
      if (r.statusCode === 404) return send(200, { user, role: 'admin', legacy: true });   // сервер ещё без ролей
      // 401/403: в списке руководителей его нет. Проверяем, что пароль вообще верный.
      upstream('HEAD', UP_PATH, auth, (e2, r2) => {
        if (e2) return unavailable(res);
        r2.resume();
        if (r2.statusCode === 401) return send(401, {});
        return send(200, { user, role: 'user' });
      });
    });
  });
}

function proxyHub(req, res, path) {
  const clear = { 'Set-Cookie': `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}` };
  if (!path.startsWith(HUB_PATH)) {
    res.writeHead(302, { ...NO_STORE, Location: HUB_PATH });
    return res.end();
  }
  if (path.includes('..')) { res.writeHead(400, NO_STORE); return res.end(); }
  if (path === HUB_PATH + 'login' && req.method === 'POST') return hubLogin(req, res);
  if (path === HUB_PATH + 'logout') { res.writeHead(303, { ...NO_STORE, ...clear, Location: HUB_PATH }); return res.end(); }
  if (req.method === 'POST' && path.startsWith(HUB_PATH + 'api/')) {
    const a = hubAuth(req);
    if (!a) { res.writeHead(401, NO_STORE); return res.end(); }
    return hubApiPost(req, res, path, a);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, NO_STORE); return res.end(); }
  const isPage = path === HUB_PATH || path === HUB_PATH + 'login';
  const auth = hubAuth(req);
  if (!auth) {
    if (isPage) return loginPage(res, 200);
    res.writeHead(401, NO_STORE);
    return res.end();
  }
  if (path === HUB_PATH + 'login') { res.writeHead(303, { ...NO_STORE, Location: HUB_PATH }); return res.end(); }
  if (path === HUB_PATH + 'me') return hubMe(req, res, auth);
  const local = HUB_APP[path.slice(HUB_PATH.length)];
  // страницу хаба отдаём сами, но сначала сервер AIRL подтверждает логин и пароль
  const rest = path.slice(HUB_PATH.length);
  upstream(local ? 'HEAD' : req.method, UP_PATH + (local ? '' : rest), auth, (err, r) => {
    if (err) return unavailable(res);
    if (r.statusCode === 401 && rest.startsWith('private/')) {   // вошёл, но это раздел руководителей
      r.resume();
      res.writeHead(403, NO_STORE);
      return res.end();
    }
    if (r.statusCode === 401) {   // пароль сменили или cookie испорчена
      r.resume();
      if (isPage) return loginPage(res, 200, '', clear);
      res.writeHead(401, { ...NO_STORE, ...clear });
      return res.end();
    }
    if (r.statusCode >= 300 && r.statusCode < 400) { r.resume(); return unavailable(res); } // хаб на сервере не подключён
    if (local) {
      r.resume();
      if (r.statusCode !== 200) return unavailable(res);
      res.writeHead(200, { ...NO_STORE, 'Content-Type': local[0], 'Content-Length': local[1].length });
      return res.end(req.method === 'HEAD' ? undefined : local[1]);
    }
    const out = { ...NO_STORE };
    for (const h of PASS_HEADERS) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
}

// ── LMS: https://airl.kz/lms/… ───────────────────────────────────────────────
// The LMS (Next.js, built with NEXT_PUBLIC_BASE_PATH=/lms) runs on the AIRL
// VPS. We stream /lms and /lms/* to it unchanged, so the platform lives at
// airl.kz/lms/{ru,uz,kk,en} instead of a separate domain.
const LMS_UPSTREAM = new URL(process.env.LMS_UPSTREAM || 'https://lms.magauin.kz');
const LMS_RE = /^\/lms(\/|$)/;
// Hop-by-hop headers are per-connection and must not be forwarded.
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

function proxyLms(req, res) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
  headers.host = LMS_UPSTREAM.host;
  headers['x-forwarded-host'] = req.headers.host || 'airl.kz';
  headers['x-forwarded-proto'] = 'https';
  // Marks requests from this proxy: the VPS redirects every other visitor of
  // the old host (lms.magauin.kz) to https://airl.kz/lms.
  headers['x-airl-lms-proxy'] = '1';
  const lib = LMS_UPSTREAM.protocol === 'http:' ? http : https;
  const up = lib.request({
    protocol: LMS_UPSTREAM.protocol, hostname: LMS_UPSTREAM.hostname,
    port: LMS_UPSTREAM.port || undefined, method: req.method, path: req.url, headers,
    timeout: 30000,
  }, (r) => {
    const out = {};
    for (const [k, v] of Object.entries(r.headers)) if (!HOP.has(k)) out[k] = v;
    // Redirects that name the upstream origin must stay on airl.kz.
    if (typeof out.location === 'string' && out.location.startsWith(LMS_UPSTREAM.origin)) {
      out.location = out.location.slice(LMS_UPSTREAM.origin.length) || '/lms';
    }
    // Pages and data must never sit in the CDN in front of airl.kz: a cached
    // page keeps showing an old LMS after a deploy. Only content-addressed
    // build files and lesson media (their URLs change when they change) may be
    // cached; everything else is sent with no-store.
    const p = (req.url || '').split('?')[0];
    if (!/^\/lms\/(_next\/static|workbook)\//.test(p)) {
      out['cache-control'] = 'private, no-cache, no-store, max-age=0, must-revalidate';
      delete out['expires'];
    }
    // Cookies scoped to the upstream domain would be rejected by the browser.
    if (out['set-cookie']) {
      out['set-cookie'] = [].concat(out['set-cookie']).map((c) => c.replace(/;\s*domain=[^;]*/i, ''));
    }
    res.writeHead(r.statusCode || 502, out);
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', () => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('LMS временно недоступна');
  });
  req.pipe(up);
}

// ── Онлайн-урок: https://online.airl.kz/ ────────────────────────────────────
// Поддомен смотрит на этот же сервер. Его страницы лежат в папке online/:
// online.airl.kz/ → online/index.html, /thankpage/ → online/thankpage/.
// Остальные адреса (стили, видео кейсов, /online/online.js) — общие с airl.kz.
const ONLINE_HOST_RE = /^online\.airl\.kz(:\d+)?$/i;
const ONLINE_PAGE_RE = /^\/(thankpage\/?)?(\?|$)/;

function isOnlineHost(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return ONLINE_HOST_RE.test(host);
}

// Картинки, видео и шрифты кэширует CDN Firebase. Без Cache-Control каждый
// кусок видео шёл с контейнера заново (~0,4 с на запрос), и ролики кейсов
// подвисали. Чтобы заменить файл сразу, меняйте ?v= в ссылке на него.
const STATIC_CACHE = [{
  source: '**/*.@(mp4|webm|jpg|jpeg|png|webp|avif|gif|svg|woff|woff2)',
  headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800' }],
}];

// ── API: заявки, диагностика, панель (раньше — Firestore и Cloud Functions) ──
const api = require('./api');

http.createServer(async (req, res) => {
  const apiPath = (req.url || '/').split('?')[0];
  if (apiPath === '/api' || apiPath.startsWith('/api/')) return api.handle(req, res, apiPath);
  if (isOnlineHost(req) && ONLINE_PAGE_RE.test(req.url || '/')) req.url = '/online' + (req.url || '/');
  if (LMS_RE.test((req.url || '/').split('?')[0])) return proxyLms(req, res);
  const path = hubPath(req.url || '/');
  if (path) return proxyHub(req, res, path);
  if (/^\/hub-(app|server)(\/|$)/i.test((req.url || '').split('?')[0])) { res.writeHead(404); return res.end(); }
  await compress(req, res);
  return handler(req, res, { etag: true, headers: STATIC_CACHE });
}).listen(PORT, () => console.log(`airl.kz landing on :${PORT}`));
