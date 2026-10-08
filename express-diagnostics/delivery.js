/*
  AIRL: что происходит после экспресс-диагностики на airl.kz/diagnostics.
  -----------------------------------------------------------------------
  build.py встраивает этот файл в страницу сразу после основного скрипта
  бота. Интерфейс бота он не трогает: только собирает и отправляет результат.

  - Код группы из ссылки (/diagnostics?code=AIRL7013): ту же ссылку менеджер
    отправляет клиенту по заявке. Проверяем код по groups_public и прикладываем
    к результату, чтобы разбор сразу было видно, к какой заявке он относится.
  - Абзац для клиента: короткий итог диагностики, который уходит в WhatsApp.
  - PDF-summary для клиента: балл AI-зрелости, оси, боли, зоны роста, первый
    шаг. Фирменный стиль AIRL (акцент #5B5BCA, шрифт Nunito Sans). Собирается
    в браузере через pdfmake; шрифты лежат рядом, в /express-diagnostics/fonts/.
  - В Telegram менеджеру (канал агента AIRL_TELEGRAM_AGENT, а пока он не
    настроен — общий AIRL_TELEGRAM): сводка со ссылкой, которая открывает WhatsApp
    с номером клиента и уже набранным абзацем, следом PDF и отчёт менеджера.
    WhatsApp без платного Business API сам писать не умеет, поэтому
    отправляет менеджер, одним нажатием.
*/
window.AIRLDelivery = (function () {
  "use strict";

  var PDFMAKE = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js";
  var FONTS = "/express-diagnostics/fonts/";
  var LOGO = "/logo-airl.png";
  var CONTACTS = { site: "airl.kz", phone: "+7 707 221 2930", address: ["Alem.ai, пр. Мангилик Ел, 55/1", "г. Астана"] };
  // Фирменные цвета AIRL для документов (тот же набор, что в КП AI for Work).
  var C = { accent: "#5B5BCA", deep: "#3E3E77", ink: "#16161A", ink2: "#292930", muted: "#79798C",
            line: "#D9DBE7", panel: "#F2F2F9", tint: "#EDEDF8" };

  /* ---------------- Код группы из ссылки ---------------- */

  var group = { code: "", company: "", status: "none" };
  var m = location.search.match(/[?&]code=([^&#]+)/);
  if (m) {
    try { group.code = decodeURIComponent(m[1]); } catch (e) { group.code = m[1]; }
    group.code = group.code.trim().toUpperCase().slice(0, 32);
  }

  // Не найден или закрыт — не мешаем человеку пройти диагностику, только
  // помечаем это для менеджера.
  var groupReady = !group.code ? Promise.resolve(group) : (function () {
    var fc = window.AIRL_FIREBASE_CONFIG || {};
    if (!fc.projectId || !fc.apiKey) { group.status = "unchecked"; return Promise.resolve(group); }
    return fetch("https://firestore.googleapis.com/v1/projects/" + fc.projectId +
        "/databases/(default)/documents/groups_public/" + encodeURIComponent(group.code) + "?key=" + fc.apiKey)
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("groups_public " + res.status);
        return res.json();
      })
      .then(function (doc) {
        if (!doc) { group.status = "not_found"; return group; }
        var f = doc.fields || {};
        group.company = (f.company && f.company.stringValue) || "";
        group.status = f.active && f.active.booleanValue ? "active" : "closed";
        return group;
      })
      .catch(function () { group.status = "unchecked"; return group; });
  })();

  function groupWithin(ms) {
    return Promise.race([groupReady, new Promise(function (res) { setTimeout(function () { res(group); }, ms); })]);
  }

  /* ---------------- Текст для клиента ---------------- */

  // В документах AIRL нет длинного тире. Первое заменяем двоеточием (так оно
  // и работает в этих фразах: «X — Y» = «X: Y»), остальные запятой.
  function noDash(t) {
    t = String(t == null ? "" : t);
    var colon = t.indexOf(":") >= 0;
    return t.replace(/\s+—\s+/g, function () {
      if (!colon) { colon = true; return ": "; }
      return ", ";
    }).replace(/—/g, "-");
  }
  function sentence(t) {
    t = noDash(t).trim();
    return t && !/[.!?…]$/.test(t) ? t + "." : t;
  }
  function lowerFirst(t) {
    return t && /^[А-ЯЁA-Z][а-яёa-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }
  // Формулировки report.js написаны для менеджера; клиенту — без служебных слов.
  function clientPain(p) {
    return sentence(String(p)
      .replace(/^Главный барьер словами клиента:\s*/, "Главный барьер, по вашим словам: ")
      .replace(/\s*\(названа своими словами\)/, "")
      .replace(/^Наиболее близкий профиль \([^)]*\):\s*/, ""));
  }
  function zoneName(z) {
    var t = String(z.title || ""), i = t.indexOf(":");
    return lowerFirst(i > 0 ? t.slice(0, i) : t);
  }

  function clientParagraph(a, r) {
    var zones = (r.zones || []).slice(0, 3).map(zoneName).filter(Boolean);
    var first = r.zones && r.zones[0] ? sentence(r.zones[0].first) : "";
    var L = [
      (a.name ? "Здравствуйте, " + a.name + "!" : "Здравствуйте!") +
        " Это AI Research Labs, спасибо, что прошли экспресс-диагностику AI-зрелости.",
      "Уровень " + (a.company ? "компании «" + a.company + "»" : "вашей компании") + ": " +
        r.levelRu + " (" + r.level + "), " + r.score + " из 16. " + sentence(r.levelText)
    ];
    if (zones.length) L.push("Главные зоны роста: " + zones.join(", ") + ".");
    if (first) L.push("Первый шаг: " + lowerFirst(first));
    L.push("Подробный разбор с болями и планом первых шагов пришлю следом в PDF. Удобно обсудить на коротком звонке?");
    return L.join(" ");
  }

  /* ---------------- Контакт клиента → ссылка для менеджера ---------------- */

  function phoneDigits(s) {
    var d = String(s || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "8") d = "7" + d.slice(1); // казахстанская «восьмёрка»
    if (d.length === 10) d = "7" + d;
    return d.length >= 11 && d.length <= 15 ? d : "";
  }
  function contactLink(contact, text) {
    var c = String(contact || "").trim();
    var nick = c.match(/^(?:@|(?:https?:\/\/)?t\.me\/)?([A-Za-z][A-Za-z0-9_]{3,31})$/);
    if (nick && /[A-Za-z]/.test(c)) return { kind: "telegram", url: "https://t.me/" + nick[1] };
    var d = phoneDigits(c);
    if (d) return { kind: "whatsapp", url: "https://wa.me/" + d + "?text=" + encodeURIComponent(text) };
    return null;
  }

  /* ---------------- Telegram ---------------- */

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function okJson(res) {
    return res.json().catch(function () { return {}; }).then(function (j) {
      if (!res.ok || j.ok === false) throw new Error("telegram " + res.status + (j.description ? ": " + j.description : ""));
      return j;
    });
  }
  // Результаты агента — в свой канал (AIRL_TELEGRAM_AGENT); пока он не
  // настроен, в общий канал заявок (AIRL_TELEGRAM).
  function tg() {
    var agent = window.AIRL_TELEGRAM_AGENT || {};
    var t = agent.botToken && agent.chatId ? agent : (window.AIRL_TELEGRAM || {});
    if (!t.botToken || !t.chatId) throw new Error("Telegram не настроен в firebase-bridge.js");
    return t;
  }
  function sendMessage(text, html) {
    var t = tg(), body = { chat_id: t.chatId, text: text, disable_web_page_preview: true };
    if (html) body.parse_mode = "HTML";
    return fetch("https://api.telegram.org/bot" + t.botToken + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(okJson);
  }
  function sendDocument(blob, filename, caption) {
    var t = tg(), fd = new FormData();
    fd.append("chat_id", t.chatId);
    fd.append("caption", caption.slice(0, 1000));
    fd.append("document", blob, filename);
    return fetch("https://api.telegram.org/bot" + t.botToken + "/sendDocument", { method: "POST", body: fd }).then(okJson);
  }

  function groupLine(g) {
    if (!g.code) return "Код группы: нет (диагностику открыли не по ссылке из заявки)";
    var note = g.status === "active" ? (g.company ? ", заявка: " + g.company : "")
      : g.status === "closed" ? ", группа закрыта" : g.status === "not_found" ? ", такого кода нет" : "";
    return "Код группы: " + g.code + note;
  }

  /* ---------------- PDF-summary ---------------- */

  var pdfReady = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res;
      s.onerror = function () { rej(new Error("не загрузился " + src)); };
      document.head.appendChild(s);
    });
  }
  function fetchBase64(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + " " + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      var bytes = new Uint8Array(buf), bin = "";
      for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    });
  }
  // pdfmake и шрифты — почти 2 МБ, поэтому грузим их, только когда человек
  // начал диагностику (первый клик), а не каждому, кто открыл страницу.
  function preparePdf() {
    if (pdfReady) return pdfReady;
    pdfReady = Promise.all([
      window.pdfMake ? Promise.resolve() : loadScript(PDFMAKE),
      fetchBase64(FONTS + "NunitoSans-Regular.ttf"),
      fetchBase64(FONTS + "NunitoSans-Bold.ttf"),
      fetchBase64(FONTS + "NunitoSans-ExtraBold.ttf"),
      fetchBase64(LOGO)
    ]).then(function (x) {
      return {
        vfs: { "NunitoSans-Regular.ttf": x[1], "NunitoSans-Bold.ttf": x[2], "NunitoSans-ExtraBold.ttf": x[3] },
        fonts: {
          Nunito: { normal: "NunitoSans-Regular.ttf", bold: "NunitoSans-Bold.ttf",
                    italics: "NunitoSans-Regular.ttf", bolditalics: "NunitoSans-Bold.ttf" },
          NunitoXB: { normal: "NunitoSans-ExtraBold.ttf", bold: "NunitoSans-ExtraBold.ttf",
                      italics: "NunitoSans-ExtraBold.ttf", bolditalics: "NunitoSans-ExtraBold.ttf" }
        },
        logo: "data:image/png;base64," + x[4]
      };
    });
    pdfReady.catch(function () { pdfReady = null; }); // следующая попытка загрузит заново
    return pdfReady;
  }
  document.addEventListener("click", function once() {
    document.removeEventListener("click", once, true);
    preparePdf().catch(function () {});
  }, true);

  function noLines(fill) {
    return {
      hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
      fillColor: function () { return fill || null; },
      paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
      paddingTop: function () { return 0; }, paddingBottom: function () { return 0; }
    };
  }
  function box(content, fill, margin) {
    return { table: { widths: ["*"], body: [[content]] }, layout: noLines(fill), margin: margin || [0, 0, 0, 0] };
  }
  // Ряд плашек одной высоты: одна таблица, промежутки — белые линии по 7 pt.
  function strip(cells) {
    return {
      table: { widths: cells.map(function () { return "*"; }), body: [cells] },
      layout: {
        fillColor: function () { return C.panel; },
        hLineWidth: function () { return 0; },
        vLineWidth: function (k) { return k === 0 || k === cells.length ? 0 : 7; },
        vLineColor: function () { return "#fff"; },
        paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
        paddingTop: function () { return 0; }, paddingBottom: function () { return 0; }
      }
    };
  }
  function tile(big, cap) {
    return { stack: [
      { text: big, font: "NunitoXB", fontSize: 16, color: C.accent, lineHeight: 1.05 },
      { text: cap, fontSize: 9, margin: [0, 3, 0, 0] }
    ], margin: [11, 9, 11, 9] };
  }
  function h2(n, t) {
    return { text: [{ text: n + "   ", color: C.accent, fontSize: 9, bold: true },
                    { text: t, font: "NunitoXB", fontSize: 14.5, color: C.ink }],
             margin: [0, 16, 0, 6], headlineLevel: 1 };
  }
  function card(z, i) {
    var rows = [
      { text: "ЗОНА " + (i + 1), fontSize: 7.8, bold: true, color: C.accent, characterSpacing: 0.6 },
      { text: noDash(z.title), bold: true, color: C.ink, fontSize: 10.5, margin: [0, 2, 0, 3] }
    ];
    [["Почему это важно", z.why], ["Что сделать первым", z.first], ["Как поймёте, что получилось", z.metric]].forEach(function (p) {
      if (p[1]) rows.push({ text: [{ text: p[0] + ". ", bold: true, color: C.ink }, sentence(p[1])], fontSize: 9.2, margin: [0, 2, 0, 0] });
    });
    return {
      table: { widths: ["*"], body: [[{ stack: rows, margin: [10, 8, 10, 8] }]] },
      layout: {
        hLineWidth: function () { return 0.75; },
        vLineWidth: function (k) { return k === 0 ? 2.6 : 0.75; },
        hLineColor: function () { return C.line; },
        vLineColor: function (k) { return k === 0 ? C.accent : C.line; },
        paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
        paddingTop: function () { return 0; }, paddingBottom: function () { return 0; }
      },
      margin: [0, 0, 0, 7], unbreakable: true
    };
  }
  function axesTable(axes) {
    function th(t) { return { text: t, bold: true, fontSize: 8.3, color: C.deep }; }
    var body = [[th("Ось"), th("Ваш ответ"), th("Балл"), th("Что это значит")]];
    (axes || []).forEach(function (x) {
      body.push([{ text: x.title, bold: true, color: C.ink }, noDash(x.answer),
                 { text: x.score + " из 4", bold: true, color: x.score <= 2 ? C.accent : C.ink }, sentence(x.meaning)]);
    });
    return {
      table: { headerRows: 1, widths: [58, "*", 38, "*"], body: body },
      layout: {
        fillColor: function (row) { return row === 0 ? C.tint : null; },
        hLineWidth: function (k) { return k <= 1 ? 0 : 0.75; }, vLineWidth: function () { return 0; },
        hLineColor: function () { return C.line; },
        paddingLeft: function () { return 7; }, paddingRight: function () { return 7; },
        paddingTop: function () { return 5; }, paddingBottom: function () { return 5; }
      },
      fontSize: 9, margin: [0, 2, 0, 4], unbreakable: true
    };
  }

  function buildDoc(a, r, assets) {
    var date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    var who = [a.name, a.position].filter(Boolean).join(", ");
    var meta = [a.industry, a.team_size ? "команда " + a.team_size : ""].filter(Boolean).join(" · ");
    var zones = r.zones || [];
    var content = [
      { columns: [
          { image: assets.logo, width: 104 },
          { stack: [{ text: "Экспресс-диагностика AI-зрелости", bold: true, color: C.ink2 }, { text: date, color: C.muted }],
            fontSize: 8.5, alignment: "right", margin: [0, 6, 0, 0] }
        ] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 505, y2: 0, lineWidth: 0.75, lineColor: C.line }], margin: [0, 11, 0, 0] },
      { text: "ИТОГИ ДИАГНОСТИКИ", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.8, margin: [0, 16, 0, 6] },
      { text: a.company || "Ваша компания", font: "NunitoXB", fontSize: 26, color: C.ink, lineHeight: 1.05, margin: [0, 0, 0, 8] },
      { text: [who, meta].filter(Boolean).join(" · "), fontSize: 11.5, margin: [0, 0, 0, 12] },
      strip([
        tile(r.score + " из 16", "Балл AI-зрелости"),
        tile(r.levelRu, "Уровень " + r.level),
        tile(zones.length + (zones.length === 1 ? " зона" : zones.length < 5 ? " зоны" : " зон") + " роста", "С первыми шагами ниже")
      ]),
      box({ text: sentence(r.levelText) + (r.segment && r.segment.client ? " " + sentence(r.segment.client) : ""),
            fontSize: 10.5, bold: true, color: C.ink, margin: [12, 9, 12, 9] }, C.panel, [0, 7, 0, 0]),

      { stack: [h2("01", "Оси AI-зрелости"),
        { text: "Балл складывается из четырёх осей: роли, процессы, данные и решения. Каждая оценивается от 1 до 4, итог от 4 до 16.",
          margin: [0, 0, 0, 6] },
        axesTable(r.axes)], unbreakable: true },

      { stack: [h2("02", "Что болит сейчас"), { ul: (r.pains || []).map(clientPain), markerColor: C.accent, margin: [0, 0, 0, 2] }],
        unbreakable: true },

      h2("03", "Зоны роста и первые шаги")
    ];
    zones.forEach(function (z, i) { content.push(card(z, i)); });

    if (r.effect || r.effectNote) {
      var effect = [h2("04", "Где AI даст эффект первым"),
        { text: [{ text: (r.effectFunction || "") + ". ", bold: true, color: C.ink }, sentence(r.effect || r.effectNote)], margin: [0, 0, 0, 6] }];
      if (r.effectMetrics && r.effectMetrics.length) {
        effect.push(strip(r.effectMetrics.slice(0, 3).map(function (mtr) {
          return { stack: [{ text: noDash(mtr[0]), bold: true, color: C.ink }, { text: noDash(mtr[1]) }], fontSize: 9, margin: [9, 7, 9, 7] };
        })));
      }
      content.push({ stack: effect, unbreakable: true });
    }
    if (r.next) {
      // report.js начинает фразу со «Следующий шаг — …», а это уже заголовок раздела.
      var next = sentence(String(r.next).replace(/^Следующий шаг\s*[—:-]\s*/, ""));
      content.push({ stack: [h2(r.effect || r.effectNote ? "05" : "04", "Следующий шаг"),
                             { text: next.charAt(0).toUpperCase() + next.slice(1) }], unbreakable: true });
    }
    content.push({
      table: { widths: ["*", 172], body: [[
        { stack: [{ text: "Обсудим разбор на коротком звонке", font: "NunitoXB", fontSize: 13.5, color: "#fff" },
                  { text: "Менеджер AIRL свяжется с вами, чтобы пройтись по зонам роста и выбрать первый шаг.", fontSize: 9.4, color: "#fff", margin: [0, 4, 0, 0] }],
          margin: [15, 13, 8, 13] },
        { stack: [{ text: CONTACTS.site, font: "NunitoXB", fontSize: 12.5 }, { text: CONTACTS.phone, fontSize: 9.2 }, { text: CONTACTS.address.join("\n"), fontSize: 8.4, noWrap: true }],
          color: "#fff", alignment: "right", margin: [8, 13, 15, 13] }
      ]] },
      layout: noLines(C.accent), margin: [0, 18, 0, 0], unbreakable: true
    });

    return {
      pageSize: "A4",
      pageMargins: [45, 45, 45, 51], // 16 мм, внизу 18 мм под колонтитул
      info: { title: "Экспресс-диагностика AI-зрелости. " + (a.company || ""), author: "AI Research Labs" },
      defaultStyle: { font: "Nunito", fontSize: 9.8, lineHeight: 1.3, color: C.ink2 },
      content: content,
      footer: function (page, pages) {
        return { columns: [{ text: "AI Research Labs · airl.kz" }, { text: page + " / " + pages, alignment: "right" }],
                 fontSize: 8, color: C.muted, margin: [45, 22, 45, 0] };
      },
      // Заголовок раздела не остаётся последней строкой страницы.
      pageBreakBefore: function (node, following) { return node.headlineLevel === 1 && following.length < 2; }
    };
  }

  function summaryPdf(a, r) {
    return preparePdf().then(function (assets) {
      return new Promise(function (res, rej) {
        var timer = setTimeout(function () { rej(new Error("pdf timeout")); }, 20000);
        try {
          window.pdfMake.createPdf(buildDoc(a, r, assets), null, assets.fonts, assets.vfs)
            .getBlob(function (blob) { clearTimeout(timer); res(blob); });
        } catch (e) { clearTimeout(timer); rej(e); }
      });
    });
  }
  function pdfName(a) {
    var c = String(a.company || "клиент").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    return "Экспресс-диагностика AI. " + c + ".pdf";
  }

  /* ---------------- Отправка ---------------- */

  // parts.summary — сводка для менеджера из основного скрипта (tgMessage),
  // parts.managerHtml / parts.managerFile — прежний отчёт менеджера.
  function deliver(a, r, parts) {
    var sent = { message: false, pdf: false, html: false };
    var paragraph = clientParagraph(a, r);
    var link = contactLink(a.contact, paragraph);

    return groupWithin(4000).then(function (g) {
      var summary = String(parts.summary || "").slice(0, 2600); // место под абзац: лимит Telegram 4096
      var linkLine = !link ? "Контакт не похож на номер WhatsApp или ник Telegram: свяжитесь вручную."
        : link.kind === "whatsapp"
          ? '👉 <a href="' + esc(link.url) + '">Отправить клиенту разбор в WhatsApp</a>\nPDF придёт следом: приложите его в тот же чат.'
          : '👉 <a href="' + esc(link.url) + '">Написать клиенту в Telegram</a>\nСкопируйте абзац ниже и приложите PDF, он придёт следом.';
      var html = [esc(summary), "", esc(groupLine(g)), linkLine, "", "<b>Абзац для клиента:</b>", esc(paragraph)].join("\n");
      var plain = [summary, "", groupLine(g), link ? (link.kind === "whatsapp" ? "WhatsApp клиента: " : "Telegram клиента: ") + link.url : "",
                   "", "Абзац для клиента:", paragraph].join("\n").slice(0, 4000);
      // Если Telegram не принял разметку, сводка всё равно должна дойти.
      return sendMessage(html, true).catch(function () { return sendMessage(plain, false); })
        .then(function () { sent.message = true; }, function (e) { console.error("telegram message:", e); });
    }).then(function () {
      return summaryPdf(a, r).then(function (blob) {
        return sendDocument(blob, pdfName(a), "PDF-summary для клиента: " + [a.name, a.company].filter(Boolean).join(", ") +
          ". Приложите в чат с клиентом после абзаца.");
      }).then(function () { sent.pdf = true; }, function (e) { console.error("summary pdf:", e); });
    }).then(function () {
      if (!parts.managerHtml) return;
      return sendDocument(new Blob([parts.managerHtml], { type: "text/html" }), parts.managerFile || "otchet.html",
          "Отчёт для менеджера: " + [a.name, a.company].filter(Boolean).join(", ") + (a.contact ? " · " + a.contact : ""))
        .then(function () { sent.html = true; }, function (e) { console.error("manager report:", e); });
    }).then(function () { return sent; });
  }

  return { deliver: deliver, group: group, groupReady: groupReady, clientParagraph: clientParagraph,
           contactLink: contactLink, summaryPdf: summaryPdf, buildDoc: buildDoc, preparePdf: preparePdf, pdfName: pdfName };
})();
