/*
  AIRL — форма заявки для лендинга airl.kz
  ----------------------------------------
  Один файл. Ничего не устанавливает, ничего в сайте не меняет.

  Подключение — одна строка перед </body>:

  <script src="/airl-lead.js" defer
          data-project="ВАШ-PROJECT-ID"
          data-key="ВАШ-WEB-API-KEY"
          data-whatsapp="77001234567"
          data-diagnostics="/diagnostics"></script>

  Скрипт сам находит на странице кнопки «Оставить заявку» и вешает на них
  открытие формы. Разметку кнопок трогать не нужно. Если нужно привязать
  конкретный элемент — добавьте ему атрибут data-airl-lead.

  Вся разметка формы живёт в Shadow DOM: стили сайта её не задевают,
  и она не задевает стили сайта.
*/

(function () {
  "use strict";

  var s = document.currentScript;
  var CFG = {
    project: (s && s.dataset.project) || "",
    key: (s && s.dataset.key) || "",
    whatsapp: (s && s.dataset.whatsapp) || "",
    diagnostics: (s && s.dataset.diagnostics) || "/diagnostics",
    collection: (s && s.dataset.collection) || "leads"
  };

  var TRIGGER_TEXT = /оставить\s+заявку|заявка|тапсырыс|leave\s+a\s+request/i;

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:"Inter Tight",Inter,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.wrap{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
    'justify-content:center;padding:16px;background:rgba(4,4,10,.72);backdrop-filter:blur(6px);',
    'opacity:0;transition:opacity .18s ease}',
    '.wrap.on{opacity:1}',
    '.card{width:min(520px,100%);max-height:92vh;overflow-y:auto;background:#12121C;',
    'color:#EDEDF5;border:1px solid #2A2A3C;border-radius:16px;padding:28px;',
    'transform:translateY(10px);transition:transform .18s ease}',
    '.wrap.on .card{transform:none}',
    '.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}',
    'h2{font-size:23px;font-weight:700;letter-spacing:-.01em;line-height:1.2}',
    '.sub{margin-top:8px;font-size:14px;line-height:1.5;color:#9A9AB0}',
    '.x{background:none;border:0;color:#6B6B85;font-size:26px;line-height:1;cursor:pointer;padding:0 2px}',
    '.x:hover{color:#EDEDF5}',
    'label{display:block;margin-top:16px;font-size:13px;font-weight:600;color:#C8C8DA}',
    'input,select,textarea{width:100%;margin-top:6px;padding:11px 13px;font-size:15px;',
    'color:#EDEDF5;background:#0B0B12;border:1px solid #2A2A3C;border-radius:9px;outline:none}',
    'input:focus,select:focus,textarea:focus{border-color:#5B5BCA;box-shadow:0 0 0 3px rgba(91,91,202,.25)}',
    'textarea{min-height:82px;resize:vertical;line-height:1.45}',
    'select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,#6B6B85 50%),',
    'linear-gradient(135deg,#6B6B85 50%,transparent 50%);background-position:calc(100% - 18px) 50%,',
    'calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat}',
    '.err{margin-top:6px;font-size:12.5px;color:#E2707A;display:none}',
    '.err.on{display:block}',
    'button.go{width:100%;margin-top:22px;padding:14px;font-size:15.5px;font-weight:700;',
    'color:#fff;background:#5B5BCA;border:0;border-radius:10px;cursor:pointer}',
    'button.go:hover{background:#6C6CD8}',
    'button.go[disabled]{opacity:.6;cursor:default}',
    '.note{margin-top:18px;text-align:center}',
    '.note p{font-size:14.5px;line-height:1.5;color:#6B6B85;margin-bottom:10px}',
    '.note a{display:block;padding:14px;font-size:15.5px;font-weight:700;',
    'color:#8A8AE0;background:#000;border:1px solid #2A2A3C;border-radius:10px;',
    'text-decoration:none;box-sizing:border-box}',
    '.note a:hover{background:#0d0d14;border-color:#5B5BCA}',
    '.ok{text-align:center;padding:14px 0}',
    '.ok .mark{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;',
    'background:rgba(91,91,202,.16);border:1px solid #5B5BCA;display:flex;align-items:center;',
    'justify-content:center;font-size:26px;color:#8A8AE0}',
    '.steps{margin-top:18px;text-align:left;border-top:1px solid #2A2A3C}',
    '.steps>div{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #2A2A3C;',
    'font-size:14px;line-height:1.45;color:#C8C8DA}',
    '.steps span{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px;',
    'color:#8A8AE0;font-weight:700;padding-top:2px}',
    '@media(max-width:520px){.card{padding:22px 18px}h2{font-size:20px}}',
    '@media(prefers-reduced-motion:reduce){.wrap,.card{transition:none}}'
  ].join("");

  var SIZES = ["1–10", "11–50", "51–200", "200+"];

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function field(label, name, opts) {
    opts = opts || {};
    var input;
    if (opts.tag === "select") {
      input = el("select", { name: name });
      (opts.options || []).forEach(function (o) {
        input.appendChild(el("option", { value: o, text: o }));
      });
    } else if (opts.tag === "textarea") {
      input = el("textarea", { name: name, maxlength: "500", placeholder: opts.placeholder || "" });
    } else {
      input = el("input", {
        name: name, type: opts.type || "text",
        placeholder: opts.placeholder || "", maxlength: opts.maxlength || "120",
        autocomplete: opts.autocomplete || "off"
      });
    }
    var wrap = el("div");
    wrap.appendChild(el("label", { text: label }));
    wrap.appendChild(input);
    wrap.appendChild(el("div", { "class": "err", "data-err": name }));
    return wrap;
  }

  /* Маска телефона: +7 (XXX) XXX XX XX. Код страны считаем фиксированным
     (Казахстан). Дальше десятого знака ничего не принимаем.

     «7» из «+7» в начале поля — это сама маска, а не цифра номера. Если
     считать её цифрой, она на каждом нажатии заново попадает в номер:
     набор 7011234567 превращался в +7 (777) 732 11 07. Поэтому, когда поле
     уже начинается с «+7», эту семёрку отбрасываем всегда.

     Поле без маски — это первое нажатие или вставка целого номера: тогда
     ведущая 7 или 8 перед десятью цифрами — код страны, а одиночная 8
     в начале — казахстанская «восьмёрка» вместо +7 (кодов операторов
     на 8 в Казахстане нет). */
  var MASK_PREFIX = /^\s*\+\s*7/;

  function formatPhone(raw) {
    var digits = raw.replace(/\D/g, "");
    if (MASK_PREFIX.test(raw)) {
      digits = digits.slice(1);
    } else if (digits.length > 10 && (digits.charAt(0) === "7" || digits.charAt(0) === "8")) {
      digits = digits.slice(1);
    } else if (digits.charAt(0) === "8") {
      digits = digits.slice(1);
    }
    digits = digits.slice(0, 10);
    if (!digits) {
      if (/^\s*\+\s*$/.test(raw)) return "+";            // начали набирать «+7»
      if (/^\s*(\+\s*7|8)\s*$/.test(raw)) return "+7 (";  // набрали «+7» или «8»
      return "";
    }
    var out = "+7 (" + digits.slice(0, 3);
    // Скобку ставим, только когда за ней есть цифра: висящую «)» в конце
    // Backspace стирает, а маска тут же возвращает — поле «залипает».
    if (digits.length > 3) out += ") " + digits.slice(3, 6);
    if (digits.length > 6) out += " " + digits.slice(6, 8);
    if (digits.length > 8) out += " " + digits.slice(8, 10);
    return out;
  }

  /* Переформатирование на каждое нажатие двигает курсор в конец, если его
     не возвращать явно — тогда правка цифры в середине номера превращается
     в правку в конце, и человек может отправить не тот номер, не заметив.
     Держим курсор там же, где он был, считая не позицию символа, а то,
     сколько цифр самого номера было до курсора — без «7» из маски,
     иначе курсор встаёт на одну цифру левее и цифры перемешиваются. */
  function countDigits(str, upTo) {
    var m = str.slice(0, upTo).match(/\d/g);
    var n = m ? m.length : 0;
    var mask = str.match(MASK_PREFIX);
    if (mask && upTo >= mask[0].length) n--;
    return Math.max(0, n);
  }
  function caretAfterDigits(str, n) {
    var mask = str.match(/^\s*\+\s*7\s*\(?/);
    var start = mask ? mask[0].length : 0;
    // Без маски в поле может быть только «» или «+» — курсор в конец.
    if (n <= 0) return mask ? start : str.length;
    var count = 0;
    for (var i = start; i < str.length; i++) {
      if (/\d/.test(str.charAt(i))) {
        count++;
        if (count === n) return i + 1;
      }
    }
    return str.length;
  }

  /* --- Firestore REST: пишем документ без SDK ------------------------- */

  function toFields(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === null || v === undefined || v === "") return;
      if (typeof v === "number") out[k] = { integerValue: String(v) };
      else if (typeof v === "boolean") out[k] = { booleanValue: v };
      else out[k] = { stringValue: String(v) };
    });
    return out;
  }

  function save(collection, data) {
    if (!CFG.project || !CFG.key) {
      return Promise.reject(new Error("не заданы data-project и data-key"));
    }
    var url = "https://firestore.googleapis.com/v1/projects/" + CFG.project +
      "/databases/(default)/documents/" + collection + "?key=" + CFG.key;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFields(data) })
    }).then(function (r) {
      if (!r.ok) throw new Error("Firestore " + r.status);
      return r.json();
    });
  }

  /* --- Модальное окно -------------------------------------------------- */

  var host = null;

  function close() {
    if (!host) return;
    var wrap = host.shadowRoot.querySelector(".wrap");
    wrap.classList.remove("on");
    setTimeout(function () {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = null;
      document.documentElement.style.overflow = "";
    }, 180);
  }

  function open() {
    if (host) return;
    host = el("div", { "data-airl-lead-root": "" });
    document.body.appendChild(host);
    document.documentElement.style.overflow = "hidden";

    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);

    var card = el("div", { "class": "card", role: "dialog", "aria-modal": "true",
      "aria-label": "Оставить заявку" });
    var wrap = el("div", { "class": "wrap" }, [card]);
    root.appendChild(wrap);

    var head = el("div");
    var top = el("div", { "class": "top" });
    top.appendChild(el("h2", { text: "Оставить заявку" }));
    var x = el("button", { "class": "x", "aria-label": "Закрыть", text: "×" });
    x.addEventListener("click", close);
    top.appendChild(x);
    head.appendChild(top);
    head.appendChild(el("div", { "class": "sub",
      text: "Заполните пять полей. Мы свяжемся в WhatsApp, договоримся о созвоне " +
            "и выдадим код группы для диагностики." }));

    var form = el("form", { novalidate: "" });
    form.appendChild(field("Компания", "company", { placeholder: "Название компании" }));
    form.appendChild(field("Как к вам обращаться", "name", { placeholder: "Ваше имя" }));
    var phoneWrap = field("WhatsApp или телефон", "phone", {
      type: "tel", placeholder: "+7 (700) 000 00 00", autocomplete: "tel", maxlength: "18"
    });
    form.appendChild(phoneWrap);
    var phoneInput = phoneWrap.querySelector("input");
    var lastPhone = "";
    phoneInput.addEventListener("input", function (e) {
      var oldValue = phoneInput.value;
      var caret = phoneInput.selectionStart == null ? oldValue.length : phoneInput.selectionStart;
      // Backspace стёр не цифру, а пробел или скобку маски — маска вернула бы
      // их обратно, и курсор стоял бы на месте. Стираем цифру перед ними.
      if (e && e.inputType === "deleteContentBackward" &&
          countDigits(oldValue, oldValue.length) === countDigits(lastPhone, lastPhone.length)) {
        var i = caret;
        while (i > 0 && !/\d/.test(oldValue.charAt(i - 1))) i--;
        var mask = oldValue.match(MASK_PREFIX);
        if (i > 0 && !(mask && i <= mask[0].length)) {
          oldValue = oldValue.slice(0, i - 1) + oldValue.slice(i);
          caret = i - 1;
        }
      }
      var digitsBeforeCaret = countDigits(oldValue, caret);
      phoneInput.value = formatPhone(oldValue);
      var newCaret = caretAfterDigits(phoneInput.value, digitsBeforeCaret);
      phoneInput.setSelectionRange(newCaret, newCaret);
      lastPhone = phoneInput.value;
    });
    form.appendChild(field("Сколько человек в команде", "team_size",
      { tag: "select", options: SIZES }));
    form.appendChild(field("Что хотите изменить", "wish",
      { tag: "textarea", placeholder: "Например: много ручной отчётности, менеджеры тонут в WhatsApp" }));

    var go = el("button", { "class": "go", type: "submit", text: "Отправить заявку" });
    form.appendChild(go);
    form.appendChild(el("div", { "class": "err", "data-err": "form" }));

    var note = el("div", { "class": "note" });
    note.appendChild(el("p", { text: "Уже есть код группы?" }));
    note.appendChild(el("a", { href: CFG.diagnostics, text: "Пройти диагностику" }));
    form.appendChild(note);

    card.appendChild(head);
    card.appendChild(form);

    function showErr(name, text) {
      var node = root.querySelector('[data-err="' + name + '"]');
      if (!node) return;
      node.textContent = text || "";
      node.classList.toggle("on", !!text);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var data = {
        company: (d.get("company") || "").trim(),
        name: (d.get("name") || "").trim(),
        phone: (d.get("phone") || "").trim(),
        team_size: d.get("team_size") || SIZES[0],
        wish: (d.get("wish") || "").trim()
      };
      ["company", "name", "phone", "form"].forEach(function (k) { showErr(k, ""); });

      var bad = false;
      if (data.company.length < 2) { showErr("company", "Напишите название компании"); bad = true; }
      if (data.name.length < 2) { showErr("name", "Напишите имя"); bad = true; }
      if (data.phone.replace(/\D/g, "").length < 10) {
        showErr("phone", "Проверьте номер — нужно не меньше 10 цифр"); bad = true;
      }
      if (bad) return;

      go.disabled = true;
      go.textContent = "Отправляем…";

      data.source = location.pathname;
      data.status = "new";
      data.created_at = new Date().toISOString();

      save(CFG.collection, data).then(function () {
        if (window.AIRL_notifyTelegram) {
          window.AIRL_notifyTelegram(
            "🔔 Заявка с сайта\n" +
            "Компания: " + data.company + "\n" +
            "Имя: " + data.name + "\n" +
            "Телефон: " + data.phone + "\n" +
            "Команда: " + data.team_size +
            (data.wish ? "\nЧто хотят изменить: " + data.wish : "") +
            "\nСтраница: " + data.source
          );
        }
        success(data.name);
      }).catch(function (err) {
        go.disabled = false;
        go.textContent = "Отправить заявку";
        var wa = CFG.whatsapp
          ? " Или напишите нам в WhatsApp: +" + CFG.whatsapp
          : "";
        showErr("form", "Не получилось отправить." + wa + " (" + err.message + ")");
      });
    });

    function success(name) {
      card.textContent = "";
      var ok = el("div", { "class": "ok" });
      ok.appendChild(el("div", { "class": "mark", text: "✓" }));
      ok.appendChild(el("h2", { text: "Заявка принята" }));
      ok.appendChild(el("div", { "class": "sub",
        text: (name ? name + ", мы" : "Мы") + " пришлём в WhatsApp ссылку на диагностику с кодом вашей группы и свяжемся " +
              "в течение рабочего дня." }));

      var steps = el("div", { "class": "steps" });
      [
        ["01", "Созвон 20 минут. Разберём, что у вас происходит, и договоримся о формате."],
        ["02", "Ссылка на экспресс-диагностику в WhatsApp: 8 вопросов, около 5 минут."],
        ["03", "Присылаем разбор: уровень AI-зрелости, главные боли и первые шаги."]
      ].forEach(function (row) {
        var d = el("div");
        d.appendChild(el("span", { text: row[0] }));
        d.appendChild(el("div", { text: row[1] }));
        steps.appendChild(d);
      });
      ok.appendChild(steps);

      var b = el("button", { "class": "go", text: "Понятно" });
      b.addEventListener("click", close);
      ok.appendChild(b);
      card.appendChild(ok);
    }

    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });

    requestAnimationFrame(function () {
      wrap.classList.add("on");
      var first = root.querySelector('input[name="company"]');
      if (first) first.focus();
    });
  }

  /* --- Поиск кнопок на странице --------------------------------------- */

  function attach() {
    var nodes = [].slice.call(
      document.querySelectorAll("[data-airl-lead], a, button, [role=button]")
    );
    nodes.forEach(function (n) {
      if (n.__airlLead) return;
      var isMarked = n.hasAttribute("data-airl-lead");
      var text = (n.textContent || "").trim();
      if (!isMarked && !(text.length < 40 && TRIGGER_TEXT.test(text))) return;
      n.__airlLead = true;
      n.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        open();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
  // Лендинг на Vue дорисовывает разделы после загрузки — ловим и их.
  new MutationObserver(attach).observe(document.documentElement, {
    childList: true, subtree: true
  });

  window.AIRLLead = { open: open, close: close };
})();
