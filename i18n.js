/* AI Research Lab — трёхъязычный переключатель (RU / EN / KZ).
   Работает поверх готовой вёрстки: заменяет текстовые узлы по словарю.
   Русский — исходный язык (ключи словаря). MutationObserver повторно
   применяет перевод после ре-рендеров Vue. Тексты статей блога остаются
   на русском (помечено в словаре ниже — добавляйте переводы по мере готовности). */
(function () {
  'use strict';

  var KEY = 'airl-lang';

  var DICT = {
    en: {
      'О нас': 'About',
      'Блог': 'Blog',
      'Корп обучение': 'Corporate training',
      'Кто мы': 'Who we are',
      'Мероприятия': 'Events',
      'Контакты': 'Contacts',
      'Начать обучение': 'Start learning',
      'Оставить заявку': 'Leave a request',
      'Регистрация': 'Registration',
      'Регистрация 🎫': 'Registration 🎫',
      'Регистрация ↗': 'Registration ↗',
      'Оставить заявку ↗': 'Leave a request ↗',
      '← Назад': '← Back',
      '← На главную': '← Home',
      'Главная': 'Home',
      'Задачи': 'Tasks',
      'Центр прикладного ИИ. Мы готовим кадры для цифровой экономики Казахстана':
        'Applied AI center. We train talent for the digital economy of Kazakhstan',
      'Анонс и история мероприятий центра, на которых можно познакомиться ближе с тем, что мы делаем':
        'Announcements and history of our events — the closest way to see what we do',
      'Скоро': 'Soon',
      'г. Астана': 'Astana',
      'г. Алматы': 'Almaty',
      'Алматы': 'Almaty',
      'Астана': 'Astana',
      '📍 Локация будет анонсирована': '📍 Location to be announced',
      'Программа': 'Program',
      'Результаты': 'Results',
      'Для кого': 'For whom',
      'Что вы получите': 'What you will get',
      'Что вы заберёте': 'What you will take away',
      'Два дня — два готовых продукта': 'Two days — two finished products',
      'День 1': 'Day 1',
      'День 2': 'Day 2',
      'Утро': 'Morning',
      'День': 'Day',
      'Все права защищены (с) 2026': 'All rights reserved (c) 2026',
      'Количество мест ограничено — мы свяжемся с вами и расскажем детали.':
        'Seats are limited — we will contact you with the details.',
      'Имя': 'First name',
      'Фамилия': 'Last name',
      'Номер телефона': 'Phone number',
      'Заявка сформирована': 'Request created',
      'Все статьи': 'All articles',
      '← Все статьи': '← All articles',
      'Статьи, аналитика и кейсы о применении искусственного интеллекта в бизнесе, образовании и общепите':
        'Articles, analytics and cases on applying AI in business, education and hospitality',
      'Внутренние задачи': 'Internal tasks',
      'Новая задача': 'New task',
      'Дедлайн': 'Deadline',
      'Сделать': 'To do',
      'В работе': 'In progress',
      'Готово': 'Done',
      'Мы обучаем команды и специалистов практическим навыкам работы': 'We train teams and professionals in practical, hands-on',
      'с искусственным интеллектом.': 'work with artificial intelligence.',
      'флагманские программы': 'flagship programs',
      'экспертов-практиков': 'expert practitioners',
      'города — Алматы и Астана': 'cities — Almaty and Astana',
    },
    kz: {
      'О нас': 'Біз туралы',
      'Блог': 'Блог',
      'Корп обучение': 'Корпоративтік оқыту',
      'Кто мы': 'Біз кімбіз',
      'Мероприятия': 'Іс-шаралар',
      'Контакты': 'Байланыс',
      'Начать обучение': 'Оқуды бастау',
      'Оставить заявку': 'Өтінім қалдыру',
      'Регистрация': 'Тіркелу',
      'Регистрация 🎫': 'Тіркелу 🎫',
      'Регистрация ↗': 'Тіркелу ↗',
      'Оставить заявку ↗': 'Өтінім қалдыру ↗',
      '← Назад': '← Артқа',
      '← На главную': '← Басты бетке',
      'Главная': 'Басты бет',
      'Задачи': 'Тапсырмалар',
      'Центр прикладного ИИ. Мы готовим кадры для цифровой экономики Казахстана':
        'Қолданбалы ЖИ орталығы. Біз Қазақстанның цифрлық экономикасына мамандар дайындаймыз',
      'Анонс и история мероприятий центра, на которых можно познакомиться ближе с тем, что мы делаем':
        'Орталық іс-шараларының анонсы мен тарихы — не істейтінімізбен жақынырақ танысу мүмкіндігі',
      'Скоро': 'Жақында',
      'г. Астана': 'Астана қ.',
      'г. Алматы': 'Алматы қ.',
      'Алматы': 'Алматы',
      'Астана': 'Астана',
      '📍 Локация будет анонсирована': '📍 Орны кейін жарияланады',
      'Программа': 'Бағдарлама',
      'Результаты': 'Нәтижелер',
      'Для кого': 'Кімге арналған',
      'Что вы получите': 'Сіз не аласыз',
      'Что вы заберёте': 'Өзіңізбен не аласыз',
      'Два дня — два готовых продукта': 'Екі күн — екі дайын өнім',
      'День 1': '1-күн',
      'День 2': '2-күн',
      'Утро': 'Таң',
      'День': 'Күн',
      'Все права защищены (с) 2026': 'Барлық құқықтар қорғалған (c) 2026',
      'Количество мест ограничено — мы свяжемся с вами и расскажем детали.':
        'Орын саны шектеулі — біз сізбен байланысып, толық мәлімет береміз.',
      'Имя': 'Аты',
      'Фамилия': 'Тегі',
      'Номер телефона': 'Телефон нөмірі',
      'Заявка сформирована': 'Өтінім қабылданды',
      'Все статьи': 'Барлық мақалалар',
      '← Все статьи': '← Барлық мақалалар',
      'Статьи, аналитика и кейсы о применении искусственного интеллекта в бизнесе, образовании и общепите':
        'Бизнес, білім беру және қоғамдық тамақтандыруда ЖИ қолдану туралы мақалалар, аналитика және кейстер',
      'Внутренние задачи': 'Ішкі тапсырмалар',
      'Новая задача': 'Жаңа тапсырма',
      'Дедлайн': 'Дедлайн',
      'Сделать': 'Істеу керек',
      'В работе': 'Жұмыста',
      'Готово': 'Дайын',
      'Мы обучаем команды и специалистов практическим навыкам работы': 'Біз командалар мен мамандарды практикалық дағдыларға үйретеміз —',
      'с искусственным интеллектом.': 'жасанды интеллектпен жұмыс істеуге.',
      'флагманские программы': 'флагмандық бағдарлама',
      'экспертов-практиков': 'сарапшы-практик',
      'города — Алматы и Астана': 'қала — Алматы және Астана',
    },
  };

  var originals = new WeakMap();
  var current = localStorage.getItem(KEY) || 'ru';
  var applying = false;

  function translateNode(node, lang) {
    var raw = originals.get(node);
    if (raw === undefined) {
      raw = node.nodeValue;
      originals.set(node, raw);
    }
    var key = raw.trim();
    if (!key) return;
    if (lang === 'ru') {
      if (node.nodeValue !== raw) node.nodeValue = raw;
      return;
    }
    var tr = DICT[lang] && DICT[lang][key];
    if (tr) {
      node.nodeValue = raw.replace(key, tr);
    } else if (node.nodeValue !== raw) {
      node.nodeValue = raw;
    }
  }

  function walk(root, lang) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var t = p.nodeName;
        if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = w.nextNode())) translateNode(n, lang);
  }

  function translatePlaceholders(lang) {
    document.querySelectorAll('input[placeholder]').forEach(function (inp) {
      var raw = inp.dataset.i18nPh || inp.placeholder;
      inp.dataset.i18nPh = raw;
      inp.placeholder = lang === 'ru' ? raw : (DICT[lang] && DICT[lang][raw]) || raw;
    });
  }

  function apply(lang) {
    current = lang;
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang === 'kz' ? 'kk' : lang;
    applying = true;
    walk(document.body, lang);
    translatePlaceholders(lang);
    applying = false;
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }

  var CSS = [
    '.lang-switch{display:inline-flex;gap:2px;background:#00000014;border:1px solid #ffffff2a;border-radius:20px;padding:3px;flex-shrink:0}',
    '.lang-btn{border:none;background:transparent;color:inherit;opacity:.6;font-family:"Victor Mono",monospace;font-size:11px;letter-spacing:.08em;padding:5px 9px;border-radius:14px;cursor:pointer;text-transform:uppercase}',
    '.lang-btn.active{background:#ffffff;color:#16161a;opacity:1;font-weight:600}',
    '.lang-switch--dark{background:#ffffff10;border-color:#ffffff2a;color:#fff}',
    '.lang-switch--light{background:#00000008;border-color:#00000022;color:#16161a}',
    '.lang-switch--light .lang-btn.active{background:#16161a;color:#fff}',
    '.m-menu-nav .lang-switch{margin-top:14px;align-self:center}',
  ].join('\n');

  function makeSwitch(variant) {
    var box = document.createElement('div');
    box.className = 'lang-switch ' + (variant || 'lang-switch--dark');
    ['ru', 'en', 'kz'].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn' + (l === current ? ' active' : '');
      b.dataset.lang = l;
      b.textContent = l;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        apply(l);
      });
      box.appendChild(b);
    });
    return box;
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Hero header (homepage) / lp header / blog topbar
    var spots = [
      { sel: '.header .btn-group', variant: 'lang-switch--dark' },
      { sel: '.floating-nav .nav-btn-group', variant: 'lang-switch--dark' },
      { sel: '.lp-actions', variant: 'lang-switch--dark' },
      { sel: '.blog-topbar', variant: 'lang-switch--dark' },
      { sel: '.m-menu-nav', variant: 'lang-switch--dark' },
    ];
    spots.forEach(function (s) {
      var host = document.querySelector(s.sel);
      if (host && !host.querySelector('.lang-switch')) host.appendChild(makeSwitch(s.variant));
    });

    apply(current);

    // Re-apply after Vue re-renders / dynamic inserts
    var mo = new MutationObserver(function (muts) {
      if (applying || current === 'ru') return;
      clearTimeout(mo._t);
      mo._t = setTimeout(function () {
        applying = true;
        walk(document.body, current);
        translatePlaceholders(current);
        applying = false;
      }, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 400); });
  } else {
    setTimeout(mount, 400);
  }
})();
