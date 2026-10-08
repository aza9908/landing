"use strict";

/*
  Создание группы: генерация свободного кода и запись документов
  groups/{code} + groups_public/{code}. Общая логика для ручного
  создания из панели (guard()-защищённый POST /group) и для
  автоматического создания по заявке с лендинга (Firestore-триггер
  onLeadCreated) — обе дороги должны давать один и тот же результат.
*/

async function createGroup(db, admin, { company, prefix }) {
  const cleanCompany = String(company || "").trim();
  if (cleanCompany.length < 2) throw new Error("Укажите название компании.");

  const cleanPrefix =
    String(prefix || "AIRL").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "AIRL";

  let code = "";
  for (let i = 0; i < 10; i++) {
    const candidate = `${cleanPrefix}${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = await db.doc(`groups_public/${candidate}`).get();
    if (!exists.exists) { code = candidate; break; }
  }
  if (!code) throw new Error("Не получилось подобрать свободный код, попробуйте ещё раз.");

  const expires = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  await db.doc(`groups/${code}`).set({
    company: cleanCompany, code, active: true, responses_count: 0,
    created_at: admin.firestore.FieldValue.serverTimestamp(), expires_at: expires
  });
  // Витрина: браузеру видно только название и признак активности.
  await db.doc(`groups_public/${code}`).set({ company: cleanCompany, active: true });

  // Без «.html»: сервер редиректит /diagnostics.html → /diagnostics и теряет ?code=.
  const link = `https://airl.kz/diagnostics?code=${code}`;
  return {
    code,
    company: cleanCompany,
    link,
    expires_at: expires.toISOString().slice(0, 10),
    whatsapp_message:
      `Здравствуйте! Пройдите, пожалуйста, экспресс-диагностику AI-зрелости ` +
      `вашей компании: 8 вопросов, около 5 минут. По итогам пришлём разбор ` +
      `с уровнем AI-зрелости, главными болями и первыми шагами.\n\n${link}\n\nКод группы: ${code}`
  };
}

module.exports = { createGroup };
