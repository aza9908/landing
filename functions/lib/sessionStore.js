"use strict";

/*
  Разговор идёт через публичный эндпойнт без пароля — этот файл единственное,
  что стоит между сайтом и открытым счётом на Anthropic. Два предела: на
  одну сессию (сколько сообщений может отправить один сотрудник за один
  разговор) и на день по всему проекту (аварийный тормоз, если кто-то
  долбит эндпойнт напрямую, в обход интерфейса).

  История разговора хранится здесь же, на сервере, а не берётся из того,
  что прислал браузер: клиент может прислать любую историю, какую захочет,
  и если бы мы ей верили, лимит выше можно было бы обойти, просто не
  присылая старые сообщения. Источник правды один — этот документ.

  peekLimits() только читает — вызывающий код должен провалидировать вход
  и получить настоящий ответ модели ДО того, как что-то спишется со счёта.
  commitTurn() — единственное место, где лимиты действительно тратятся:
  один и тот же счётчик дня и счётчик сессии проверяются и увеличиваются
  в одной транзакции вместе с записью хода разговора, и вызывается только
  когда есть настоящая (пусть даже переформулированная) реплика для показа
  сотруднику. Ошибка на любом шаге до commitTurn — до Anthropic включительно
  — ничего не списывает: неудачная попытка не должна стоить дневного лимита
  всем остальным группам.
*/

const { HISTORY_KEEP } = require("./limits");

const SESSION_MAX_TURNS = 40;
const DAILY_MAX_TURNS = 400;

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function peekLimits(db, code, sessionId) {
  const dailySnap = await db.doc(`usage/interview_${today()}`).get();
  const dailyCount = dailySnap.exists ? dailySnap.data().count || 0 : 0;
  if (dailyCount >= DAILY_MAX_TURNS) {
    throw new Error("Дневной лимит анкет исчерпан. Попробуйте завтра или напишите нам.");
  }

  const sessionSnap = await db.doc(`groups/${code}/chat_sessions/${sessionId}`).get();
  const data = sessionSnap.exists ? sessionSnap.data() : {};
  const turnCount = data.turn_count || 0;
  if (turnCount >= SESSION_MAX_TURNS) {
    throw new Error("Слишком длинный разговор для одной анкеты. Обновите страницу и начните заново.");
  }

  return { history: data.history || [] };
}

async function commitTurn(db, code, sessionId, userText, assistantText) {
  const dailyRef = db.doc(`usage/interview_${today()}`);
  const sessionRef = db.doc(`groups/${code}/chat_sessions/${sessionId}`);

  await db.runTransaction(async (tx) => {
    const dailySnap = await tx.get(dailyRef);
    const dailyCount = dailySnap.exists ? dailySnap.data().count || 0 : 0;
    if (dailyCount >= DAILY_MAX_TURNS) {
      throw new Error("Дневной лимит анкет исчерпан. Попробуйте завтра или напишите нам.");
    }

    const sessionSnap = await tx.get(sessionRef);
    const sData = sessionSnap.exists ? sessionSnap.data() : {};
    const turnCount = (sData.turn_count || 0) + 1;
    if (turnCount > SESSION_MAX_TURNS) {
      throw new Error("Слишком длинный разговор для одной анкеты. Обновите страницу и начните заново.");
    }

    const history = (sData.history || [])
      .concat(userText ? [{ role: "user", text: userText }] : [])
      .concat([{ role: "assistant", text: assistantText }])
      .slice(-HISTORY_KEEP);

    tx.set(dailyRef, { count: dailyCount + 1, date: today() }, { merge: true });
    tx.set(
      sessionRef,
      { history, turn_count: turnCount, updated_at: new Date() },
      { merge: true }
    );
  });
}

module.exports = { peekLimits, commitTurn, SESSION_MAX_TURNS, DAILY_MAX_TURNS };
