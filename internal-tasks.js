/* AI Research Labs — внутренние задачи (мини-Trello).
   Открывается из меню («Задачи»). Три колонки статусов, исполнители
   Азамат / Куаныш / Жанибек, дедлайны с подсветкой просрочки.
   Хранение: Firestore (если настроен firebase-bridge), иначе localStorage.
   Обновления уходят в Telegram-канал, когда он будет подключён. */
(function () {
  'use strict';

  var PEOPLE = ['Азамат', 'Куаныш', 'Жанибек'];
  var STATUSES = [
    { id: 'todo', label: 'Сделать' },
    { id: 'doing', label: 'В работе' },
    { id: 'done', label: 'Готово' },
  ];

  var CSS = [
    '.tk-overlay{position:fixed;inset:0;z-index:1100;background:#0a0a10d9;backdrop-filter:blur(12px);display:none;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto}',
    '.tk-overlay.open{display:flex}',
    '.tk-panel{background:#14141c;border:1px solid #ffffff1f;border-radius:20px;width:min(1080px,100%);padding:24px;margin:auto 0}',
    '.tk-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}',
    '.tk-title{color:#fff;font-family:"Inter Tight",sans-serif;font-size:22px;font-weight:600;margin:0}',
    '.tk-hint{color:#8a8aa5;font-family:"Victor Mono",monospace;font-size:11px;margin:4px 0 0}',
    '.tk-close{width:34px;height:34px;border-radius:50%;border:1px solid #ffffff22;background:transparent;color:#fff;cursor:pointer;font-size:14px}',
    '.tk-new{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:20px}',
    '.tk-inp,.tk-sel{background:#0f0f16;border:1px solid #ffffff1f;border-radius:10px;color:#fff;font-family:"Inter Tight",sans-serif;font-size:14px;padding:11px 12px;outline:none;width:100%;box-sizing:border-box}',
    '.tk-inp:focus,.tk-sel:focus{border-color:#8f7bf0}',
    '.tk-add{background:#6c5ce0;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-family:"Inter Tight",sans-serif;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.tk-board{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}',
    '.tk-col{background:#0f0f16;border:1px solid #ffffff12;border-radius:14px;padding:12px;min-height:120px}',
    '.tk-col-h{color:#b9a4ff;font-family:"Victor Mono",monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:2px 4px 10px;display:flex;justify-content:space-between}',
    '.tk-card{background:#191924;border:1px solid #ffffff14;border-radius:12px;padding:12px;margin-bottom:8px}',
    '.tk-card-t{color:#fff;font-family:"Inter Tight",sans-serif;font-size:14px;font-weight:500;margin:0 0 8px;line-height:1.35}',
    '.tk-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.tk-chip{font-family:"Victor Mono",monospace;font-size:10.5px;padding:3px 9px;border-radius:12px;border:1px solid #ffffff1f;color:#c9c9dd}',
    '.tk-chip--p{background:#6c5ce01f;border-color:#6c5ce055;color:#c4b5fd}',
    '.tk-chip--late{background:#e0455c22;border-color:#e0455c66;color:#ff9aa8}',
    '.tk-act{display:flex;gap:6px;margin-top:10px}',
    '.tk-btn{flex:1;background:transparent;border:1px solid #ffffff22;border-radius:8px;color:#c9c9dd;font-family:"Victor Mono",monospace;font-size:10.5px;padding:6px 4px;cursor:pointer}',
    '.tk-btn:hover{border-color:#8f7bf0;color:#fff}',
    '.tk-panel *{touch-action:manipulation}',
    '.tk-inp,.tk-sel{font-size:16px}',
    '.tk-deadline-edit{background:transparent;border:none;color:inherit;font:inherit;padding:0;width:auto}',
    '.tk-chip--click{cursor:pointer;text-decoration:underline dotted}',
    '.tk-btn--del{flex:0 0 34px;color:#ff9aa8}',
    '.tk-empty{color:#55556a;font-family:"Victor Mono",monospace;font-size:11px;text-align:center;padding:14px 4px}',
    '.tk-badge{display:inline-block;font-size:10px;color:#8a8aa5;font-family:"Victor Mono",monospace;margin-left:8px}',
    '@media(max-width:860px){.tk-board{grid-template-columns:1fr}.tk-new{grid-template-columns:1fr 1fr}.tk-new .tk-inp:first-child{grid-column:1/-1}.tk-add{grid-column:1/-1}}',
  ].join('\n');

  var overlay, boardEl, tasks = [];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return p.length === 3 ? p[2] + '.' + p[1] : d;
  }

  function isLate(t) {
    return t.deadline && t.status !== 'done' && t.deadline < new Date().toISOString().slice(0, 10);
  }

  function notify(msg) {
    if (window.AIRL_notifyTelegram) window.AIRL_notifyTelegram(msg);
  }

  function render() {
    boardEl.innerHTML = '';
    STATUSES.forEach(function (st) {
      var col = el('div', 'tk-col');
      var inCol = tasks.filter(function (t) { return (t.status || 'todo') === st.id; });
      col.appendChild(el('div', 'tk-col-h', st.label + '<span>' + inCol.length + '</span>'));
      if (!inCol.length) col.appendChild(el('div', 'tk-empty', '— пусто —'));
      inCol.forEach(function (t) {
        var card = el('div', 'tk-card');
        card.appendChild(el('p', 'tk-card-t', t.title));
        var meta = el('div', 'tk-meta');
        meta.appendChild(el('span', 'tk-chip tk-chip--p', t.assignee || '—'));
        var dl = el('span',
          'tk-chip tk-chip--click' + (isLate(t) ? ' tk-chip--late' : ''),
          t.deadline
            ? '⏰ ' + fmtDate(t.deadline) + (isLate(t) ? ' · просрочено' : '')
            : '⏰ дедлайн');
        dl.title = 'Нажмите, чтобы изменить дедлайн';
        dl.addEventListener('click', function () {
          var d = el('input', 'tk-inp');
          d.type = 'date';
          d.value = t.deadline || '';
          d.style.cssText = 'width:150px;padding:6px 8px;font-size:16px';
          dl.replaceWith(d);
          d.focus();
          if (d.showPicker) { try { d.showPicker(); } catch (e) {} }
          function commit() {
            t.deadline = d.value || '';
            render();
            window.AIRL_tasks.save(t);
            if (d.value) notify('⏰ «' + t.title + '» — новый дедлайн ' + fmtDate(d.value));
          }
          d.addEventListener('change', commit);
          d.addEventListener('blur', commit);
        });
        meta.appendChild(dl);
        card.appendChild(meta);
        var act = el('div', 'tk-act');
        STATUSES.forEach(function (s2) {
          if (s2.id === st.id) return;
          var b = el('button', 'tk-btn', '→ ' + s2.label);
          b.addEventListener('click', function () {
            t.status = s2.id;
            render();
            window.AIRL_tasks.save(t);
            notify('📋 «' + t.title + '» (' + t.assignee + ') → ' + s2.label);
          });
          act.appendChild(b);
        });
        var del = el('button', 'tk-btn tk-btn--del', '✕');
        del.addEventListener('click', function () {
          if (!confirm('Удалить задачу «' + t.title + '»?')) return;
          tasks = tasks.filter(function (x) { return x.id !== t.id; });
          render();
          window.AIRL_tasks.remove(t.id);
          notify('🗑 Задача удалена: «' + t.title + '»');
        });
        act.appendChild(del);
        card.appendChild(act);
        col.appendChild(card);
      });
      boardEl.appendChild(col);
    });
  }

  function load() {
    window.AIRL_tasks.list().then(function (list) {
      tasks = list || [];
      render();
    });
  }

  function build() {
    var style = el('style', null);
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = el('div', 'tk-overlay');
    var panel = el('div', 'tk-panel');

    var head = el('div', 'tk-head');
    var hLeft = el('div');
    hLeft.appendChild(el('h3', 'tk-title', 'Внутренние задачи'));
    var hint = el('p', 'tk-hint', 'Азамат · Куаныш · Жанибек');
    hLeft.appendChild(hint);
    var close = el('button', 'tk-close', '✕');
    close.addEventListener('click', function () { overlay.classList.remove('open'); });
    head.appendChild(hLeft);
    head.appendChild(close);
    panel.appendChild(head);

    var form = el('div', 'tk-new');
    var inp = el('input', 'tk-inp');
    inp.placeholder = 'Новая задача';
    var selP = el('select', 'tk-sel');
    PEOPLE.forEach(function (p) {
      var o = el('option', null, p);
      o.value = p;
      selP.appendChild(o);
    });
    var date = el('input', 'tk-inp');
    date.type = 'date';
    var add = el('button', 'tk-add', '+ Добавить');
    add.addEventListener('click', function () {
      var title = inp.value.trim();
      if (title.length < 2) { inp.focus(); return; }
      var t = {
        title: title,
        assignee: selP.value,
        deadline: date.value || '',
        status: 'todo',
        createdAt: new Date().toISOString(),
      };
      t.id = 'tmp' + Date.now();
      tasks.unshift(t);
      render();
      inp.value = '';
      date.value = '';
      window.AIRL_tasks.save(Object.assign({}, t, { id: t.id.indexOf('tmp') === 0 ? undefined : t.id }))
        .then(function (id) { if (id) t.id = id; });
      notify('🆕 Новая задача: «' + title + '» — ' + selP.value +
        (date.value ? ', дедлайн ' + fmtDate(date.value) : ''));
    });
    form.appendChild(inp);
    form.appendChild(selP);
    form.appendChild(date);
    form.appendChild(add);
    panel.appendChild(form);

    boardEl = el('div', 'tk-board');
    panel.appendChild(boardEl);

    if (window.AIRL_tasks) {
      window.AIRL_tasks.isCloud().then(function (cloud) {
        hint.innerHTML = 'Азамат · Куаныш · Жанибек <span class="tk-badge">' +
          (cloud ? '☁ синхронизация: Firestore' : '⚠ локальный режим — подключите Firebase в firebase-bridge.js') +
          '</span>';
      });
    }

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
    document.body.appendChild(overlay);
  }

  window.AIRL_openTasks = function () {
    if (!overlay) build();
    overlay.classList.add('open');
    load();
  };

  /* Ссылка «Задачи» — в конце страницы, в футере (белая) */
  function addFooterLink() {
    var spots = ['.footer-caption .footer-info', '.blog-footer'];
    spots.forEach(function (sel) {
      var host = document.querySelector(sel);
      if (!host || host.querySelector('[data-tk]')) return;
      var a = el('a', 'tk-footer-link', 'Задачи');
      a.href = '#';
      a.dataset.tk = '1';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.AIRL_openTasks();
      });
      host.appendChild(a);
    });
    if (!document.getElementById('tk-footer-css')) {
      var st = el('style');
      st.id = 'tk-footer-css';
      st.textContent =
        '.tk-footer-link{color:#fff !important;text-decoration:none;font-family:"Victor Mono",monospace;' +
        'font-size:13px;opacity:.85;cursor:pointer;display:inline-block;margin-top:6px}' +
        '.tk-footer-link:hover{opacity:1;text-decoration:underline}' +
        '.blog-footer .tk-footer-link,[data-theme="light"] .lp-footer .tk-footer-link{color:inherit !important}';
      document.head.appendChild(st);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(addFooterLink, 800); });
  } else {
    setTimeout(addFooterLink, 800);
  }
})();
