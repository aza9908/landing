"use strict";

/*
  Проверки и обрезка входных данных чат-агента диагностики. Эндпойнт
  публичный, без пароля — этот файл единственная граница между тем,
  что напишет сотрудник (или кто угодно с curl), и тем, что попадёт
  в Firestore и дальше в промпт модели.
*/

const DEPARTMENTS = ["HR", "Finance", "Sales", "Marketing", "CEO"];
const FREQUENCIES = ["Несколько раз в день", "Ежедневно", "Еженедельно",
  "Ежемесячно", "Ежеквартально", "По событию", "Реже"];
const MANUAL_SHARE_VALUES = [0, 0.25, 0.5, 0.75, 1];

const MAX_MESSAGE_LEN = 1200;
const HISTORY_KEEP = 40;
const MAX_LONG_FIELD = 900;
const MAX_SHORT_FIELD = 200;
const MAX_NAME_FIELD = 120;

// Пороги, которые раньше проверяла форма на клиенте ("Напишите хотя бы пару
// предложений — это самое важное поле", "Опишите задачу — с чего начинается
// и чем заканчивается"). Разговор с моделью — не повод их ослаблять: то же
// самое поле pain — самое важное для отчёта.
const MIN_PAIN_LEN = 10;
const MIN_TASK_LEN = 3;

// Код группы: 1–6 латинских букв + 3–6 цифр (реальный формат — 4 буквы + 4
// цифры, без дефиса; берём с запасом, но никаких других символов — код
// подставляется прямо в путь документа Firestore, и без проверки формата
// строка вида "X/y/z" могла бы адресовать неожиданный вложенный путь.
const CODE_RE = /^[A-Z]{1,6}[0-9]{3,6}$/;
const SESSION_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function stripControlChars(v) {
  // управляющие символы, кроме обычных \n \t — на случай если модель или
  // клиент пришлют что-то с мусором внутри
  return v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function clampString(v, max) {
  if (typeof v !== "string") return "";
  return stripControlChars(v).trim().slice(0, max);
}

function isValidCode(code) {
  return typeof code === "string" && CODE_RE.test(code);
}

function validateCode(code) {
  const c = String(code || "").toUpperCase().trim();
  if (!isValidCode(c)) throw new Error("Некорректный код группы.");
  return c;
}

function validateSessionId(id) {
  const s = String(id || "");
  if (!SESSION_RE.test(s)) throw new Error("Некорректная сессия.");
  return s;
}

const MAX_CUSTOM_DEPARTMENT_LEN = 40;

// Фиксированные направления (DEPARTMENTS) — основной путь, но сотрудник
// может выбрать «Другое» и написать своё, если ни одно не подходит.
// В этом случае доверяем только длине и типу, не значению: следующий
// код (Excel, промпт агента 1) должен быть готов увидеть здесь что угодно
// короткое, а не только одно из канонических слов.
function validateDepartment(v) {
  if (DEPARTMENTS.includes(v)) return v;
  const custom = clampString(v, MAX_CUSTOM_DEPARTMENT_LEN);
  if (custom.length < 2) throw new Error("Неизвестное направление.");
  return custom;
}

function validateMessage(message) {
  const m = clampString(message, MAX_MESSAGE_LEN);
  if (!m) throw new Error("Пустое сообщение.");
  return m;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-HISTORY_KEEP)
    .map((t) => ({
      role: t && t.role === "assistant" ? "assistant" : "user",
      text: clampString(t && t.text, MAX_MESSAGE_LEN)
    }))
    .filter((t) => t.text);
}

function closestManualShare(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return 0.5;
  return MANUAL_SHARE_VALUES.reduce(
    (best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best),
    0.5
  );
}

// Модель почти всегда возвращает частоту ровно одним из семи значений
// (так велит системный промпт), но если она всё же собьётся на свободный
// текст — лучше угадать по ключевым словам, чем молча подставить
// произвольное значение по умолчанию и исказить расчёт часов в месяц.
const FREQUENCY_HINTS = [
  [/раз.{0,3}день|несколько.{0,4}день|постоянно|весь.{0,3}день/i, "Несколько раз в день"],
  [/кажд.{0,3}день|ежедневн/i, "Ежедневно"],
  [/недел/i, "Еженедельно"],
  [/месяц/i, "Ежемесячно"],
  [/квартал/i, "Ежеквартально"],
  [/событ|иногда|нерегулярн/i, "По событию"],
  [/редко/i, "Реже"]
];

function normalizeFrequency(v) {
  if (FREQUENCIES.includes(v)) return v;
  const s = String(v || "");
  const hit = FREQUENCY_HINTS.find(([re]) => re.test(s));
  return hit ? hit[1] : "Еженедельно";
}

function sanitizeTiming(timing) {
  if (!Array.isArray(timing)) return [];
  return timing
    .slice(0, 4)
    .map((t) => ({
      task: clampString(t && t.task, MAX_SHORT_FIELD),
      frequency: normalizeFrequency(t && t.frequency),
      runs_per_month: Math.max(0, Math.min(1000, parseInt(t && t.runs_per_month, 10) || 0)),
      minutes: Math.max(0, Math.min(600, parseInt(t && t.minutes, 10) || 0)),
      people: Math.max(1, Math.min(200, parseInt(t && t.people, 10) || 1))
    }))
    .filter((t) => t.task.length >= MIN_TASK_LEN);
}

/*
  Данные, которые модель вернула в поле "data" после done:true. Модели не
  доверяем: каждое поле проверяется и обрезается так же строго, как раньше
  проверяли поля в правилах Firestore для прямой записи с формы.
*/
function sanitizeExtractedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Модель не вернула данные анкеты.");
  }

  const fio = clampString(data.fio, MAX_NAME_FIELD);
  const role = clampString(data.role, MAX_NAME_FIELD);
  const timing = sanitizeTiming(data.timing);
  const pain = clampString(data.pain, MAX_LONG_FIELD);
  const tools = clampString(data.tools, MAX_SHORT_FIELD);
  const wish = clampString(data.wish, MAX_LONG_FIELD);

  if (fio.length < 2) throw new Error("incomplete:fio");
  if (role.length < 2) throw new Error("incomplete:role");
  if (!timing.length) throw new Error("incomplete:timing");
  if (pain.length < MIN_PAIN_LEN) throw new Error("incomplete:pain");

  return {
    fio,
    role,
    timing,
    tasks: timing.map((t) => t.task).join(" | "),
    pain,
    tools,
    manual_share: closestManualShare(data.manual_share),
    wish,
    // Модель должна вернуть строго true/false. Если пришло что-то другое
    // (пропущено поле, строка "да" вместо true и т.п.) — считаем задачи
    // потенциально конфиденциальными, а не наоборот: ошибиться в сторону
    // большей осторожности с чужими персональными данными безопаснее,
    // чем молча занизить их чувствительность.
    confidential: data.confidential !== false
  };
}

module.exports = {
  DEPARTMENTS,
  FREQUENCIES,
  HISTORY_KEEP,
  validateCode,
  validateSessionId,
  validateDepartment,
  validateMessage,
  sanitizeHistory,
  sanitizeExtractedData
};
