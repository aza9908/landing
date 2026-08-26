"use strict";

/*
  Уведомление в тот же Telegram-канал, что уже используется для заявок
  с лендинга (firebase-bridge.js, AIRL_TELEGRAM) — токен там намеренно
  публичный (видим в браузере), так что переиспользовать его здесь не
  добавляет нового риска. Если Telegram недоступен — молча пропускаем,
  сотруднику это никак не должно помешать закончить анкету.
*/

const BOT_TOKEN = "8793362793:AAFPq56gfITGyBDn9IZCcWB-MDxnOEaYSls";
const CHAT_ID = "@AIRLtasks";

async function notifyTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
  } catch (e) {
    console.error("telegram notify failed:", e.message);
  }
}

module.exports = { notifyTelegram };
