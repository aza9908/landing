"use strict";

/*
  Агент 1 — Diagnostics AI.

  Вход:  код группы.
  Берёт ответы сотрудников из groups/{code}/responses, приводит свободный текст
  к строкам реестра процессов, считает трудозатраты и приоритет, собирает Excel
  и пет-проекты под отделы.

  Выход: groups/{code}/artifacts/portrait  +  файл в Storage.
*/

const { askJson } = require("../lib/anthropic");
const { buildRegistry } = require("../lib/xlsx");
const { DEPARTMENTS } = require("../lib/limits");

const DEPARTMENTS_LIST = DEPARTMENTS.map((d) => `"${d}"`).join(", ");

const SYSTEM = `
Ты аналитик AI Research Lab. Ты разбираешь ответы сотрудников компании и
превращаешь их в реестр процессов для AI-пилота.

ПРАВИЛА РАЗБОРА

Одна строка реестра — один процесс с понятным началом и концом, который
повторяется. «Много рутины» — не процесс. «Сбор еженедельного управленческого
отчёта» — процесс. Один ответ сотрудника может дать три-четыре строки: разделяй
по смене результата.

Одинаковые процессы от разных людей одного отдела — одна строка. Участников
складывай, время бери медианное, в comment пиши «описали N сотрудников».
Разные отделы с похожей задачей — разные строки.

НАПРАВЛЕНИЯ

Поле team — ровно одно из четырёх: ${DEPARTMENTS_LIST}.
Не выдумывай других направлений. Бери направление из ответа сотрудника (поле
«Отдел» уже приходит в одном из этих четырёх значений) — просто копируй его,
не переименовывай и не переводи.

Формулировки бери словами клиента. Сотрудник должен узнать свою работу в строке.
Никакого «оптимизация коммуникационных потоков» — пиши «Пересылка заявок
из WhatsApp в таблицу».

Колонка problem — самая читаемая в файле. Туда идёт живая жалоба сотрудника,
а не пересказ процесса.

ЦИФРЫ

Если частота и время указаны — бери как есть. Если нет — оцени и обязательно
пометь в comment: «оценка со слов, уточнить». Ориентиры для runs_per_month:
постоянно 100, каждый день 22, пару раз в неделю 8, раз в неделю 4, раз в месяц 1.
Время цикла без указания: 30 минут для мелких операций, 60–180 для сборки
документов и отчётов.

Никогда не подгоняй цифры так, чтобы процесс попал в приоритет. Приоритет
считает таблица, и он должен считаться по правде.

ОЦЕНКИ 1–5

repeatability: 5 если делается одинаково каждый раз, 1 если каждый случай уникален.
risk: 5 если ошибка уходит клиенту или в деньги, 1 если заметна сразу внутри.
impact: 5 если процесс на пути к деньгам, 1 если чисто внутренний.
digital: 5 если всё в системах и выгружается, 1 если бумага и голос.
standard: 5 если есть регламент или шаблон, 1 если каждый делает по-своему.
difficulty: 5 если нужна интеграция с 1С и права доступа, 1 если хватает выгрузки.

time_saving — доля от 0 до 1, а не часы. Больше 0.7 не ставь почти никогда:
остаётся проверка человеком.

confidentiality — «Низкая», «Средняя» или «Высокая». Персональные данные,
зарплаты, договоры, медицина — всегда «Высокая».

ПЕТ-ПРОЕКТЫ

По три на отдел. Каждый должен собираться за 4 академических часа на воркшопе.
Не помещается — режь до одного экрана. Никаких интеграций с боевыми системами:
работаем на выгрузках, копиях, скриншотах. Конфиденциальные данные — проект
строится на обезличенном примере, и это пишется в карточке прямо.

ЧЕГО НЕ ДЕЛАТЬ

Не выдумывай процессы, которых нет в ответах. Мало данных — так и напиши
в data_gaps. Не обещай экономию в деньгах, считаем часы. Не превращай боль
в готовое решение: задача — диагноз. ФИО нигде не используй, только отдел и роль.

ФОРМАТ ОТВЕТА

Верни только JSON, без пояснений и markdown-обёрток:

{
  "company": "",
  "summary": {
    "top_pains": ["боль словами клиента — отдел — сколько часов в месяц", "", ""],
    "tools_in_use": "",
    "fears": "что звучало про конфиденциальность, страх замены, прошлый опыт",
    "group_level": "новички / есть опытные / смешанная — и что это значит для урока 1",
    "risks": "что может сорвать воркшоп",
    "data_gaps": "чего не хватает в ответах"
  },
  "processes": [{
    "team": "", "owners": "", "process": "", "result": "", "receiver": "",
    "steps": "вход → выход", "frequency": "Несколько раз в день|Ежедневно|Еженедельно|Ежемесячно|Ежеквартально|По событию|Реже",
    "runs_per_month": 0, "minutes": 0, "people": 1,
    "tools": "", "manual_share": 0.9, "problem": "",
    "repeatability": 5, "risk": 4, "impact": 5, "digital": 4, "standard": 5,
    "ai_idea": "", "time_saving": 0.5, "difficulty": 2,
    "confidentiality": "Средняя", "mvp_goal": "", "owner": "",
    "status": "На оценке", "comment": ""
  }],
  "pet_projects": [{
    "team": "", "title": "", "pain": "", "does": "",
    "artifact": "что участник соберёт за 4 часа", "data": "что принести с собой",
    "difficulty": 2
  }]
}
`.trim();

