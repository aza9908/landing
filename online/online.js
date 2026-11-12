// Онлайн-урок (online.airl.kz): форма регистрации, нижняя кнопка на телефоне, тень у шапки.
// Форма и проверки — как на странице воркшопа, но без поля «Город».
// Регистрация уходит в Google Apps Script «Заявки с сайта воркшопа» (form=online):
// он пишет её в таблицу «Онлайн-урок 19 ноября — регистрации» и создаёт сделку
// в Битриксе, воронка «Вебинар», этап «Регистрации».
// После регистрации — страница «Спасибо», оттуда переход в сообщество WhatsApp.
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwUzcJovHizktKKgPKnBjWKrOtmVdOreT6N9-hL-wqGW1OuubTy9y-WUA1tgq2kXAzqZA/exec';
  // Страница открыта на online.airl.kz/ или как airl.kz/online/ — «Спасибо» лежит рядом
  var base = location.pathname.indexOf('/online') === 0 ? '/online' : '';
  var modal = document.getElementById('lead-modal');
  var form = document.getElementById('lead-form');
  var submit = form.querySelector('[type=submit]');
  var field = function (n) { return form.elements.namedItem(n); };
  var fields = ['name', 'phone'];
  var utm = {};
  var query = new URLSearchParams(location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
    if (query.get(k)) utm[k] = query.get(k).slice(0, 200);
  });

  // Номер приводим к виду 7XXXXXXXXXX: 8 в начале, лишняя 7 и любые разделители убираются
  function digits(v) {
    var d = v.replace(/\D/g, '');
    if (d.indexOf('8') === 0) d = '7' + d.slice(1);
    if (d && d.indexOf('7') !== 0) d = '7' + d;
    if (d.indexOf('78') === 0) d = '7' + d.slice(2);
    if (d.length > 11 && d.indexOf('77') === 0) d = d.slice(1);
    return d.slice(0, 11);
  }
  function pretty(v) {
    var d = digits(v);
    if (!d) return '';
    var n = d.slice(1);
    return '+7 ' + [n.slice(0, 3), n.slice(3, 6), n.slice(6, 8), n.slice(8, 10)].filter(Boolean).join(' ');
  }
  var phone = field('phone');
  phone.addEventListener('input', function () { phone.value = pretty(phone.value); });
  phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+7 '; });
  phone.addEventListener('blur', function () { if (phone.value.trim() === '+7') phone.value = ''; });

  function check(n) {
    var v = field(n).value.trim();
    if (n === 'name') return v.length >= 2 ? '' : 'Напишите имя';
    var d = digits(v);
    if (d.length <= 1) return 'Укажите телефон';
    return d.length === 11 ? '' : 'Проверьте номер: нужно +7 и 10 цифр';
  }
  function show(n, err) {
    var box = field(n).closest('.field');
    box.classList.toggle('has-error', !!err);
    box.querySelector('[data-error-for="' + n + '"]').textContent = err;
  }
  fields.forEach(function (n) {
    var el = field(n);
    el.addEventListener('blur', function () { if (el.value.trim()) show(n, check(n)); });
    el.addEventListener('input', function () { if (el.closest('.field').classList.contains('has-error')) show(n, check(n)); });
  });

  // Окно регистрации; «Назад» на телефоне закрывает окно, а не уходит со страницы
  function open() {
    if (modal.open) return;
    modal.showModal();
    document.body.classList.add('modal-open');
    history.pushState({ leadModal: true }, '');
    if (matchMedia('(min-width: 480px)').matches) field('name').focus();
  }
  function close() {
    if (history.state && history.state.leadModal) history.back(); else modal.close();
  }
  addEventListener('popstate', function () { if (modal.open) modal.close(); });
  modal.addEventListener('close', function () {
    document.body.classList.remove('modal-open');
    if (history.state && history.state.leadModal) history.back();
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-form]')) open();
    else if (e.target.closest('[data-close-form]')) close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    fields.forEach(function (n) {
      var err = check(n);
      show(n, err);
      if (err && !first) first = field(n);
    });
    if (first) { first.focus(); return; }
    if (submit.disabled) return;
    var body = new URLSearchParams(Object.assign({
      form: 'online',
      name: field('name').value.trim(),
      phone: pretty(phone.value),
      page: location.origin + location.pathname,
      website: field('website').value,
    }, utm));
    submit.disabled = true;
    submit.textContent = 'Отправляем…';
    // Ответ скрипта Google страница прочитать не может (no-cors), поэтому ждём окончания
    // отправки, но не дольше 4 секунд, и переходим на «Спасибо»
    var done = false;
    var next = function () {
      if (done) return;
      done = true;
      // Метка для страницы «Спасибо»: по ней она понимает, что человек пришёл из формы
      try { sessionStorage.setItem('airl_online_reg', field('name').value.trim()); } catch (err) {}
      location.href = base + '/thankpage/';
    };
    setTimeout(next, 4000);
    fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: body, keepalive: true }).then(next, next);
  });
  // Вернулись кнопкой «Назад» со страницы «Спасибо» — форма снова готова
  addEventListener('pageshow', function () { submit.disabled = false; submit.textContent = 'Зарегистрироваться'; });

  var header = document.querySelector('.header');
  var shade = function () { header.classList.toggle('is-scrolled', scrollY > 4); };
  addEventListener('scroll', shade, { passive: true });
  shade();

  // Нижняя кнопка на телефоне: видна, когда первый экран пролистан, и прячется у финального блока
  var bar = document.querySelector('.sticky-cta');
  if ('IntersectionObserver' in window) {
    var past = false, atEnd = false;
    var sync = function () { bar.classList.toggle('is-visible', past && !atEnd); };
    new IntersectionObserver(function (es) {
      past = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; sync();
    }).observe(document.getElementById('hero-end'));
    new IntersectionObserver(function (es) { atEnd = es[0].isIntersecting; sync(); })
      .observe(document.getElementById('final-cta'));
  }
})();
