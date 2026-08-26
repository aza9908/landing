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
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const { runDiagnostics } = require("./agents/diagnostics");
const { runLesson1 } = require("./agents/lesson1");
const { runInterviewTurn } = require("./agents/interview");
const { createGroup } = require("./lib/groups");
const { notifyTelegram } = require("./lib/telegram");
const {
  validateCode,
  validateSessionId,
  validateDepartment,
  validateMessage,
  sanitizeHistory,
  sanitizeExtractedData
} = require("./lib/limits");
const { peekLimits, commitTurn } = require("./lib/sessionStore");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ADMIN_TOKEN = defineSecret("AIRL_ADMIN_TOKEN");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const CORS = ["https://airl.kz", "https://www.airl.kz", "http://localhost:5173"];
const REGION_BASE = { region: "europe-west1", cors: CORS };

const OPTIONS = {
  ...REGION_BASE,
  timeoutSeconds: 540,
  memory: "1GiB",
  secrets: [ANTHROPIC_API_KEY, ADMIN_TOKEN]
};

// Публичный чат-эндпойнт не получает секрет пароля панели вовсе — ему он
// не нужен, а меньше секретов на функцию значит меньше что теряет, если
// эту функцию когда-нибудь получится скомпрометировать.
const OPTIONS_PUBLIC = {
  ...REGION_BASE,
  timeoutSeconds: 60,
  memory: "512MiB",
  secrets: [ANTHROPIC_API_KEY]
};

// Логин не секретный — весь допуск держится на пароле (секрет
// AIRL_ADMIN_TOKEN). Отдельные логины на каждого сотрудника — уже другая
// задача (хранилище пользователей), сейчас в панели один общий вход.
const ADMIN_LOGIN = "admin";

function guard(req, res) {
  const login = req.get("x-airl-login");
  const token = req.get("x-airl-token");
  if (login !== ADMIN_LOGIN || !token || token !== ADMIN_TOKEN.value()) {
    res.status(401).json({ error: "Неверный логин или пароль." });
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
      const code = validateCode(req.query.code);
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

    const result = await createGroup(db, admin, {
      company: req.body && req.body.company,
      prefix: req.body && req.body.prefix
    });
    res.json(result);
  } catch (e) {
    fail(res, e);
  }
});

/* --- агент 1 ---------------------------------------------------------- */

exports.diagnostics = onRequest(OPTIONS, async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const code = validateCode(req.body && req.body.code);
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
    const code = validateCode(req.body && req.body.code);
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
    const code = validateCode(req.body && req.body.code);
    await db.doc(`groups_public/${code}`).update({ active: false });
    await db.doc(`groups/${code}`).update({ active: false, closed_at: new Date() });
    res.json({ code, active: false });
  } catch (e) {
    fail(res, e);
  }
});

/* --- чат-агент диагностики ------------------------------------------
   Публичный, без x-airl-token: с ним говорят сотрудники компании, а не
   владелец панели. Порядок шагов важен: всё, что можно проверить без
   похода в Firestore или Anthropic, проверяется первым — иначе кто
   угодно с невалидным запросом мог бы бесплатно списывать общий дневной
   лимит и блокировать чат для всех остальных групп. Лимиты (сессия и
   сутки) читаются один раз для быстрого отказа и по-настоящему тратятся
   только один раз, вместе с записью хода разговора, — целой транзакцией
   в commitTurn(), и только если реплика для сотрудника уже готова.
   Firestore Admin SDK, а не клиент, пишет и в chat_sessions, и в
   responses — прямой записи из браузера в проекте больше нет нигде.
------------------------------------------------------------------------ */

