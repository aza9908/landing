"use strict";

/*
  Два агента AIRL как HTTP-функции рядом с лендингом.

  POST /api/group        создать код группы после созвона
  POST /api/diagnostics  агент 1 — портрет боли из ответов
  POST /api/lesson1      агент 2 — презентация первого урока
  GET  /api/group        состояние группы: сколько ответов, что уже собрано

  Все четыре требуют заголовок x-airl-token. Форма заявки и анкета
  сотрудников пишут в Firestore напрямую и токена не требуют.
*/

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const { runDiagnostics } = require("./agents/diagnostics");
const { runLesson1 } = require("./agents/lesson1");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ADMIN_TOKEN = defineSecret("AIRL_ADMIN_TOKEN");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const OPTIONS = {
  region: "europe-west1",
  timeoutSeconds: 540,
  memory: "1GiB",
  secrets: [ANTHROPIC_API_KEY, ADMIN_TOKEN],
  cors: ["https://airl.kz", "https://www.airl.kz", "http://localhost:5173"]
};

function guard(req, res) {
  const token = req.get("x-airl-token");
  if (!token || token !== ADMIN_TOKEN.value()) {
    res.status(401).json({ error: "Нужен заголовок x-airl-token. Проверьте пароль панели." });
    return false;
  }
  return true;
}

function fail(res, e) {
  console.error(e);
  res.status(400).json({ error: e.message || String(e) });
}

/* --- создание кода группы ------------------------------------------- */

exports.group = onRequest(OPTIONS, async (req, res) => {
  if (!guard(req, res)) return;

  try {
    if (req.method === "GET") {
      const code = String(req.query.code || "").toUpperCase();
      const snap = await db.doc(`groups/${code}`).get();
      if (!snap.exists) return res.json({ exists: false });

      const responses = await db.collection(`groups/${code}/responses`).get();
      const byDept = {};
      responses.docs.forEach((d) => {
        const dep = d.data().department || "Без отдела";
        byDept[dep] = (byDept[dep] || 0) + 1;
      });

      const portrait = await db.doc(`groups/${code}/artifacts/portrait`).get();
      const lesson = await db.doc(`groups/${code}/artifacts/lesson1`).get();

      return res.json({
        exists: true,
        group: snap.data(),
        responses_count: responses.size,
        by_department: byDept,
        portrait: portrait.exists ? portrait.data() : null,
        lesson1: lesson.exists ? lesson.data() : null
      });
    }

    const company = String((req.body && req.body.company) || "").trim();
    const prefix = String((req.body && req.body.prefix) || "AIRL")
      .toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "AIRL";
    if (company.length < 2) throw new Error("Укажите название компании.");

    let code = "";
    for (let i = 0; i < 10; i++) {
      const candidate = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
      const exists = await db.doc(`groups_public/${candidate}`).get();
      if (!exists.exists) { code = candidate; break; }
    }
    if (!code) throw new Error("Не получилось подобрать свободный код, попробуйте ещё раз.");

    const expires = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    await db.doc(`groups/${code}`).set({
      company, code, active: true, responses_count: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(), expires_at: expires
    });
    // Витрина: браузеру видно только название и признак активности.
    await db.doc(`groups_public/${code}`).set({ company, active: true });

    const link = `https://airl.kz/diagnostics.html?code=${code}`;
    res.json({
      code, company, link, expires_at: expires.toISOString().slice(0, 10),
      whatsapp_message:
        `Здравствуйте! Перед воркшопом просим каждого сотрудника заполнить ` +
        `короткую анкету — 7 минут.\n\n${link}\n\nКод группы: ${code}`
    });
  } catch (e) {
    fail(res, e);
  }
});

/* --- агент 1 ---------------------------------------------------------- */

exports.diagnostics = onRequest(OPTIONS, async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const code = String((req.body && req.body.code) || "").toUpperCase();
    if (!code) throw new Error("Укажите код группы.");
    const artifact = await runDiagnostics({ db, storage: bucket, code });
    res.json(artifact);
  } catch (e) {
    fail(res, e);
  }
});

/* --- агент 2 ---------------------------------------------------------- */

exports.lesson1 = onRequest(OPTIONS, async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const code = String((req.body && req.body.code) || "").toUpperCase();
    if (!code) throw new Error("Укажите код группы.");
    const artifact = await runLesson1({ db, storage: bucket, code });
    res.json(artifact);
  } catch (e) {
    fail(res, e);
  }
});

/* --- закрыть приём ответов ------------------------------------------- */

exports.closeGroup = onRequest(OPTIONS, async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const code = String((req.body && req.body.code) || "").toUpperCase();
    await db.doc(`groups_public/${code}`).update({ active: false });
    await db.doc(`groups/${code}`).update({ active: false, closed_at: new Date() });
    res.json({ code, active: false });
  } catch (e) {
    fail(res, e);
  }
});
