/*
  AIRL: языковые версии сайта.

  Русская версия живёт в корне (/), казахская — в /kk/, английская — в /en/.
  Язык страницы берём из <html lang>. Подключается в <head> без defer,
  до остальных скриптов: site-updates.js, airl-lead.js и lms-link.js
  читают отсюда window.AIRL_LANG и window.AIRL_PATH.

  Переключатель RU · KZ · EN вставляется в шапку любой страницы (лендинг
  на Vue, программы, блог, команда) и ведёт на ту же страницу в другом
  языке. Выбор запоминается, чтобы ссылки на главную из русских разделов
  (например, /diagnostics) возвращали человека в его язык.
*/
(function () {
  "use strict";

  var LANGS = [
    { code: "ru", label: "RU", title: "Русский", prefix: "" },
    { code: "kk", label: "KZ", title: "Қазақша", prefix: "/kk" },
    { code: "en", label: "EN", title: "English", prefix: "/en" }
  ];

  var htmlLang = (document.documentElement.getAttribute("lang") || "ru").slice(0, 2);
  var lang = htmlLang === "kk" || htmlLang === "en" ? htmlLang : "ru";
  var current = LANGS.filter(function (l) { return l.code === lang; })[0];

  // Путь страницы без языкового префикса: /kk/team/x → /team/x
  function basePath() {
    var p = location.pathname;
    var m = p.match(/^\/(kk|en)(\/.*)?$/);
    return m ? (m[2] || "/") : p;
  }

  window.AIRL_LANG = lang;
  // Внутренняя ссылка на текущем языке: AIRL_PATH("/blog/") → "/kk/blog/"
  window.AIRL_PATH = function (path) {
    if (!current.prefix || !path || path.charAt(0) !== "/" || /^\/(kk|en)(\/|$)/.test(path)) return path;
    return current.prefix + path;
  };

  try { localStorage.setItem("airl_lang", lang); } catch (e) {}

  var CSS =
    ".airl-lang{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;" +
    "border:1px solid rgba(255,255,255,.18);background:rgba(10,10,14,.35);" +
    "font:600 12px/1 'Inter Tight',Inter,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "letter-spacing:.04em;vertical-align:middle;flex-shrink:0}" +
    ".airl-lang a{display:block;padding:6px 8px;border-radius:999px;color:rgba(255,255,255,.62);" +
    "text-decoration:none;transition:color .15s,background .15s}" +
    ".airl-lang a:hover{color:#fff}" +
    ".airl-lang a[aria-current]{background:#fff;color:#0a0a0e}" +
    // Светлая тема блога и страниц команды
    "html[data-theme=light] .airl-lang{border-color:rgba(10,10,14,.15);background:rgba(255,255,255,.6)}" +
    "html[data-theme=light] .airl-lang a{color:rgba(10,10,14,.6)}" +
    "html[data-theme=light] .airl-lang a:hover{color:#0a0a0e}" +
    "html[data-theme=light] .airl-lang a[aria-current]{background:#0a0a0e;color:#fff}" +
    // Блог и команда: переключатель и кнопка темы — одна группа справа.
    ".airl-lang-group{display:flex;align-items:center;gap:12px}" +
    ".m-menu-nav .airl-lang{align-self:flex-start;margin-top:8px}" +
    ".m-menu-nav .airl-lang a{padding:9px 12px;font-size:14px}";

  function makeSwitch() {
    var nav = document.createElement("nav");
    nav.className = "airl-lang";
    nav.setAttribute("aria-label", { ru: "Язык", kk: "Тіл", en: "Language" }[lang]);
    var path = basePath();
    LANGS.forEach(function (l) {
      var a = document.createElement("a");
      a.href = l.prefix + path + location.hash;
      a.textContent = l.label;
      a.title = l.title;
      a.hreflang = l.code;
      a.lang = l.code;
      if (l.code === lang) a.setAttribute("aria-current", "true");
      a.addEventListener("click", function () {
        try { localStorage.setItem("airl_lang", l.code); } catch (e) {}
      });
      nav.appendChild(a);
    });
    return nav;
  }

  // Куда ставить переключатель: [контейнер, вставить перед этим элементом].
  var SLOTS = [
    [".header .btn-group", null],               // лендинг: шапка первого экрана
    [".floating-nav .nav-btn-group", null],     // лендинг: плавающая шапка
    [".m-menu-nav", ".m-menu-cta"],              // лендинг: мобильное меню
    [".lp-header-actions", null],               // страницы программ
    [".blog-topbar", ".theme-toggle"]           // блог и команда (см. ниже)
  ];

  function place() {
    SLOTS.forEach(function (slot) {
      document.querySelectorAll(slot[0]).forEach(function (box) {
        if (box.querySelector(":scope > .airl-lang, :scope > .airl-lang-group")) return;
        var before = slot[1] ? box.querySelector(":scope > " + slot[1]) : null;
        var sw = makeSwitch();
        // Шапка блога раскладывает детей через space-between: третий элемент
        // встал бы посередине. Кладём переключатель и кнопку темы в одну группу.
        if (before && box.classList.contains("blog-topbar")) {
          var group = document.createElement("div");
          group.className = "airl-lang-group";
          box.insertBefore(group, before);
          group.appendChild(sw);
          group.appendChild(before);
          return;
        }
        // В шапке лендинга переключатель встаёт перед кнопкой меню и CTA.
        if (!before && box.firstElementChild && /btn-group/.test(slot[0])) before = box.firstElementChild;
        box.insertBefore(sw, before);
      });
    });
  }

  function start() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    place();
    // Лендинг на Vue и мобильное меню дорисовываются позже — ловим их.
    var obs = new MutationObserver(place);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