exports.interview = onRequest(OPTIONS_PUBLIC, async (req, res) => {
  try {
    if (req.method !== "POST") throw new Error("Только POST.");

    const code = validateCode(req.body && req.body.code);
    const department = validateDepartment(req.body && req.body.department);
    const sessionId = validateSessionId(req.body && req.body.session_id);
    const isStart = req.body && req.body.start === true;
    const message = isStart ? "" : validateMessage(req.body && req.body.message);

    const groupPublicSnap = await db.doc(`groups_public/${code}`).get();
    if (!groupPublicSnap.exists || groupPublicSnap.data().active !== true) {
      throw new Error("Код группы не найден или больше не активен.");
    }

    // Только чтение: быстрый отказ, если лимиты уже исчерпаны, до того как
    // разговор дойдёт до платного вызова модели.
    const { history } = await peekLimits(db, code, sessionId);

    let turn;
    try {
      turn = await runInterviewTurn({
        department,
        history: sanitizeHistory(history),
        message,
        isStart
      });
    } catch (e) {
      // Сюда попадают только сбои самого вызова модели (сеть, лимит запросов
      // у ключа, временная неполадка Anthropic) — сотруднику не нужно видеть
      // сырой ответ API, это ни о чём ему не скажет. Настоящую причину
      // логируем отдельно, чтобы её было видно в логах функции.
      console.error("interview: model call failed", e.status || "", e.message);
      const friendly = e.retryable
        ? "Сейчас сервис перегружен. Попробуйте отправить сообщение ещё раз через минуту."
        : "Не получилось получить ответ. Попробуйте отправить сообщение ещё раз.";
      return fail(res, new Error(friendly));
    }

    let replyToStore = turn.reply;
    let responseBody;

    if (turn.done) {
      try {
        const data = sanitizeExtractedData(turn.data);
        await db.collection(`groups/${code}/responses`).add({
          ...data,
          department,
          created_at: new Date().toISOString()
        });
        // Без имени и должности сотрудника — только код группы и
        // направление, этого достаточно, чтобы понять, что анкета
        // закрыта, не раскрывая, кто именно её заполнил.
        await notifyTelegram(`✅ Анкета заполнена\nКод группы: ${code}\nНаправление: ${department}`);
        responseBody = { reply: turn.reply, done: true, step: 9 };
      } catch (e) {
        // Модель посчитала разговор законченным, но данные неполные —
        // логируем настоящую причину (это может быть и реальный баг, не
        // только "модель поторопилась") и просто продолжаем разговор
        // вместо ошибки. В историю уходит именно то, что увидел
        // сотрудник, а не прощание модели, которое мы не показали.
        console.error("interview: incomplete data on done, continuing:", e.message);
        replyToStore = "Кажется, я упустил один момент — давайте уточним ещё немного.";
        // Модель считала, что дошла до конца (step обычно 9), но раз
        // разговор в итоге продолжается — не показываем сотруднику
        // прогресс-бар на 100% и «Последний вопрос», это неправда.
        responseBody = { reply: replyToStore, done: false, step: Math.min(turn.step, 8) };
      }
    } else {
      responseBody = { reply: turn.reply, done: false, step: turn.step };
    }

    // Единственное место, где лимиты реально тратятся — только теперь,
    // когда есть настоящая реплика для сотрудника.
    await commitTurn(db, code, sessionId, message, replyToStore);
    res.json(responseBody);
  } catch (e) {
    fail(res, e);
  }
});

/* --- автосоздание группы по заявке с лендинга ------------------------
   Срабатывает на саму запись в Firestore (leads/{leadId}), а не через
   отдельный публичный HTTP-эндпойнт — значит, ничего лишнего в интернет
   не открываем, вся защита та же, что уже есть у формы заявки: правила
   Firestore проверяют форму документа при создании. Код выдаётся сразу,
   без звонка — раньше это был осознанный шаг ручной квалификации клиента,
   теперь его нет: код может получить кто угодно, кто оставил заявку.
   Расход ограничен тем же общим дневным лимитом /interview.
------------------------------------------------------------------------ */

exports.onLeadCreated = onDocumentCreated(
  { document: "leads/{leadId}", region: "europe-west1" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const lead = snap.data();

    try {
      const group = await createGroup(db, admin, { company: lead.company });
      await snap.ref.update({ status: "code_issued", group_code: group.code });
      await notifyTelegram(
        `🆕 Заявка → код выдан автоматически\n` +
        `Компания: ${group.company}\nИмя: ${lead.name || "—"}\nТелефон: ${lead.phone || "—"}\n` +
        `Код: ${group.code}\n\nГотовое сообщение для WhatsApp:\n${group.whatsapp_message}`
      );
    } catch (e) {
      console.error("onLeadCreated: failed to auto-issue a code:", e.message);
    }
  }
);
