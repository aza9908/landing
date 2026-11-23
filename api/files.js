'use strict';
/*
  Файлы агентов (Excel «Портрет боли», презентация урока) — замена Firebase
  Storage. Файл лежит в папке данных под случайным именем; ссылка содержит
  этот случайный ключ и действует ограниченное время, как подписанная ссылка.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function open(dir, store, origin) {
  const root = path.join(dir, 'files');
  fs.mkdirSync(root, { recursive: true });

  function file(name) {
    let token = '';
    return {
      async save(body, opts = {}) {
        token = crypto.randomBytes(24).toString('hex');
        fs.writeFileSync(path.join(root, token), body);
        await store.doc(`files/${token}`).set({
          name,
          content_type: opts.contentType || 'application/octet-stream',
          size: body.length,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
        });
      },
      async getSignedUrl(opts = {}) {
        if (!token) throw new Error('file is not saved yet');
        if (opts.expires) {
          await store.doc(`files/${token}`).update({ expires_at: new Date(opts.expires).toISOString() });
        }
        const base = name.split('/').pop();
        return [`${origin}/api/files/${token}/${encodeURIComponent(base)}`];
      }
    };
  }

  // Отдаёт файл по ключу из ссылки. false — ключа нет или срок вышел.
  async function serve(token, res) {
    if (!/^[0-9a-f]{48}$/.test(token)) return false;
    const snap = await store.doc(`files/${token}`).get();
    if (!snap.exists) return false;
    const meta = snap.data();
    const full = path.join(root, token);
    if (meta.expires_at < new Date().toISOString() || !fs.existsSync(full)) return false;
    const base = String(meta.name).split('/').pop();
    res.writeHead(200, {
      'Content-Type': meta.content_type,
      'Content-Length': fs.statSync(full).size,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(base)}`,
      'Cache-Control': 'private, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      // Презентация — HTML, собранный моделью: открываем её в изолированном
      // окружении, без доступа к cookie и страницам airl.kz.
      'Content-Security-Policy': 'sandbox allow-scripts allow-popups'
    });
    fs.createReadStream(full).pipe(res);
    return true;
  }

  // Удаляет файлы с истёкшим сроком.
  async function sweep() {
    const now = new Date().toISOString();
    const all = await store.collection('files').get();
    for (const d of all.docs) {
      if (d.data().expires_at < now) {
        try { fs.unlinkSync(path.join(root, d.id)); } catch (e) { /* уже нет */ }
        await d.ref.delete();
      }
    }
  }

  return { file, serve, sweep };
}

module.exports = { open };
