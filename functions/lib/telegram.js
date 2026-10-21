"use strict";

/*
  Два канала, строго раздельно:
  - LEADS — «AIRL-diagnostics» (t.me/airldiagnostics9089086): всё, что
    касается заявок с airl.kz (заявка → код группы). Тот же бот и канал,
    что и в firebase-bridge.js (AIRL_TELEGRAM_AGENT), — токен там
    намеренно публичный, так что переиспользовать его здесь не добавляет
    нового риска.
  - TASKS — внутренний «Задачи AIRL» (@AIRLtasks): только служебное
    (анкета сотрудника заполнена). Заявки сюда не отправляются.
  Если Telegram недоступен — молча пропускаем, сотруднику это никак не
  должно помешать закончить анкету.
*/

const CHANNELS = {
  leads: {
    botToken: "8711954523:AAEvCtEQ91TUizGNwSc00gNkuHPyXbjMC8s", // @airl9499_bot
    chatId: "-1004358402425"                                     // «AIRL-diagnostics»
  },
  tasks: {
    botToken: "8793362793:AAFPq56gfITGyBDn9IZCcWB-MDxnOEaYSls",
    // Числовой номер канала «Задачи AIRL»: работает и после перевода канала
    // в частный, когда имя @AIRLtasks пропадёт.
    chatId: "-1004450740658"
  }
};

// channel — "leads" или "tasks", без значения по умолчанию: каждый вызов
// обязан явно сказать, куда идёт сообщение.
// opts.html — текст размечен HTML (ссылки); всё, что пришло от посетителя,
// вызывающий обязан пропустить через escapeHtml.
async function notifyTelegram(channel, text, opts = {}) {
  const ch = CHANNELS[channel];
  if (!ch) throw new Error(`unknown telegram channel: ${channel}`);
  const body = { chat_id: ch.chatId, text };
  if (opts.html) {
    body.parse_mode = "HTML";
    body.disable_web_page_preview = true;
  }
  try {
    await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
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