/* Ответы приходят как есть из формы. ФИО отбрасываем прямо здесь. */
function packResponses(responses) {
  return responses
    .map((r, i) => {
      const timing = (r.timing || [])
        .map(
          (t) =>
            `    • ${t.task} — ${t.frequency}, ${t.runs_per_month || "?"} раз/мес, ` +
            `${t.minutes || "?"} мин, участников ${t.people || 1}`
        )
        .join("\n");
      return [
        `Сотрудник ${i + 1}`,
        `  Отдел: ${r.department || "не указан"}`,
        `  Должность: ${r.role || "не указана"}`,
        `  Задачи:\n${timing || "    (тайминг не заполнен)"}`,
        `  Что мешает: ${r.pain || "—"}`,
        `  Инструменты: ${r.tools || "—"}`,
        `  Доля ручной работы: ${Math.round((r.manual_share || 0) * 100)}%`,
        `  Что поручил бы помощнику: ${r.wish || "—"}`,
        `  Конфиденциальные данные: ${r.confidential ? "да" : "нет"}`
      ].join("\n");
    })
    .join("\n\n");
}

async function runDiagnostics({ db, storage, code }) {
  const groupRef = db.doc(`groups/${code}`);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) throw new Error(`Группы ${code} нет.`);
  const group = groupSnap.data();

  const snap = await db.collection(`groups/${code}/responses`).get();
  const responses = snap.docs.map((d) => d.data());
  if (!responses.length) throw new Error("По этой группе ещё нет ни одного ответа.");

  // Заявка руководителя — в ней часто главная боль.
  let leadWish = "";
  const leads = await db
    .collection("leads")
    .where("company", "==", group.company)
    .limit(1)
    .get();
  if (!leads.empty) leadWish = leads.docs[0].data().wish || "";

  const prompt = [
    `Компания: ${group.company}`,
    `Код группы: ${code}`,
    leadWish ? `Что хочет изменить руководитель: ${leadWish}` : "",
    "",
    `Ответов собрано: ${responses.length}`,
    "",
    packResponses(responses)
  ]
    .filter(Boolean)
    .join("\n");

  const result = await askJson({ system: SYSTEM, prompt, maxTokens: 16000 });
  result.company = result.company || group.company;
  result.code = code;
  result.date = new Date().toISOString().slice(0, 10);

  // Excel собирается кодом по фиксированным формулам, а не моделью:
  // приоритет должен считаться одинаково всегда.
  const buffer = await buildRegistry(result);
  const file = storage.file(`portraits/${code}/Портрет_боли_${code}.xlsx`);
  await file.save(buffer, {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    metadata: { cacheControl: "private, max-age=0" }
  });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000
  });

  const hours = result.processes.reduce(
    (s, p) =>
      s + ((p.runs_per_month || 0) * (p.minutes || 0) * (p.people || 1)) / 60,
    0
  );

  const artifact = {
    code,
    company: result.company,
    created_at: new Date().toISOString(),
    responses_count: responses.length,
    processes_count: result.processes.length,
    hours_per_month: Math.round(hours),
    summary: result.summary,
    processes: result.processes,
    pet_projects: result.pet_projects || [],
    xlsx_url: url
  };

  await db.doc(`groups/${code}/artifacts/portrait`).set(artifact);
  await groupRef.update({ portrait_ready: true, portrait_at: new Date() });

  return artifact;
}

module.exports = { runDiagnostics };
