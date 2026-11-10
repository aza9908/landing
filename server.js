// Сервер лендинга airl.kz.
// Раздаёт статические файлы так же, как раньше это делал `serve .`,
// и дополнительно проксирует внутренний хаб /airl-1c-hub/ на сервер AIRL.
// Данные хаба в этом репозитории не хранятся: они лежат на сервере и
// отдаются только после ввода логина и пароля (проверяет сам сервер).
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
const PASS_HEADERS = ['content-type', 'content-length', 'www-authenticate', 'last-modified', 'etag'];

function hubPath(url) {
  let path;
  try { path = decodeURIComponent(url.split('?')[0]); } catch (e) { return null; }
  return HUB_RE.test(path) ? path : null;
}

function proxyHub(req, res, path) {
  const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!path.startsWith(HUB_PATH)) {
    res.writeHead(302, { ...noStore, Location: HUB_PATH });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' || path.includes('..')) {
    res.writeHead(405, noStore);
    return res.end();
  }
  // сервер отдаёт хаб только запросам с этим заголовком: напрямую по своему адресу он хаб не показывает
  const headers = { host: HUB_UPSTREAM.host, accept: req.headers.accept || '*/*', 'x-airl-hub': 'landing-proxy' };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  const lib = HUB_UPSTREAM.protocol === 'http:' ? http : https;
  const up = lib.request({
    protocol: HUB_UPSTREAM.protocol, hostname: HUB_UPSTREAM.hostname, port: HUB_UPSTREAM.port || undefined,
    method: req.method, path: encodeURI(path), headers, timeout: 20000,
  }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400) { r.resume(); return fail(); } // хаб на сервере ещё не подключён
    const out = { ...noStore };
    for (const h of PASS_HEADERS) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
  function fail() {
    if (res.headersSent) return res.end();
    res.writeHead(502, { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Хаб временно недоступен');
  }
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', fail);
  up.end();
}

http.createServer(async (req, res) => {
  const path = hubPath(req.url || '/');
  if (path) return proxyHub(req, res, path);
  await compress(req, res);
  return handler(req, res, { etag: true });
}).listen(PORT, () => console.log(`airl.kz landing on :${PORT}`));
