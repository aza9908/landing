// Сервер лендинга airl.kz.
// Раздаёт статические файлы так же, как раньше это делал `serve .`,
// и дополнительно проксирует внутренний хаб /airl-1c-hub/ на сервер AIRL.
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
const HUB_PATH = '/airl-1c-hub/';
// латинская c/C и кириллическая с/С в адресе — все варианты ведут в хаб
const HUB_RE = /^\/airl-1[cCсС]-hub(\/.*)?$/;
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

function upstream(method, path, auth, cb) {
  const headers = { host: HUB_UPSTREAM.host, accept: '*/*', 'x-airl-hub': 'landing-proxy' };
  if (auth) headers.authorization = auth;
  const lib = HUB_UPSTREAM.protocol === 'http:' ? http : https;
  const up = lib.request({
    protocol: HUB_UPSTREAM.protocol, hostname: HUB_UPSTREAM.hostname, port: HUB_UPSTREAM.port || undefined,
    method, path: encodeURI(path), headers, timeout: 20000,
  }, (r) => cb(null, r));
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (e) => cb(e));
  up.end();
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
    upstream('HEAD', HUB_PATH, 'Basic ' + token, (err, r) => {
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

function proxyHub(req, res, path) {
  const clear = { 'Set-Cookie': `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}` };
  if (!path.startsWith(HUB_PATH)) {
    res.writeHead(302, { ...NO_STORE, Location: HUB_PATH });
    return res.end();
  }
  if (path.includes('..')) { res.writeHead(400, NO_STORE); return res.end(); }
  if (path === HUB_PATH + 'login' && req.method === 'POST') return hubLogin(req, res);
  if (path === HUB_PATH + 'logout') { res.writeHead(303, { ...NO_STORE, ...clear, Location: HUB_PATH }); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, NO_STORE); return res.end(); }
  const isPage = path === HUB_PATH || path === HUB_PATH + 'login';
  const auth = hubAuth(req);
  if (!auth) {
    if (isPage) return loginPage(res, 200);
    res.writeHead(401, NO_STORE);
    return res.end();
  }
  if (path === HUB_PATH + 'login') { res.writeHead(303, { ...NO_STORE, Location: HUB_PATH }); return res.end(); }
  const local = HUB_APP[path.slice(HUB_PATH.length)];
  // страницу хаба отдаём сами, но сначала сервер AIRL подтверждает логин и пароль
  upstream(local ? 'HEAD' : req.method, local ? HUB_PATH + 'data.json' : path, auth, (err, r) => {
    if (err) return unavailable(res);
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

http.createServer(async (req, res) => {
  const path = hubPath(req.url || '/');
  if (path) return proxyHub(req, res, path);
  if (/^\/hub-app(\/|$)/i.test((req.url || '').split('?')[0])) { res.writeHead(404); return res.end(); }
  await compress(req, res);
  return handler(req, res, { etag: true });
}).listen(PORT, () => console.log(`airl.kz landing on :${PORT}`));
