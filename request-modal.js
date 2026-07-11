/* Global «Оставить заявку» modal — AI Research Lab.
   Self-contained: injects its own styles, binds every CTA on the page.
   Submission opens WhatsApp (8 707 231-49-55) with a prefilled message
   and shows a success state. Swap sendRequest() for a backend later. */
(function () {
  'use strict';

  var WHATSAPP = '77072314955';

  var CSS = [
    '.rq-overlay{position:fixed;inset:0;z-index:1000;background:#0a0a10cc;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .25s}',
    '.rq-overlay.open{opacity:1;pointer-events:auto}',
    '.rq-modal{background:#16161f;border:1px solid #ffffff1f;border-radius:20px;padding:28px;width:min(420px,100%);position:relative;transform:translateY(14px);transition:transform .25s;box-shadow:0 24px 80px #00000066}',
    '.rq-overlay.open .rq-modal{transform:translateY(0)}',
    '.rq-close{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid #ffffff22;background:transparent;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.rq-close:hover{background:#ffffff12}',
    '.rq-title{color:#fff;font-family:"Inter Tight",sans-serif;font-size:24px;font-weight:600;letter-spacing:-.02em;margin:0 0 6px}',
    '.rq-sub{color:#9a9ab5;font-family:"Victor Mono",monospace;font-size:13px;line-height:1.5;margin:0 0 20px}',
    '.rq-fields{display:flex;flex-direction:column;gap:10px}',
    '.rq-input{background:#0f0f16;border:1px solid #ffffff1f;border-radius:12px;color:#fff;font-family:"Inter Tight",sans-serif;font-size:15px;padding:13px 16px;width:100%;box-sizing:border-box;outline:none;transition:border-color .2s}',
    '.rq-input:focus{border-color:#8f7bf0}',
    '.rq-input::placeholder{color:#ffffff55}',
    '.rq-err{color:#ff9a9a;font-family:"Victor Mono",monospace;font-size:12px;margin:8px 0 0;min-height:16px}',
    '.rq-btn{margin-top:14px;width:100%;background:#fff;color:#16161a;border:none;border-radius:28px;padding:14px 22px;font-family:"Inter Tight",sans-serif;font-size:16px;font-weight:600;cursor:pointer;transition:transform .15s}',
    '.rq-btn:hover{transform:translateY(-1px)}',
    '.rq-done{text-align:center;padding:18px 0 8px}',
    '.rq-done-icon{width:52px;height:52px;border-radius:50%;background:#6c5ce0;color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}',
    '.rq-done p{color:#c9c9dd;font-family:"Victor Mono",monospace;font-size:13px;line-height:1.55;margin:6px 0 0}',
    'body.rq-lock{overflow:hidden}',
    '[data-theme="light"] .rq-modal{background:#fff;border-color:#00000014}',
    '[data-theme="light"] .rq-title{color:#16161a}',
    '[data-theme="light"] .rq-close{color:#16161a;border-color:#00000022}',
    '[data-theme="light"] .rq-input{background:#f2f2f8;border-color:#00000014;color:#16161a}',
    '[data-theme="light"] .rq-input::placeholder{color:#00000055}',
    '[data-theme="light"] .rq-btn{background:#16161a;color:#fff}',
    '[data-theme="light"] .rq-done p{color:#4a4a5e}',
  ].join('\n');

  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  var overlay, form, done, errEl, inName, inSurname, inPhone;

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = h('div', 'rq-overlay');
    var modal = h('div', 'rq-modal');
    var close = h('button', 'rq-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');

    form = h('div', 'rq-form');
    form.appendChild(h('p', 'rq-title', 'Оставить заявку'));
    form.appendChild(
      h('p', 'rq-sub', 'Количество мест ограничено — мы свяжемся с вами и расскажем детали.')
    );
    var fields = h('div', 'rq-fields');
    inName = h('input', 'rq-input');
    inName.placeholder = 'Имя';
    inName.type = 'text';
    inSurname = h('input', 'rq-input');
    inSurname.placeholder = 'Фамилия';
    inSurname.type = 'text';
    inPhone = h('input', 'rq-input');
    inPhone.placeholder = 'Номер телефона';
    inPhone.type = 'tel';
    fields.appendChild(inName);
    fields.appendChild(inSurname);
    fields.appendChild(inPhone);
    form.appendChild(fields);
    errEl = h('p', 'rq-err', '');
    form.appendChild(errEl);
    var submit = h('button', 'rq-btn', 'Оставить заявку');
    submit.type = 'button';
    submit.addEventListener('click', sendRequest);
    form.appendChild(submit);

    done = h('div', 'rq-done');
    done.style.display = 'none';

    modal.appendChild(close);
    modal.appendChild(form);
    modal.appendChild(done);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    close.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(context) {
    overlay.dataset.context = context || '';
    form.style.display = '';
    done.style.display = 'none';
    errEl.textContent = '';
    overlay.classList.add('open');
    document.body.classList.add('rq-lock');
    setTimeout(function () { inName.focus(); }, 250);
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.classList.remove('rq-lock');
  }

  function sendRequest() {
    var name = inName.value.trim();
    var surname = inSurname.value.trim();
    var phone = inPhone.value.trim();
    if (name.length < 2 || surname.length < 2) {
      errEl.textContent = 'Пожалуйста, укажите имя и фамилию';
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      errEl.textContent = 'Пожалуйста, укажите корректный номер телефона';
      return;
    }
    var ctx = overlay.dataset.context ? ' (' + overlay.dataset.context + ')' : '';
    var text =
      'Заявка с сайта AI Research Lab' + ctx + '\n' +
      'Имя: ' + name + ' ' + surname + '\n' +
      'Телефон: ' + phone;
    if (window.AIRL_saveRequest) {
      window.AIRL_saveRequest({
        name: name,
        surname: surname,
        phone: phone,
        page: overlay.dataset.context || '',
        url: location.href,
      });
    }
    if (window.AIRL_notifyTelegram) window.AIRL_notifyTelegram('🔔 ' + text);
    window.open(
      'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text),
      '_blank'
    );
    form.style.display = 'none';
    done.style.display = '';
    done.innerHTML =
      '<div class="rq-done-icon">✓</div>' +
      '<p class="rq-title" style="font-size:20px">Заявка сформирована</p>' +
      '<p>Спасибо, ' + name + '! Подтвердите отправку в WhatsApp —<br>и мы свяжемся с вами в ближайшее время.</p>';
  }

  function pageContext() {
    var p = location.pathname;
    if (p.indexOf('ai-for-work') !== -1) return 'AI for work';
    if (p.indexOf('ai-for-leaders') !== -1) return 'AI for leaders';
    if (p.indexOf('blog') !== -1) return 'Блог';
    return 'Главная';
  }

  var TRIGGER_RE = /(оставить заявку|начать обучение|регистрация)/i;

  function bindTriggers() {
    document.addEventListener(
      'click',
      function (e) {
        var el = e.target.closest('a, button, .lp-stamp');
        if (!el) return;
        if (el.closest('.rq-overlay')) return;
        var txt = (el.textContent || '').trim();
        if (!TRIGGER_RE.test(txt)) return;
        e.preventDefault();
        openModal(pageContext());
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      build();
      bindTriggers();
    });
  } else {
    build();
    bindTriggers();
  }
})();
