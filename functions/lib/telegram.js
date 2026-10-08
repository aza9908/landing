"use strict";

/*
  Уведомление в тот же Telegram-канал, что уже используется для заявок
  с лендинга (firebase-bridge.js, AIRL_TELEGRAM) — токен там намеренно
  публичный (видим в браузере), так что переиспользовать его здесь не
  добавляет нового риска. Если Telegram недоступен — молча пропускаем,
  сотруднику это никак не должно помешать закончить анкету.
*/

const BOT_TOKEN = "8793362793:AAFPq56gfITGyBDn9IZCcWB-MDxnOEaYSls";
// Числовой номер канала «Задачи AIRL»: работает и после перевода канала
// в частный, когда имя @AIRLtasks пропадёт.
const CHAT_ID = "-1004450740658";

// opts.html — текст размечен HTML (ссылки); всё, что пришло от посетителя,
// вызывающий обязан пропустить через escapeHtml.
async function notifyTelegram(text, opts = {}) {
  const body = { chat_id: CHAT_ID, text };
  if (opts.html) {
    body.parse_mode = "HTML";
    body.disable_web_page_preview = true;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error("telegram notify failed:", e.message);
  }
}

function escapeHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = { notifyTelegram, escapeHtml };
