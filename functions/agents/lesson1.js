"use strict";

/*
  Агент 2 — урок 1 «Повторяй за мной».

  Вход:  код группы (портрет боли уже собран агентом 1).
  Берёт портрет и собирает презентацию первого урока под мир конкретного
  клиента: викторина про их продукт, конвейер про их процесс из P1.

  Выход: groups/{code}/artifacts/lesson1 + HTML-презентация и раздатка в Storage.
*/

const { askJson } = require("../lib/anthropic");
const { renderDeck } = require("../lib/deck");

const SYSTEM = `
Ты методолог AI Research Lab. Ты собираешь презентацию первого урока
вайб-кодинга «Повторяй за мной» — два академических часа, 90 минут.

СМЫСЛ УРОКА

Участник впервые в жизни делает работающую вещь одними словами. Задача урока —
снять страх, а не научить пользе. Польза начинается на втором уроке.
Если смешать это в один урок, люди начнут думать про работу и перестанут пробовать.

Два артефакта, оба собираются в claude.ai:
1. Викторина в духе Kahoot — весело, быстро, без пользы.
2. Симулятор конвейера Toyota — четыре участка, очереди, узкое место.
   Внешне игрушка, по сути первый разговор о том, где в компании копится очередь.

МИР КЛИЕНТА

Это главное отличие урока AIRL от урока «сделайте калькулятор».
Викторина — про продукт клиента, его факты, его роли.
Конвейер — про их реальный процесс из приоритета P1: четыре этапа их словами,
и узкое место там, где оно у них на самом деле.
Не бери настоящие данные, интеграции и логины: урок 1 про смелость.

ПРОМПТЫ

Восемь промптов, по четыре на артефакт, по одному на слайд.
Промпт от лица участника, обычными словами, без технических терминов
и названий библиотек. Четыре-пять строк, не длиннее: длинный промпт участник
не наберёт и потеряет темп. Переносы строк ставь сам, строка не длиннее 78 символов.

Порядок промптов для викторины: каркас игры, замена вопросов на мир клиента,
таймер и очки, оформление в тёмной теме.
Для конвейера: линия из четырёх участков, переименование под их процесс,
ползунки времени и видимые очереди, подсветка узкого места.

ПОРЯДОК СЛАЙДОВ — ровно 20

1 титул, 2 что будет через 90 минут, 3 правило урока, 4 как устроен разговор
с Claude, 5 открываем Claude, 6–9 промпты викторины, 10 играем друг у друга,
11 что сейчас произошло, 12 перерыв, 13 зачем конвейер, 14–17 промпты конвейера,
18 три эксперимента, 19 итог, 20 что дальше.

ЧЕГО НЕ ДЕЛАТЬ

Не объясняй, как работают нейросети. Не показывай код на слайдах. Не давай
выбора: все делают одно и то же и получают одинаковый результат. Не добавляй
третий артефакт. Не разбирай реальные процессы прямо на уроке — это второй урок.

ФОРМАТ ОТВЕТА

Верни только JSON, без пояснений и markdown-обёрток. Типы слайдов:
title, lead, list, steps, prompt, break, question, final.
В items и body можно выделять **жирным**.

{
  "company": "",
  "quiz_topic": "про что будет викторина",
  "conveyor": { "stages": ["", "", "", ""], "bottleneck": "название узкого этапа" },
  "slides": [
    { "type": "title", "eyebrow": "", "title": "", "subtitle": "" },
    { "type": "list", "eyebrow": "", "title": "", "subtitle": "", "items": ["", "", ""] },
    { "type": "prompt", "eyebrow": "Викторина · промпт 1 из 4", "title": "",
      "prompt": "текст промпта с переносами строк", "result": "что должно получиться" },
    { "type": "break", "title": "45 минут", "subtitle": "" },
    { "type": "question", "eyebrow": "", "title": "", "subtitle": "", "items": ["", "", ""] },
    { "type": "final", "eyebrow": "", "title": "", "subtitle": "" }
  ],
  "handout_intro": "два предложения для раздатки",
  "homework": "домашнее задание к уроку 2, два предложения",
  "trainer_notes": [
    { "minutes": "0–5", "what": "", "trainer": "что конкретно делает тренер" }
  ],
  "risk_points": ["где группа разъезжается и что делать", ""]
}
`.trim();

