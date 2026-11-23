'use strict';
/*
  API лендинга airl.kz — то, что раньше делали Firestore и Cloud Functions.

  Без пароля:
    POST /api/leads                  заявка с формы → код группы → Telegram
    POST /api/express-diagnostics    результат экспресс-диагностики
    POST /api/online-registrations   регистрация на онлайн-урок (копия уходит в Google-таблицу)
    GET  /api/groups-public/{code}   есть ли такой код и активен ли он
    POST /api/interview              чат-агент диагностики (с лимитами)
    GET  /api/files/{key}/{name}     файл агента по ссылке со сроком действия
    GET  /api/health                 {store:true}, если сервер хранит данные

  С паролем панели (заголовки x-airl-login, x-airl-token) — те же имена,
  что были у Cloud Functions, поэтому admin.html и stats.html меняют только адрес:
    GET  /api/leadStats   GET|POST /api/group   GET /api/onlineRegistrations[?format=csv]
    POST /api/diagnostics   POST /api/lesson1   POST /api/closeGroup

  Данные лежат в папке AIRL_DATA_DIR (SQLite + файлы). Если переменная не
  задана, сервер ничего не хранит и отвечает 501 — тогда страницы пишут
  в прежнюю базу. Так один и тот же код работает и до, и после переезда.
*/
const crypto = require('crypto');

const DATA_DIR = process.env.AIRL_DATA_DIR || '';
const ORIGIN = (process.env.AIRL_PUBLIC_ORIGIN || 'https://airl.kz').replace(/\/+$/, '');
const ADMIN_LOGIN = 'admin';

const ROUTE_RE = new RegExp('^/api/(health|leads|express-diagnostics|online-registrations|groups-public/[^/]+|' +
  'interview|leadStats|onlineRegistrations|group|diagnostics|lesson1|closeGroup|files/[^/]+/[^/]+)$');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  res.end(text);
}

function fail(res, e) {
  const status = e.status >= 400 && e.status < 600 ? e.status : 400;
  if (status >= 500 || !(e instanceof HttpError)) console.error('api:', e.message);
  if (!res.headersSent) send(res, status, { error: e.message || String(e) });
}

function readJson(req, limit) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return Promise.reject(new HttpError(415, 'Нужен Content-Type: application/json.'));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Слишком большой запрос.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new HttpError(400, 'Некорректный JSON.')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) || 'unknown');
}

/* --- ограничение частоты (в памяти процесса) --------------------------- */
const hits = new Map();
function count(key, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  hits.set(key, arr);
  return arr;
}
function allow(key, max, windowMs) {
  const arr = count(key, windowMs);
  if (arr.length >= max) return false;
  arr.push(Date.now());
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.some((t) => now - t < 86400000)) hits.delete(k);
}, 600000).unref();

const HOUR = 3600000, DAY = 86400000;
function limit(req, name, perIpHour, perDay) {
  if (!allow(`${name}:${clientIp(req)}`, perIpHour, HOUR) || !allow(`${name}:all`, perDay, DAY)) {
    throw new HttpError(429, 'Слишком много запросов. Попробуйте позже.');
  }
}

/* --- хранилище и агенты поднимаются при первом запросе ------------------ */
let ctx = null;
function init() {
  if (ctx) return ctx;
  const store = require('./store').open(DATA_DIR);
  const files = require('./files').open(DATA_DIR, store, ORIGIN);
  // createGroup() берёт отметку времени так же, как брал у Firebase Admin SDK.
  const admin = { firestore: { FieldValue: { serverTimestamp: () => new Date() } } };
  ctx = {
    store, files, admin,
    legacy: require('./legacy'),
    limits: require('../functions/lib/limits'),
    groups: require('../functions/lib/groups'),
    telegram: require('../functions/lib/telegram')
  };
  files.sweep().catch((e) => console.error('files sweep:', e.message));
  setInterval(() => files.sweep().catch(() => {}), DAY).unref();
  setInterval(() => retryOnlineForwards().catch((e) => console.error('online forward:', e.message)), 60000).unref();
  return ctx;
}

