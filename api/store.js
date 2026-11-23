'use strict';
/*
  Хранилище документов на одном файле SQLite (node:sqlite встроен в Node 22).

  Повторяет ту малую часть Firestore Admin SDK, которой пользуются агенты и
  обработчики: doc().get/set/update/delete, collection().add/get/where/
  orderBy/limit и runTransaction. Поэтому код агентов (functions/agents,
  functions/lib) работает здесь без переписывания.

  Документ — JSON. Даты при записи превращаются в строки ISO.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function newId() {
  return crypto.randomBytes(15).toString('base64url');
}

function split(p) {
  const parts = String(p).split('/').filter(Boolean);
  return { parent: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] || '', depth: parts.length };
}

function open(dir) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dir, { recursive: true });
  const sql = new DatabaseSync(path.join(dir, 'airl.sqlite'));
  sql.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS docs (
      path TEXT PRIMARY KEY,
      parent TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS docs_parent ON docs(parent);
  `);
  const qGet = sql.prepare('SELECT data FROM docs WHERE path = ?');
  const qPut = sql.prepare(`INSERT INTO docs (path, parent, id, data, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const qDel = sql.prepare('DELETE FROM docs WHERE path = ?');
  const qList = sql.prepare('SELECT id, data FROM docs WHERE parent = ? ORDER BY id');

  function read(p) {
    const row = qGet.get(p);
    return row ? JSON.parse(row.data) : undefined;
  }
  function write(p, data) {
    const { parent, id } = split(p);
    qPut.run(p, parent, id, JSON.stringify(data), new Date().toISOString());
  }
  function snapshot(ref, data) {
    return { exists: data !== undefined, id: ref.id, ref, data: () => (data === undefined ? undefined : data) };
  }

  function doc(p) {
    const clean = String(p).split('/').filter(Boolean).join('/');
    const { id, depth } = split(clean);
    if (!id || depth % 2 !== 0) throw new Error(`not a document path: ${p}`);
    const ref = {
      id,
      path: clean,
      async get() { return snapshot(ref, read(clean)); },
      async set(data, opts) {
        const merged = opts && opts.merge ? { ...(read(clean) || {}), ...data } : data;
        write(clean, merged);
      },
      async update(data) {
        const cur = read(clean);
        if (cur === undefined) throw new Error(`Документ ${clean} не найден.`);
        write(clean, { ...cur, ...data });
      },
      async delete() { qDel.run(clean); }
    };
    return ref;
  }

  const OPS = {
    '==': (a, b) => a === b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
    '>': (a, b) => a > b,
    '<': (a, b) => a < b
  };

  function query(parent, filters, order, max) {
    const q = {
      where(field, op, value) {
        if (!OPS[op]) throw new Error(`unsupported operator: ${op}`);
        return query(parent, filters.concat([{ field, op, value }]), order, max);
      },
      orderBy(field, dir) { return query(parent, filters, { field, desc: dir === 'desc' }, max); },
      limit(n) { return query(parent, filters, order, n); },
      async get() {
        let rows = qList.all(parent).map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
        for (const f of filters) {
          rows = rows.filter((r) => r.data[f.field] !== undefined && r.data[f.field] !== null &&
            OPS[f.op](r.data[f.field], f.value));
        }
        if (order) {
          // как в Firestore: документ без поля сортировки в выборку не попадает
          rows = rows.filter((r) => r.data[order.field] !== undefined && r.data[order.field] !== null);
          rows.sort((a, b) => {
            const x = a.data[order.field], y = b.data[order.field];
            return (x < y ? -1 : x > y ? 1 : 0) * (order.desc ? -1 : 1);
          });
        }
        if (max !== undefined) rows = rows.slice(0, max);
        const docs = rows.map((r) => snapshot(doc(`${parent}/${r.id}`), r.data));
        return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
      }
    };
    return q;
  }

  function collection(p) {
    const clean = String(p).split('/').filter(Boolean).join('/');
    if (!clean || clean.split('/').length % 2 !== 1) throw new Error(`not a collection path: ${p}`);
    return {
      ...query(clean, [], null, undefined),
      doc: (id) => doc(`${clean}/${id || newId()}`),
      async add(data) {
        const ref = doc(`${clean}/${newId()}`);
        await ref.set(data);
        return ref;
      }
    };
  }

  // Транзакции идут строго по одной: вторая ждёт, пока закончится первая.
  let queue = Promise.resolve();
  function runTransaction(fn) {
    const run = async () => {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => { writes.push(() => ref.set(data, opts)); },
        update: (ref, data) => { writes.push(() => ref.update(data)); },
        delete: (ref) => { writes.push(() => ref.delete()); }
      };
      const result = await fn(tx);
      sql.exec('BEGIN IMMEDIATE');
      try {
        for (const w of writes) await w();
        sql.exec('COMMIT');
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
      return result;
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  }

  // Согласованная копия базы в один файл (для ночного бэкапа).
  function backupTo(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.unlinkSync(file);
    sql.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`);
  }

  function count(parent) {
    return sql.prepare('SELECT COUNT(*) AS n FROM docs WHERE parent = ?').get(parent).n;
  }

  return { doc, collection, runTransaction, backupTo, count, close: () => sql.close() };
}

module.exports = { open, newId };