function packPortrait(portrait) {
  const s = portrait.summary || {};
  const p1 = (portrait.processes || [])
    .filter((p) => (p.impact || 0) >= 4)
    .slice(0, 6)
    .map(
      (p) =>
        `  • ${p.team}: ${p.process} — ${p.problem || ""} (шаги: ${p.steps || "—"})`
    )
    .join("\n");

  return [
    `Компания: ${portrait.company}`,
    `Ответов собрано: ${portrait.responses_count}`,
    `Процессов: ${portrait.processes_count}, часов в месяц: ${portrait.hours_per_month}`,
    "",
    "Главные боли:",
    ...(s.top_pains || []).map((x) => `  • ${x}`),
    "",
    `Инструменты: ${s.tools_in_use || "—"}`,
    `Опасения: ${s.fears || "—"}`,
    `Уровень группы: ${s.group_level || "—"}`,
    `Риски: ${s.risks || "—"}`,
    "",
    "Процессы с высоким влиянием — из них берём конвейер:",
    p1
  ].join("\n");
}

async function runLesson1({ db, storage, code }) {
  const portraitSnap = await db.doc(`groups/${code}/artifacts/portrait`).get();
  if (!portraitSnap.exists) {
    throw new Error("Сначала соберите портрет боли — агент 1 ещё не отработал.");
  }
  const portrait = portraitSnap.data();

  const result = await askJson({
    system: SYSTEM,
    prompt: packPortrait(portrait),
    maxTokens: 16000
  });

  result.company = result.company || portrait.company;
  result.lesson = "Урок 1. Повторяй за мной";

  const prompts = (result.slides || []).filter((s) => s.type === "prompt");

  const html = renderDeck(result);
  const handout = renderHandout(result, prompts);
  const timing = renderTiming(result);

  const files = {};
  const uploads = [
    ["deck", `Урок1_${code}.html`, html, "text/html; charset=utf-8"],
    ["handout", `ПРОМПТЫ_${code}.md`, handout, "text/markdown; charset=utf-8"],
    ["timing", `ТАЙМИНГ_${code}.md`, timing, "text/markdown; charset=utf-8"]
  ];

  for (const [key, name, body, type] of uploads) {
    const file = storage.file(`lessons/${code}/${name}`);
    await file.save(Buffer.from(body, "utf-8"), { contentType: type });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    files[`${key}_url`] = url;
  }

  const artifact = {
    code,
    company: result.company,
    created_at: new Date().toISOString(),
    slides_count: (result.slides || []).length,
    prompts_count: prompts.length,
    quiz_topic: result.quiz_topic || "",
    conveyor: result.conveyor || {},
    homework: result.homework || "",
    risk_points: result.risk_points || [],
    ...files
  };

  await db.doc(`groups/${code}/artifacts/lesson1`).set(artifact);
  await db.doc(`groups/${code}`).update({ lesson1_ready: true, lesson1_at: new Date() });

  return artifact;
}

function renderHandout(deck, prompts) {
  const lines = [
    `# ${deck.lesson} — раздатка`,
    "",
    `${deck.company} · вайб-кодинг · два академических часа`,
    "",
    deck.handout_intro ||
      "Копируйте промпты по одному, в том порядке, в котором они здесь идут.",
    "",
    "Открыть: **claude.ai** → войти → «Новый чат».",
    "",
    "---",
    ""
  ];

  prompts.forEach((s, i) => {
    lines.push(`### Промпт ${i + 1} — ${s.title || ""}`, "");
    lines.push("```", s.prompt, "```", "");
    if (s.result) lines.push(s.result.replace(/\*\*/g, "**"), "");
  });

  lines.push(
    "---",
    "",
    "## Если что-то пошло не так",
    "",
    "**Справа ничего не появилось.**",
    "Напишите: `покажи это как артефакт`",
    "",
    "**Получилось не то.**",
    "Не начинайте заново. Скажите одним предложением, что именно не так:",
    "`кнопки слишком мелкие, сделай крупнее`",
    "",
    "**Всё сломалось после правки.**",
    "Напишите: `верни как было до последней правки`",
    "",
    "**Вы отстали от группы.**",
    "Скопируйте промпт с текущего слайда и продолжайте с него.",
    "Догонять предыдущие не нужно.",
    "",
    "---",
    "",
    "## Домашнее задание к уроку 2",
    "",
    deck.homework || ""
  );

  return lines.join("\n");
}

function renderTiming(deck) {
  const rows = (deck.trainer_notes || [])
    .map((n) => `| ${n.minutes} | ${n.what} | ${n.trainer} |`)
    .join("\n");

  return [
    `# ${deck.lesson} — тайминг тренера`,
    "",
    `${deck.company} · 90 минут`,
    "",
    "| Минуты | Что происходит | Что делает тренер |",
    "|---|---|---|",
    rows,
    "",
    "## Точки, где группа разъезжается",
    "",
    ...(deck.risk_points || []).map((r) => `- ${r}`),
    "",
    "## Чего не делать",
    "",
    "- Не объяснять, как работают нейросети",
    "- Не показывать код артефакта на экране",
    "- Не разбирать реальные процессы компании прямо на уроке — это второй урок",
    "- Не добавлять третий артефакт, даже если осталось время"
  ].join("\n");
}

module.exports = { runLesson1 };
