'use strict';
/*
  Мост к прежнему бэкенду в Firebase — только на время переезда.

  Пока Firebase не отключён, сервер умеет:
  - найти в старой базе код группы, выданный до переезда (витрина
    groups_public открыта на чтение всем, ключ ниже — публичный web-ключ
    из firebase-bridge.js, не секрет);
  - проверить пароль панели по старой функции leadStats при первом входе,
    чтобы пароль остался прежним и его не пришлось никому пересылать;
  - перенести историю заявок, диагностик и групп через те же функции.

  После отключения Firebase файл и его вызовы в index.js удаляются;
  выключить заранее: AIRL_LEGACY_FIREBASE=0.
*/
const PROJECT = 'landing-page-8e314';
const WEB_KEY = 'AIzaSyDNSjN6mF5R5tVqrVtXeuOu3q6UtUdS39o';
const FUNCTIONS = `https://europe-west1-${PROJECT}.cloudfunctions.net`;
const ADMIN_LOGIN = 'admin';

const enabled = process.env.AIRL_LEGACY_FIREBASE !== '0';

function headers(token) {
  return { 'x-airl-login': ADMIN_LOGIN, 'x-airl-token': token };
}

async function get(url, opts) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
}

// {company, active} или null, если такого кода в старой базе нет.
async function groupPublic(code) {
  const res = await get(`https://firestore.googleapis.com/v1/projects/${PROJECT}` +
    `/databases/(default)/documents/groups_public/${encodeURIComponent(code)}?key=${WEB_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`legacy groups_public ${res.status}`);
  const f = (await res.json()).fields || {};
  return {
    company: (f.company && f.company.stringValue) || '',
    active: !!(f.active && f.active.booleanValue)
  };
}

// true — пароль верный, false — неверный, null — проверить не удалось.
async function checkAdmin(token) {
  try {
    const res = await get(`${FUNCTIONS}/leadStats?days=1`, { headers: headers(token) });
    if (res.status === 200) return true;
    if (res.status === 401) return false;
    return null;
  } catch (e) {
    return null;
  }
}

// Firestore отдаёт время как {_seconds, _nanoseconds} — приводим к строке ISO.
function plain(v) {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
    const out = {};
    for (const k of Object.keys(v)) out[k] = plain(v[k]);
    return out;
  }
  return v;
}

const CODE_RE = /^[A-Z]{1,6}[0-9]{3,6}$/;

/* Переносит то, что отдают старые функции. Уже перенесённое не трогает,
   поэтому запускать можно сколько угодно раз. */
async function importAll(store, token) {
  const out = { leads: 0, diagnostics: 0, groups: 0 };
  const res = await get(`${FUNCTIONS}/leadStats?days=0`, { headers: headers(token) });
  if (!res.ok) throw new Error(`legacy leadStats ${res.status}`);
  const data = await res.json();

  const codes = new Set();
  const copy = async (rows, collection, key) => {
    for (const row of rows || []) {
      if (!row || !row.id || !/^[A-Za-z0-9_-]{1,64}$/.test(row.id)) continue;
      if (CODE_RE.test(row.group_code || '')) codes.add(row.group_code);
      const ref = store.doc(`${collection}/${row.id}`);
      if ((await ref.get()).exists) continue;
      const { id, ...fields } = row;
      await ref.set({ ...plain(fields), imported_from: 'firebase' });
      out[key]++;
    }
  };
  await copy(data.leads, 'leads', 'leads');
  await copy(data.diagnostics, 'express_diagnostics', 'diagnostics');

  for (const code of codes) {
    const ref = store.doc(`groups/${code}`);
    const have = await ref.get();
    // Пропускаем группы, созданные уже здесь, и те, что перенесены полностью.
    // Группу, подтянутую только по витрине (название и активность), дополняем.
    if (have.exists && (have.data().imported_from !== 'firebase' || have.data().legacy_full)) continue;
    try {
      const r = await get(`${FUNCTIONS}/group?code=${code}`, { headers: headers(token) });
      if (!r.ok) continue;
      const g = await r.json();
      if (!g.exists || !g.group) continue;
      const group = plain(g.group);
      await ref.set({ ...group, code, legacy_responses_count: g.responses_count || 0, imported_from: 'firebase',
        legacy_full: true });
      await store.doc(`groups_public/${code}`).set({ company: group.company || '', active: group.active === true });
      if (g.portrait) await store.doc(`groups/${code}/artifacts/portrait`).set(plain(g.portrait));
      if (g.lesson1) await store.doc(`groups/${code}/artifacts/lesson1`).set(plain(g.lesson1));
      out.groups++;
    } catch (e) {
      console.error('legacy import: group', code, e.message);
    }
  }

  await store.doc('config/legacy_import').set({ last_at: new Date().toISOString(), last_added: out });
  return out;
}

module.exports = { enabled, groupPublic, checkAdmin, importAll };
