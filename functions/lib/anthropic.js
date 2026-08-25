"use strict";

/*
  Тонкая обёртка над Anthropic API. Без SDK — один fetch, чтобы не тащить
  зависимость и не ловить несовпадения версий при деплое.

  Ключ лежит в секрете Firebase, в код не попадает:
    firebase functions:secrets:set ANTHROPIC_API_KEY
*/

const MODEL = "claude-sonnet-5";
const URL = "https://api.anthropic.com/v1/messages";

async function ask({ system, prompt, maxTokens = 8000, temperature = 0.2 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Нет ANTHROPIC_API_KEY. Задайте секрет функции.");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
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

module.exports = { ask, askJson, MODEL };