/* --- проверки входных данных ------------------------------------------- */
const ATTR = ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing'];

function onlyKeys(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Некорректные данные.');
  for (const k of Object.keys(body)) {
    if (!allowed.includes(k)) throw new HttpError(400, `Лишнее поле: ${k.slice(0, 40)}`);
  }
}
function text(body, key, max, min) {
  const v = body[key];
  if (v === undefined || v === null) {
    if (min) throw new HttpError(400, `Не заполнено поле ${key}.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `Поле ${key}: нужна строка.`);
  const s = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (s.length > max) throw new HttpError(400, `Поле ${key} слишком длинное.`);
  if (min && s.length < min) throw new HttpError(400, `Не заполнено поле ${key}.`);
  return s;
}
function compact(obj) {
  const out = {};
  for (const k of Object.keys(obj)) if (obj[k] !== '' && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}

/* --- заявка с формы ---------------------------------------------------- */
const LEAD_KEYS = ['company', 'name', 'phone', 'team_size', 'wish', 'source', 'status', 'created_at'].concat(ATTR);

async function createLead(req, res) {
  limit(req, 'lead', 10, 500);
  const b = await readJson(req, 16 * 1024);
  onlyKeys(b, LEAD_KEYS);
  const lead = compact({
    company: text(b, 'company', 120, 2),
    name: text(b, 'name', 120),
    phone: text(b, 'phone', 40),
    team_size: text(b, 'team_size', 60),
    wish: text(b, 'wish', 500),
    source: text(b, 'source', 200),
    ...Object.fromEntries(ATTR.map((k) => [k, text(b, k, 100)])),
    status: 'new',
    created_at: new Date().toISOString()
  });
  const { store } = init();
  const ref = await store.collection('leads').add(lead);
  send(res, 200, { ok: true, id: ref.id });
  issueCode(ref, lead).catch((e) => console.error('lead: failed to auto-issue a code:', e.message));
}

/* Номер из формы («+7 (701) 234 56 78») → 11 цифр для wa.me. Ведущая 8 —
   по-казахстански то же, что 7. Не похоже на номер — ссылку не ставим. */
function whatsappDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length === 11 && d[0] === '7' ? d : '';
}

/* Код группы выдаётся сразу по заявке. WhatsApp без Business API сам писать
   не умеет, поэтому код уходит клиенту через менеджера: ссылка в Telegram
   открывает чат с номером из заявки и уже набранным сообщением. */
async function issueCode(ref, lead) {
  const { store, admin, groups, telegram } = init();
  const group = await groups.createGroup(store, admin, { company: lead.company });
  await ref.update({ status: 'code_issued', group_code: group.code });
  const esc = telegram.escapeHtml;
  const digits = whatsappDigits(lead.phone);
  const sendLink = digits
    ? `\n\n👉 <a href="${esc(`https://wa.me/${digits}?text=` + encodeURIComponent(group.whatsapp_message))}">` +
      'Отправить клиенту ссылку и код в WhatsApp</a>'
    : '';
  await telegram.notifyTelegram(
    'leads',
    '🆕 Заявка → код выдан автоматически\n' +
    `Компания: ${esc(group.company)}\nИмя: ${esc(lead.name || '—')}\n` +
    `Телефон: ${esc(lead.phone || '—')}\n` +
    `Код: ${esc(group.code)}` + sendLink +
    `\n\nГотовое сообщение для WhatsApp:\n${esc(group.whatsapp_message)}`,
    { html: true }
  );
}

/* --- результат экспресс-диагностики ------------------------------------ */
const DIAG_KEYS = ['name', 'company', 'position', 'industry', 'team_size', 'contact',
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'group_code',
  'score', 'level', 'priority', 'segment', 'tier', 'heat', 'icp', 'trigger',
  'report_markdown', 'source', 'status', 'created_at', 'bot'].concat(ATTR);
const DIAG_MAX = { name: 120, company: 120, contact: 80, report_markdown: 30000 };

async function createDiagnostics(req, res) {
  limit(req, 'diag', 20, 1000);
  const b = await readJson(req, 256 * 1024);
  onlyKeys(b, DIAG_KEYS);
  if (b.bot !== 'express-diagnostics') throw new HttpError(400, 'Некорректные данные.');
  if (!Number.isInteger(b.score) || b.score < 4 || b.score > 16) throw new HttpError(400, 'Некорректный балл.');
  const doc = {};
  for (const k of DIAG_KEYS) {
    const v = b[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'string') doc[k] = text(b, k, DIAG_MAX[k] || (ATTR.includes(k) ? 100 : 4000));
    else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) doc[k] = v;
    else throw new HttpError(400, `Поле ${k}: неподдерживаемое значение.`);
  }
  if (typeof doc.name !== 'string' || typeof doc.company !== 'string') {
    throw new HttpError(400, 'Не заполнены имя и компания.');
  }
  doc.status = 'new';
  doc.created_at = new Date().toISOString();
  const { store } = init();
  const ref = await store.collection('express_diagnostics').add(compact(doc));
  send(res, 200, { ok: true, id: ref.id });
}

/* --- регистрация на онлайн-урок -----------------------------------------
   Страница online.airl.kz раньше отправляла регистрацию из браузера прямо в
   Google Apps Script. Теперь её принимает и хранит этот сервер, а в Google
   уходит копия: скрипт по-прежнему пишет строку в таблицу и создаёт сделку
   в Битриксе (воронка «Вебинар»). Если Google недоступен, регистрация всё
   равно сохранена, а копия досылается позже. Отключить копию:
   AIRL_ONLINE_FORWARD_URL=off в /etc/airl-landing.env. */
const ONLINE_FORWARD_URL = (() => {
  const v = process.env.AIRL_ONLINE_FORWARD_URL;
  if (v === undefined || v === '') {
    return 'https://script.google.com/macros/s/AKfycbwUzcJovHizktKKgPKnBjWKrOtmVdOreT6N9-hL-wqGW1OuubTy9y-WUA1tgq2kXAzqZA/exec';
  }
  return /^https:\/\//.test(v) ? v : '';
})();
const ONLINE_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const ONLINE_KEYS = ['name', 'phone', 'page', 'website'].concat(ONLINE_UTM);
const ONLINE_MAX_ATTEMPTS = 30;

/* Телефон к виду 7XXXXXXXXXX — так же, как это делает страница. */
function phoneDigits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d && d[0] !== '7') d = '7' + d;
  return d.slice(0, 11);
}

async function createOnlineRegistration(req, res) {
  limit(req, 'online', 30, 5000);
  const b = await readJson(req, 8 * 1024);
  onlyKeys(b, ONLINE_KEYS);
  // Скрытое поле заполняют только боты: отвечаем «принято» и ничего не сохраняем.
  if (text(b, 'website', 200)) return send(res, 200, { ok: true });
  const name = text(b, 'name', 120, 2);
  const phone = text(b, 'phone', 40, 1);
  const digits = phoneDigits(phone);
  if (digits.length !== 11) throw new HttpError(400, 'Проверьте номер телефона.');

  const { store } = init();
  const now = new Date();
  // Повтор того же номера в течение двух минут — не новая регистрация.
  const same = await store.collection('online_registrations')
    .where('phone_digits', '==', digits).orderBy('created_at', 'desc').limit(1).get();
  if (!same.empty && now - new Date(same.docs[0].data().created_at) < 120000) {
    return send(res, 200, { ok: true, id: same.docs[0].id });
  }
  const reg = compact({
    form: 'online',
    name,
    phone,
    phone_digits: digits,
    page: text(b, 'page', 300),
    ...Object.fromEntries(ONLINE_UTM.map((k) => [k, text(b, k, 200)])),
    created_at: now.toISOString(),
    forward_status: ONLINE_FORWARD_URL ? 'pending' : 'off',
    forward_attempts: 0
  });
  const ref = await store.collection('online_registrations').add(reg);
  send(res, 200, { ok: true, id: ref.id });
  forwardOnline(ref).catch((e) => console.error('online forward:', e.message));
}

/* Копия в Google Apps Script: то же тело формы, что раньше слал браузер.
   Скрипт отвечает на успешный POST переадресацией, поэтому 2xx и 3xx — успех. */
const forwarding = new Set();
async function forwardOnline(ref) {
  if (!ONLINE_FORWARD_URL || forwarding.has(ref.id)) return;
  forwarding.add(ref.id);
  try {
    const snap = await ref.get();
    if (!snap.exists || snap.data().forward_status !== 'pending') return;
    const r = snap.data();
    const body = new URLSearchParams({ form: 'online', name: r.name, phone: r.phone, page: r.page || '', website: '' });
    ONLINE_UTM.forEach((k) => { if (r[k]) body.set(k, r[k]); });
    const attempts = (r.forward_attempts || 0) + 1;
    let error = '';
    try {
      const resp = await fetch(ONLINE_FORWARD_URL, { method: 'POST', body, redirect: 'manual',
        signal: AbortSignal.timeout(30000) });
      if (resp.status < 200 || resp.status >= 400) error = `HTTP ${resp.status}`;
    } catch (e) {
      error = (e.cause && e.cause.code) || e.message || 'failed';
    }
    const tried = new Date();
    if (!error) {
      await ref.update({ forward_status: 'ok', forward_attempts: attempts, forwarded_at: tried.toISOString(), forward_error: '' });
    } else {
      // Пауза растёт: 1, 2, 4… минут, но не больше часа; после 30 попыток сдаёмся.
      const waitMin = Math.min(60, Math.pow(2, attempts - 1));
      await ref.update({
        forward_status: attempts >= ONLINE_MAX_ATTEMPTS ? 'failed' : 'pending',
        forward_attempts: attempts,
        forward_error: String(error).slice(0, 200),
        forward_next_try: new Date(tried.getTime() + waitMin * 60000).toISOString()
      });
    }
  } finally {
    forwarding.delete(ref.id);
  }
}

async function retryOnlineForwards() {
  if (!ONLINE_FORWARD_URL) return;
  const { store } = init();
  const now = new Date().toISOString();
  const due = await store.collection('online_registrations').where('forward_status', '==', 'pending').get();
  for (const d of due.docs) {
    const next = d.data().forward_next_try;
    if (!next || next <= now) await forwardOnline(d.ref);
  }
}

const ONLINE_FIELDS = ['created_at', 'name', 'phone', 'page'].concat(ONLINE_UTM, ['forward_status']);

function csvCell(v) {
  let t = v === undefined || v === null ? '' : String(v);
  // Чтобы Excel не принял текст за формулу; номер телефона (+7 701 …) формулой не станет.
  if (/^[=+\-@]/.test(t) && !/^\+[\d ()-]+$/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}

async function onlineRegistrations(req, res, query) {
  await guard(req);
  const { store } = init();
  const all = await store.collection('online_registrations').orderBy('created_at', 'desc').limit(20000).get();
  const rows = all.docs.map((d) => pickFields(d, ONLINE_FIELDS));
  if (query.get('format') === 'csv') {
    const head = ['Дата', 'Имя', 'Телефон', 'Страница'].concat(ONLINE_UTM, ['Копия в Google-таблицу']);
    const lines = [head.map(csvCell).join(';')].concat(rows.map((r) => ONLINE_FIELDS.map((f) => csvCell(r[f])).join(';')));
    const body = Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': body.length,
      'Content-Disposition': 'attachment; filename="online-registrations.csv"',
      'Cache-Control': 'no-store'
    });
    return res.end(body);
  }
  send(res, 200, {
    generated_at: new Date().toISOString(),
    forward: ONLINE_FORWARD_URL ? 'google-sheet' : 'off',
    total: rows.length,
    not_forwarded: rows.filter((r) => r.forward_status === 'pending' || r.forward_status === 'failed').length,
    registrations: rows
  });
}

/* --- витрина кода группы ----------------------------------------------- */
const legacyMiss = new Map();   // код → когда в последний раз не нашли в старой базе

async function groupPublic(req, res, raw) {
  const { store, limits, legacy } = init();
  let code;
  try { code = limits.validateCode(decodeURIComponent(raw)); }
  catch (e) { return send(res, 404, { error: 'not_found' }); }
  limit(req, 'code', 60, 20000);

  let snap = await store.doc(`groups_public/${code}`).get();
  if (!snap.exists && legacy.enabled && !(Date.now() - (legacyMiss.get(code) || 0) < 600000)) {
    // Код выдан до переезда: забираем его из старой базы один раз.
    try {
      const old = await legacy.groupPublic(code);
      if (old) {
        await store.doc(`groups_public/${code}`).set({ company: old.company, active: old.active });
        const g = store.doc(`groups/${code}`);
        if (!(await g.get()).exists) {
          await g.set({ company: old.company, code, active: old.active, responses_count: 0,
            created_at: new Date().toISOString(), imported_from: 'firebase' });
        }
        snap = await store.doc(`groups_public/${code}`).get();
      } else {
        legacyMiss.set(code, Date.now());
      }
    } catch (e) {
      console.error('legacy code lookup:', e.message);
    }
  }
  if (!snap.exists) return send(res, 404, { error: 'not_found' });
  const d = snap.data();
  send(res, 200, { code, company: d.company || '', active: d.active === true });
}

/* --- вход в панель ------------------------------------------------------ */
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 32).toString('hex');
}

let lastLegacyImport = 0;
function legacyImport(token) {
  const { store, legacy } = init();
  if (!legacy.enabled || Date.now() - lastLegacyImport < 600000) return;
  lastLegacyImport = Date.now();
  legacy.importAll(store, token)
    .then((n) => { if (n.leads || n.diagnostics || n.groups) console.log('legacy import: added', JSON.stringify(n)); })
    .catch((e) => console.error('legacy import:', e.message));
}

/* Пароль панели: переменная AIRL_ADMIN_TOKEN либо хэш в базе. Если ни того,
   ни другого ещё нет, первый вход сверяется со старой функцией в Firebase:
   подошёл — запоминаем хэш, и пароль остаётся тем же, что был. */
async function guard(req) {
  const { store, legacy } = init();
  const ip = clientIp(req);
  if (count(`adminfail:${ip}`, 900000).length >= 10) throw new HttpError(429, 'Слишком много попыток. Подождите 15 минут.');
  const deny = () => {
    count(`adminfail:${ip}`, 900000).push(Date.now());
    return new HttpError(401, 'Неверный логин или пароль.');
  };
  const login = req.headers['x-airl-login'];
  const token = req.headers['x-airl-token'];
  if (login !== ADMIN_LOGIN || !token) throw deny();

  const fromEnv = process.env.AIRL_ADMIN_TOKEN;
  if (fromEnv) {
    if (!safeEqual(token, fromEnv)) throw deny();
    return token;
  }
  const saved = await store.doc('config/admin').get();
  if (saved.exists) {
    const { salt, hash } = saved.data();
    if (!safeEqual(hashPassword(token, salt), hash)) throw deny();
    return token;
  }
  if (!legacy.enabled) throw new HttpError(503, 'Пароль панели на сервере ещё не задан.');
  const ok = await legacy.checkAdmin(token);
  if (ok === null) throw new HttpError(503, 'Не получилось проверить пароль. Попробуйте ещё раз через минуту.');
  if (!ok) throw deny();
  const salt = crypto.randomBytes(16).toString('hex');
  await store.doc('config/admin').set({ salt, hash: hashPassword(token, salt), set_at: new Date().toISOString(),
    source: 'firebase-first-login' });
  return token;
}

/* --- статистика лидов (stats.html) -------------------------------------- */
const STATS_LIMIT = 3000;
const LEAD_FIELDS = ['created_at', 'company', 'name', 'phone', 'team_size', 'wish', 'source', 'status',
  'group_code', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing'];
const DIAG_FIELDS = ['created_at', 'name', 'company', 'position', 'industry', 'team_size', 'contact',
  'group_code', 'score', 'level', 'segment', 'tier', 'heat', 'priority',
  'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing'];

function pickFields(doc, fields) {
  const d = doc.data(), out = { id: doc.id };
  fields.forEach((f) => { if (d[f] !== undefined && d[f] !== null && d[f] !== '') out[f] = d[f]; });
  return out;
}

async function leadStats(req, res, query) {
  const token = await guard(req);
  const { store } = init();
  const days = Math.max(0, Math.min(3650, parseInt(query.get('days'), 10) || 0));
  const since = days ? new Date(Date.now() - days * DAY).toISOString() : '';
  const recent = (collection) => {
    let q = store.collection(collection).orderBy('created_at', 'desc');
    if (since) q = q.where('created_at', '>=', since);
    return q.limit(STATS_LIMIT).get();
  };
  const [leads, diags] = await Promise.all([recent('leads'), recent('express_diagnostics')]);
  send(res, 200, {
    generated_at: new Date().toISOString(),
    limit: STATS_LIMIT,
    leads: leads.docs.map((d) => pickFields(d, LEAD_FIELDS)),
    diagnostics: diags.docs.map((d) => pickFields(d, DIAG_FIELDS))
  });
  legacyImport(token);   // дотягиваем историю из Firebase в фоне, пока он жив
}

/* --- группы и агенты (admin.html) --------------------------------------- */
async function group(req, res, query) {
  await guard(req);
  const { store, admin, limits, groups } = init();
  if (req.method === 'GET') {
    const code = limits.validateCode(query.get('code'));
    const snap = await store.doc(`groups/${code}`).get();
    if (!snap.exists) return send(res, 200, { exists: false });
    const responses = await store.collection(`groups/${code}/responses`).get();
    const byDept = {};
    responses.docs.forEach((d) => {
      const dep = d.data().department || 'Без отдела';
      byDept[dep] = (byDept[dep] || 0) + 1;
    });
    const portrait = await store.doc(`groups/${code}/artifacts/portrait`).get();
    const lesson = await store.doc(`groups/${code}/artifacts/lesson1`).get();
    return send(res, 200, {
      exists: true,
      group: snap.data(),
      responses_count: responses.size,
      by_department: byDept,
      portrait: portrait.exists ? portrait.data() : null,
      lesson1: lesson.exists ? lesson.data() : null
    });
  }
  const b = await readJson(req, 16 * 1024);
  send(res, 200, await groups.createGroup(store, admin, { company: b.company, prefix: b.prefix }));
}

async function agent(req, res, name) {
  await guard(req);
  const { store, files, limits } = init();
  const b = await readJson(req, 16 * 1024);
  const code = limits.validateCode(b.code);
  // Долгий вызов модели: nginx и браузер ждут ответ до нескольких минут.
  req.setTimeout(0);
  res.setTimeout(0);
  const run = name === 'diagnostics'
    ? require('../functions/agents/diagnostics').runDiagnostics
    : require('../functions/agents/lesson1').runLesson1;
  send(res, 200, await run({ db: store, storage: files, code }));
}

async function closeGroup(req, res) {
  await guard(req);
  const { store, limits } = init();
  const b = await readJson(req, 16 * 1024);
  const code = limits.validateCode(b.code);
  await store.doc(`groups_public/${code}`).update({ active: false });
  await store.doc(`groups/${code}`).update({ active: false, closed_at: new Date() });
  send(res, 200, { code, active: false });
}

/* --- чат-агент диагностики ---------------------------------------------
   Публичный. Всё, что можно проверить без базы и без модели, проверяется
   первым; лимиты (сессия и сутки) тратятся один раз, вместе с записью
   хода разговора, и только когда реплика для сотрудника уже готова. */
async function interview(req, res) {
  limit(req, 'chat', 240, 5000);
  const { store, limits, telegram } = init();
  const { peekLimits, commitTurn } = require('../functions/lib/sessionStore');
  const { runInterviewTurn } = require('../functions/agents/interview');
  const b = await readJson(req, 32 * 1024);

  const code = limits.validateCode(b.code);
  const department = limits.validateDepartment(b.department);
  const sessionId = limits.validateSessionId(b.session_id);
  const isStart = b.start === true;
  const message = isStart ? '' : limits.validateMessage(b.message);

  const pub = await store.doc(`groups_public/${code}`).get();
  if (!pub.exists || pub.data().active !== true) throw new HttpError(400, 'Код группы не найден или больше не активен.');

  const { history } = await peekLimits(store, code, sessionId);

  let turn;
  try {
    turn = await runInterviewTurn({ department, history: limits.sanitizeHistory(history), message, isStart });
  } catch (e) {
    console.error('interview: model call failed', e.status || '', e.message);
    throw new HttpError(400, e.retryable
      ? 'Сейчас сервис перегружен. Попробуйте отправить сообщение ещё раз через минуту.'
      : 'Не получилось получить ответ. Попробуйте отправить сообщение ещё раз.');
  }

  let replyToStore = turn.reply;
  let body;
  if (turn.done) {
    try {
      const data = limits.sanitizeExtractedData(turn.data);
      await store.collection(`groups/${code}/responses`).add({ ...data, department, created_at: new Date().toISOString() });
      await telegram.notifyTelegram('leads', `✅ Анкета заполнена\nКод группы: ${code}\nНаправление: ${department}`);
      body = { reply: turn.reply, done: true, step: 9, suggestions: [] };
    } catch (e) {
      console.error('interview: incomplete data on done, continuing:', e.message);
      replyToStore = 'Кажется, я упустил один момент — давайте уточним ещё немного.';
      body = { reply: replyToStore, done: false, step: Math.min(turn.step, 8), suggestions: [] };
    }
  } else {
    body = { reply: turn.reply, done: false, step: turn.step, suggestions: turn.suggestions };
  }
  await commitTurn(store, code, sessionId, message, replyToStore);
  send(res, 200, body);
}

/* --- маршруты ----------------------------------------------------------- */
function method(req, ...allowed) {
  if (!allowed.includes(req.method)) throw new HttpError(405, `Только ${allowed.join(' или ')}.`);
}

async function route(req, res, pathname) {
  const name = pathname.slice('/api/'.length);
  const query = new URLSearchParams((req.url || '').split('?')[1] || '');
  if (name === 'leads') { method(req, 'POST'); return createLead(req, res); }
  if (name === 'express-diagnostics') { method(req, 'POST'); return createDiagnostics(req, res); }
  if (name === 'online-registrations') { method(req, 'POST'); return createOnlineRegistration(req, res); }
  if (name === 'onlineRegistrations') { method(req, 'GET'); return onlineRegistrations(req, res, query); }
  if (name.startsWith('groups-public/')) { method(req, 'GET'); return groupPublic(req, res, name.split('/')[1]); }
  if (name === 'interview') { method(req, 'POST'); return interview(req, res); }
  if (name === 'leadStats') { method(req, 'GET'); return leadStats(req, res, query); }
  if (name === 'group') { method(req, 'GET', 'POST'); return group(req, res, query); }
  if (name === 'diagnostics' || name === 'lesson1') { method(req, 'POST'); return agent(req, res, name); }
  if (name === 'closeGroup') { method(req, 'POST'); return closeGroup(req, res); }
  if (name.startsWith('files/')) {
    method(req, 'GET', 'HEAD');
    if (!(await init().files.serve(name.split('/')[1], res))) send(res, 404, { error: 'not_found' });
    return;
  }
  send(res, 404, { error: 'not_found' });
}

/* true — запрос обработан здесь; false — это не адрес API. */
async function handle(req, res, pathname) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false;
  if (!ROUTE_RE.test(pathname)) { send(res, 404, { error: 'not_found' }); return true; }
  if (pathname === '/api/health') { send(res, 200, { ok: true, store: !!DATA_DIR }); return true; }
  if (!DATA_DIR) { send(res, 501, { error: 'no_store' }); return true; }
  try { await route(req, res, pathname); }
  catch (e) { fail(res, e); }
  return true;
}

module.exports = { handle };
