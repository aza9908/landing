"use strict";

/*
  Тонкая обёртка над Anthropic API. Без SDK — один fetch, чтобы не тащить
  зависимость и не ловить несовпадения версий при деплое.

  Ключ лежит в секрете Firebase, в код не попадает:
    firebase functions:secrets:set ANTHROPIC_API_KEY
*/

// По умолчанию — Sonnet, для агентов, где важно качество синтеза
// (портрет боли, урок). Чат-агент диагностики просит Haiku явно: там
// каждый ответ — короткая реплика по сценарию, а не сложный синтез, и
// задержка ощущается сотрудником напрямую, в реальном времени разговора.
const MODEL = "claude-sonnet-5";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const URL = "https://api.anthropic.com/v1/messages";

// 429 (перегружен по rate limit) и 5xx (временная неполадка на стороне
// Anthropic) стоит повторить — особенно в чате, где несколько сотрудников
// могут писать одновременно и упереться в лимит запросов в минуту у ключа.
// 4xx кроме 429 — ошибка в самом запросе, повторять бессмысленно.
const RETRY_DELAYS_MS = [400, 1200];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOnce({ key, system, prompt, maxTokens, model }) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    // `temperature` для этой модели API больше не принимает (400
    // invalid_request_error) — параметр из запроса убран совсем, а не
    // просто перестал передаваться по умолчанию.
    body: JSON.stringify({
      model: model || MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const e = new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
    e.status = res.status;
    e.retryable = res.status === 429 || res.status >= 500;
    throw e;
  }

  return res.json();
}

async function ask({ system, prompt, maxTokens = 8000, model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Нет ANTHROPIC_API_KEY. Задайте секрет функции.");

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const data = await callOnce({ key, system, prompt, maxTokens, model });
      return (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    } catch (e) {
      lastError = e;
      if (!e.retryable || attempt === RETRY_DELAYS_MS.length) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

/* Просим у модели JSON — и всё равно готовимся к обёрткам вокруг него. */
async function askJson(opts) {
  const raw = await ask(opts);
  const clean = raw
    .replace(/^[\s\S]*?```(?:json)?\s*/m, (m) => (raw.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/m, "")
    .trim();

  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const slice = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;

  try {
    return JSON.parse(slice);
  } catch (e) {
    throw new Error(`Модель вернула не JSON: ${slice.slice(0, 300)}`);
  }
}

module.exports = { ask, askJson, MODEL, HAIKU_MODEL };
