/*
  AIRL: откуда пришёл посетитель — для статистики лидов (stats.html).

  На первом заходе запоминаем внешний источник (document.referrer), UTM-метки
  и страницу входа. Форма заявки (airl-lead.js) и экспресс-диагностика
  (/diagnostics) прикладывают это к лиду через window.AIRL_ATTR().

  Источник держим 30 дней: человек может прийти из Instagram, уйти и оставить
  заявку через неделю. Новые UTM-метки в ссылке перекрывают старые — это
  новый переход по рекламе. Хранится только в браузере посетителя.
*/
(function () {
  "use strict";
  var KEY = "airl_attr", TTL = 30 * 24 * 60 * 60 * 1000;

  function param(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&#]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1].replace(/\+/g, " ")).slice(0, 100); } catch (e) { return m[1].slice(0, 100); }
  }
  function externalReferrer() {
    try {
      if (!document.referrer) return "";
      var host = new URL(document.referrer).hostname.replace(/^www\./, "");
      return host === location.hostname.replace(/^www\./, "") ? "" : host.slice(0, 100);
    } catch (e) { return ""; }
  }
  function read() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "null");
      return a && Date.now() - (a.ts || 0) < TTL ? a : null;
    } catch (e) { return null; }
  }

  var utm = { utm_source: param("utm_source"), utm_medium: param("utm_medium"), utm_campaign: param("utm_campaign") };
  var stored = read();
  if (!stored || utm.utm_source) {
    stored = { utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign,
               referrer: externalReferrer(), landing: location.pathname.slice(0, 100), ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) {}
  }

  window.AIRL_ATTR = function () {
    return { utm_source: stored.utm_source || "", utm_medium: stored.utm_medium || "", utm_campaign: stored.utm_campaign || "",
             referrer: stored.referrer || "", landing: stored.landing || "" };
  };
})();
