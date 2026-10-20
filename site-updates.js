(function () {
  const LANG = window.AIRL_LANG || 'ru';
  // Внутренняя ссылка на языке страницы (/blog/ → /kk/blog/), см. lang-switch.js.
  const P = window.AIRL_PATH || ((path) => path);

  const AUDIENCES_BY_LANG = {
    ru: [
    {
      id: 'business',
      nav: 'Для бизнеса',
      title: 'Для бизнеса',
      short:
        'Обучение всей команды — от руководителей до сотрудников — применению ИИ в реальных задачах.',
      detail: [
        'Мы разрабатываем и проводим специализированные программы обучения искусственному интеллекту для организаций, управленческих команд и ключевых функций бизнеса. Обучение построено на логике полного цикла: от понимания технологий и мировых практик до применения ИИ в рабочих процессах.',
        'Кому подходят: топ-менеджмент и собственники бизнеса · руководители направлений HR, Finance, Marketing, Sales, Operations · проектные и продуктовые команды.',
      ],
    },
    {
      id: 'individuals',
      nav: 'Для частных лиц',
      title: 'Для частных лиц',
      short:
        'Навыки работы с ИИ раньше других и рост быстрее рынка — для предпринимателей, фрилансеров и всех, кому ИИ нужен уже сейчас.',
      detail: [
        'Мы проводим открытые программы для тех, кто хочет применять ИИ в своей работе уже сейчас. Обучаем на реальных задачах, даём датасеты и open-source инструменты, с которыми работают практики индустрии.',
        'Кому подходят: предприниматели и владельцы бизнеса · фрилансеры и специалисты · все, кто хочет освоить ИИ. Что получают: практические навыки, которые применяются сразу после программы, опыт работы с реальными датасетами и доступ к open-source инструментам без затрат на лицензии.',
      ],
    },
    {
      id: 'universities',
      nav: 'Для университетов',
      title: 'Для университетов',
      short:
        'Практические кейсы, тренеры-практики и подготовка, востребованная работодателями — для вузов, которые хотят дать студентам реальные навыки.',
      detail: [
        'Мы создаём прикладные лаборатории при вузах и разрабатываем программы, которые готовят студентов к реальной работе с ИИ. Обучение построено на практических кейсах и работе с реальными данными индустрии.',
        'Кому подходят: студенты и магистранты ИТ-специальностей · преподаватели и ППС. Университет получает тренеров-практиков, программу в кредитной системе как элективный курс, руководителей дипломных проектов, зачёт производственной и преддипломной практики и выпускников с навыками, которые нужны работодателям прямо сейчас.',
      ],
    },
    ],
    kk: [
    {
      id: 'business',
      nav: 'Бизнеске',
      title: 'Бизнеске',
      short:
        'Басшылардан бастап қызметкерлерге дейін бүкіл команданы ЖИ-ді нақты міндеттерде қолдануға оқыту.',
      detail: [
        'Біз ұйымдарға, басқарушы командаларға және бизнестің негізгі функцияларына арналған жасанды интеллект бойынша мамандандырылған оқу бағдарламаларын әзірлеп, өткіземіз. Оқыту толық цикл қағидатымен құрылған: технологиялар мен әлемдік тәжірибені түсінуден бастап ЖИ-ді жұмыс процестерінде қолдануға дейін.',
        'Кімге арналған: топ-менеджмент пен бизнес иелері · HR, Finance, Marketing, Sales, Operations бағыттарының басшылары · жобалық және өнімдік командалар.',
      ],
    },
    {
      id: 'individuals',
      nav: 'Жеке тұлғаларға',
      title: 'Жеке тұлғаларға',
      short:
        'ЖИ-мен жұмыс дағдыларын басқалардан бұрын меңгеріп, нарықтан жылдам өсу — кәсіпкерлерге, фрилансерлерге және ЖИ дәл қазір қажет әркімге.',
      detail: [
        'Біз ЖИ-ді өз жұмысында дәл қазір қолданғысы келетіндерге ашық бағдарламалар өткіземіз. Нақты міндеттер негізінде оқытамыз, сала практиктері жұмыс істейтін датасеттер мен open-source құралдарды береміз.',
        'Кімге арналған: кәсіпкерлер мен бизнес иелері · фрилансерлер мен мамандар · ЖИ-ді меңгергісі келетіндердің бәрі. Не алады: бағдарламадан кейін бірден қолдануға болатын практикалық дағдылар, нақты датасеттермен жұмыс тәжірибесі және лицензияға шығынсыз open-source құралдарға қолжетімділік.',
      ],
    },
    {
      id: 'universities',
      nav: 'Университеттерге',
      title: 'Университеттерге',
      short:
        'Практикалық кейстер, практик-тренерлер және жұмыс берушілер сұранысына сай дайындық — студенттерге нақты дағдылар бергісі келетін ЖОО-ларға.',
      detail: [
        'Біз ЖОО жанынан қолданбалы зертханалар ашып, студенттерді ЖИ-мен нақты жұмысқа даярлайтын бағдарламалар әзірлейміз. Оқыту практикалық кейстерге және саланың нақты деректерімен жұмысқа негізделген.',
        'Кімге арналған: IT мамандықтарының студенттері мен магистранттары · оқытушылар мен ПОҚ. Университет практик-тренерлерді, кредиттік жүйедегі элективті курс ретінде бағдарламаны, дипломдық жобалардың жетекшілерін, өндірістік және диплом алдындағы практиканың есепке алынуын, сондай-ақ жұмыс берушілерге дәл қазір қажет дағдылары бар түлектерді алады.',
      ],
    },
    ],
    en: [
    {
      id: 'business',
      nav: 'For business',
      title: 'For business',
      short:
        'Training for the whole team — from executives to staff — in applying AI to real business tasks.',
      detail: [
        'We design and deliver specialized AI training programs for organizations, leadership teams and key business functions. Each program follows a full-cycle approach: from understanding the technology and global best practices to putting AI to work in everyday processes.',
        'Who it\'s for: top management and business owners · heads of HR, Finance, Marketing, Sales and Operations · project and product teams.',
      ],
    },
    {
      id: 'individuals',
      nav: 'For individuals',
      title: 'For individuals',
      short:
        'AI skills ahead of the curve and growth that outpaces the market — for entrepreneurs, freelancers and anyone who needs AI right now.',
      detail: [
        'We run open programs for people who want to use AI in their work today. You learn on real tasks, with the datasets and open-source tools that industry practitioners actually use.',
        'Who it\'s for: entrepreneurs and business owners · freelancers and professionals · anyone who wants to master AI. What you get: practical skills you can apply right after the program, hands-on experience with real datasets and access to open-source tools with no licensing costs.',
      ],
    },
    {
      id: 'universities',
      nav: 'For universities',
      title: 'For universities',
      short:
        'Hands-on cases, practitioner trainers and the preparation employers are looking for — for universities that want to give students real skills.',
      detail: [
        'We build applied AI labs at universities and design programs that prepare students for real work with AI. Training is built around practical cases and real industry data.',
        'Who it\'s for: undergraduate and master\'s students in IT programs · faculty. The university gets practitioner trainers, a credit-bearing elective course, thesis project supervisors, credit for industrial and pre-graduation internships, and graduates with the skills employers need right now.',
      ],
    },
    ],
  };
  const AUDIENCES = AUDIENCES_BY_LANG[LANG];

  // Тексты, которые этот скрипт дорисовывает поверх бандла.
  const UI = {
    ru: {
      audiences: 'Аудитории',
      more: 'Подробнее',
      less: 'Свернуть',
      menu: 'Меню',
      blog: 'Блог',
      soon: 'Скоро',
      start: 'Начать обучение',
      contactsCta: 'Контакты ↗',
      links: ['О нас', 'Блог', 'Корп обучение', 'Кто мы', 'Мероприятия', 'Контакты'],
    },
    kk: {
      audiences: 'Аудиториялар',
      more: 'Толығырақ',
      less: 'Жасыру',
      menu: 'Мәзір',
      blog: 'Блог',
      soon: 'Жақында',
      start: 'Оқуды бастау',
      contactsCta: 'Байланыс ↗',
      links: ['Біз туралы', 'Блог', 'Корпоративтік оқыту', 'Біз кімбіз', 'Іс-шаралар', 'Байланыс'],
    },
    en: {
      audiences: 'Audiences',
      more: 'Learn more',
      less: 'Show less',
      menu: 'Menu',
      blog: 'Blog',
      soon: 'Coming soon',
      start: 'Start learning',
      contactsCta: 'Contact ↗',
      links: ['About', 'Blog', 'Corporate training', 'Who we are', 'Events', 'Contact'],
    },
  }[LANG];

  function waitForApp(callback) {
    let tries = 0;
    const check = () => {
      if (document.querySelector('.main-block') && document.getElementById('about')) {
        requestAnimationFrame(() => requestAnimationFrame(callback));
        return;
      }
      if (++tries > 300) return;
      requestAnimationFrame(check);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', check);
    } else {
      check();
    }
  }

  function removeHomeBlogSection() {
    document.getElementById('blog')?.remove();
  }

  function fixBlogNavLinks() {
    document.querySelectorAll(`a[href="${P('/blog/')}"], .menu a, .nav-menu a`).forEach((link) => {
      if (link.textContent.trim() === UI.blog) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = P('/blog/');
        });
      }
    });
  }

  function fixEventTags() {
    document.querySelectorAll('.events-section .tag, .events-section [class*="tag"]').forEach((el) => {
      if (el.textContent.trim().toLowerCase() === UI.soon.toLowerCase()) {
        el.textContent = UI.soon;
      }
    });
  }

  function rebuildForWhomSection() {
    const section = document.getElementById('training');
    if (!section || section.dataset.interactive === 'true') return;

    section.dataset.interactive = 'true';
    section.classList.add('forwhom-section--interactive');
    section.style.height = 'auto';

    let activeIndex = 0;

    section.innerHTML = `
      <div class="forwhom-sticky">
        <div class="forwhom-interactive">
          <nav class="forwhom-nav" aria-label="${UI.audiences}">
            ${AUDIENCES.map(
              (a, i) =>
                `<button type="button" class="forwhom-nav-item${i === 0 ? ' active' : ''}" data-index="${i}">${a.nav}</button>`
            ).join('')}
          </nav>
          <div class="forwhom-panel" id="forwhom-panel"></div>
        </div>
      </div>
    `;

    const panel = section.querySelector('#forwhom-panel');
    const navItems = section.querySelectorAll('.forwhom-nav-item');

    function renderPanel(index) {
      const item = AUDIENCES[index];
      panel.innerHTML = `
        <h3 class="forwhom-panel-title">${item.title}</h3>
        <p class="forwhom-panel-desc">${item.short}</p>
        <button type="button" class="forwhom-panel-btn" id="forwhom-detail-btn">${UI.more}</button>
        <div class="forwhom-panel-detail" id="forwhom-detail">
          ${item.detail.map((p) => `<p>${p}</p>`).join('')}
        </div>
      `;

      const detailBtn = panel.querySelector('#forwhom-detail-btn');
      const detail = panel.querySelector('#forwhom-detail');
      detailBtn.addEventListener('click', () => {
        detail.classList.toggle('open');
        detailBtn.textContent = detail.classList.contains('open') ? UI.less : UI.more;
      });
    }

    navItems.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        const index = Number(btn.dataset.index);
        if (index === activeIndex) return;
        activeIndex = index;
        navItems.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderPanel(index);
      });
      btn.addEventListener('click', () => {
        activeIndex = Number(btn.dataset.index);
        navItems.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderPanel(activeIndex);
      });
    });

    renderPanel(0);
  }

  function rebuildTeamSection() {
    const sticky = document.querySelector('.team-sticky');
    if (!sticky || sticky.dataset.gridLayout === 'true') return;

    const cards = [...sticky.querySelectorAll('.team-card')];
    const text = sticky.querySelector('.team-text');
    if (cards.length < 2 || !text) return;

    const layout = document.createElement('div');
    layout.className = 'team-layout';

    const left = document.createElement('div');
    left.className = 'team-side team-side--left';
    const right = document.createElement('div');
    right.className = 'team-side team-side--right';

    // Меньшая половина — налево, остаток — направо: при чётном числе
    // карточек выходит ровно поровну, при нечётном — правая колонка на
    // одну карточку больше, а не жёстко зашитая тройка слева.
    const leftCount = Math.floor(cards.length / 2);
    cards.forEach((card, i) => {
      card.style.cssText = 'position:relative;left:auto;top:auto;opacity:1;';
      (i < leftCount ? left : right).appendChild(card);
    });

    layout.appendChild(left);
    layout.appendChild(text);
    layout.appendChild(right);
    sticky.appendChild(layout);

    sticky.dataset.gridLayout = 'true';
  }

  function bindLeadersButton() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('[data-leaders-btn]');
        if (btn) {
          e.preventDefault();
          window.open(P('/ai-for-leaders/'), '_blank');
        }
      },
      true
    );
  }

  function buildMobileMenu() {
    if (document.querySelector('.m-menu-btn')) return;
    const links = ['#about', P('/blog/'), '#training', '#team', '#events', '#contacts'].map(
      (href, i) => [UI.links[i], href]
    );

    const overlay = document.createElement('div');
    overlay.className = 'm-menu-overlay';
    overlay.innerHTML =
      '<nav class="m-menu-nav">' +
      links
        .map(([t, h]) => `<a href="${h}" class="m-menu-link">${t}</a>`)
        .join('') +
      '<div class="m-menu-cta">' +
      '<a href="' + (window.AIRL_LMS_URL || 'https://lms.magauin.kz/') + '" target="_blank" rel="noopener noreferrer" class="m-cta-primary m-menu-link-cta m-cta-lms">' + UI.start + '</a>' +
      '<a href="#contacts" class="m-cta-secondary m-menu-link-cta">' + UI.contactsCta + '</a>' +
      '</div>' +
      '</nav>';
    document.body.appendChild(overlay);

    function makeBtn() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-menu-btn';
      btn.setAttribute('aria-label', UI.menu);
      btn.innerHTML = '<span></span><span></span><span></span>';
      btn.addEventListener('click', () => {
        const open = overlay.classList.toggle('open');
        document.body.classList.toggle('m-menu-lock', open);
        document.querySelectorAll('.m-menu-btn').forEach((b) => b.classList.toggle('open', open));
      });
      return btn;
    }

    const heroHeader = document.querySelector('.header .btn-group');
    if (heroHeader) heroHeader.appendChild(makeBtn());
    const floatNav = document.querySelector('.floating-nav .nav-btn-group');
    if (floatNav) floatNav.appendChild(makeBtn());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.m-menu-link, .m-menu-link-cta')) {
        overlay.classList.remove('open');
        document.body.classList.remove('m-menu-lock');
        document.querySelectorAll('.m-menu-btn').forEach((b) => b.classList.remove('open'));
        const link = e.target.closest('.m-menu-link, .m-menu-link-cta');
        if (link) {
          const href = link.getAttribute('href');
          if (href.startsWith('#')) {
            e.preventDefault();
            document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
  }

  function placeHeroStar() {
    const h1 = document.querySelector('.main-title h1');
    const icon = document.querySelector('.gemini-icon');
    if (!h1 || !icon) return;

    const cs = getComputedStyle(h1);
    const canvas = placeHeroStar._c || (placeHeroStar._c = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing) || 0;

    const measure = (s) => ctx.measureText(s).width + ls * s.length;
    const wAI = measure('AI');
    const gap = measure('AI\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0') - wAI;
    const size = Math.min(gap * 0.92, parseFloat(cs.fontSize) * 1.05);

    icon.style.setProperty('width', size + 'px', 'important');
    icon.style.setProperty('height', size + 'px', 'important');
    icon.style.setProperty('left', (wAI + (gap - size) / 2) + 'px', 'important');
    icon.style.setProperty('top', (parseFloat(cs.fontSize) * 0.02) + 'px', 'important');
  }

  function bindTeamCardTaps() {
    document.querySelectorAll('.team-card').forEach((card) => {
      if (card.dataset.tapBound) return;
      card.dataset.tapBound = '1';
      card.addEventListener('click', () => {
        document.querySelectorAll('.team-card.tapped').forEach((c) => {
          if (c !== card) c.classList.remove('tapped');
        });
        card.classList.add('tapped');
        clearTimeout(card._tapT);
        card._tapT = setTimeout(() => card.classList.remove('tapped'), 900);
      });
    });
  }

  // Имя в карточке команды → ссылка на личную страницу (/team/…).
  // Нужна поисковикам: так главная передаёт вес страницам по именам.
  const TEAM_PAGES = {
    'Жанибек Серкулов': '/team/zhanibek-serkulov',
    'Дмитрий Мун': '/team/dmitry-mun',
    'Куаныш Магауин': '/team/kuanysh-magauin',
    'Азамат Арманұлы': '/team/azamat-armanuly',
    'Джангельдин Алиби': '/team/alibi-dzhangeldin',
    // Английская версия: имена в бандле латиницей.
    'Zhanibek Serkulov': '/team/zhanibek-serkulov',
    'Dmitry Mun': '/team/dmitry-mun',
    'Kuanysh Magauin': '/team/kuanysh-magauin',
    'Azamat Armanuly': '/team/azamat-armanuly',
    'Alibi Dzhangeldin': '/team/alibi-dzhangeldin',
  };

  function linkTeamCards() {
    document.querySelectorAll('.team-card-name').forEach((el) => {
      if (el.querySelector('a')) return;
      const name = el.textContent.trim();
      const href = TEAM_PAGES[name];
      if (!href) return;
      const link = document.createElement('a');
      link.href = P(href);
      link.className = 'team-card-link';
      link.textContent = name;
      el.textContent = '';
      el.appendChild(link);
    });
  }

  // Preserve the existing detail buttons while making program pages discoverable.
  function linkProgramHeadings() {
    const programs = [
      ['.pcard:not(.pcard-leaders) .pcard-name', P('/ai-for-work/')],
      ['.pcard-leaders .pcard-name', P('/ai-for-leaders/')],
    ];
    programs.forEach(([selector, href]) => {
      const heading = document.querySelector(selector);
      if (!heading || heading.querySelector('a')) return;
      const link = document.createElement('a');
      link.href = href;
      link.className = 'program-page-link';
      link.textContent = heading.textContent;
      heading.replaceChildren(link);
    });
  }

  // Секция «Наши партнёры» после мероприятий: бесконечная лента логотипов.
  const PARTNERS = [
    { name: 'Kaizen Center', logo: '/partner-kaizen.png' },
    { name: 'Astana IT University', logo: '/partner-aitu.png' },
    { name: 'Yassa Education', logo: '/partner-yassa.png' },
  ];
  const PARTNERS_UI = {
    ru: {
      eyebrow: 'Партнёры',
      title: 'Наши партнёры',
      subtitle: 'Организации, с которыми мы вместе развиваем прикладной ИИ в Казахстане',
    },
    kk: {
      eyebrow: 'Серіктестер',
      title: 'Біздің серіктестер',
      subtitle: 'Қазақстанда қолданбалы жасанды интеллектті бірге дамытып жүрген ұйымдар',
    },
    en: {
      eyebrow: 'Partners',
      title: 'Our partners',
      subtitle: 'Organizations we work with to advance applied AI in Kazakhstan',
    },
  }[LANG];

  function buildPartnersSection() {
    const events = document.getElementById('events');
    if (!events || document.getElementById('partners')) return;

    // Логотипов мало, поэтому в одной половине ленты они повторяются,
    // чтобы она была шире любого экрана. Вторая половина — копия первой:
    // сдвиг на -50% зацикливается без шва. Читалкам экрана — только первый набор.
    const REPEAT = 4;
    const card = (p, hidden) =>
      `<li class="partners-card"${hidden ? ' aria-hidden="true"' : ''}>` +
      `<img src="${p.logo}" alt="${hidden ? '' : p.name}" loading="lazy" decoding="async" /></li>`;
    const half = (copy) =>
      Array.from({ length: REPEAT }, (_, r) => PARTNERS.map((p) => card(p, copy || r > 0)).join('')).join('');

    const section = document.createElement('section');
    section.id = 'partners';
    section.className = 'partners-section';
    section.innerHTML = `
      <div class="partners-head">
        <span class="partners-eyebrow">${PARTNERS_UI.eyebrow}</span>
        <h2 class="partners-title">${PARTNERS_UI.title}</h2>
        <p class="partners-subtitle">${PARTNERS_UI.subtitle}</p>
      </div>
      <div class="partners-marquee">
        <ul class="partners-track" aria-label="${PARTNERS_UI.title}">${half(false)}${half(true)}</ul>
      </div>
    `;
    events.after(section);
  }

  function swapBrandLogos() {
    const targets = [
      document.querySelector('.header .logo'),
      document.querySelector('.floating-nav .nav-logo'),
      document.querySelector('.floating-nav .logo'),
      document.querySelector('.footer-logo'),
    ];
    targets.forEach((el) => {
      if (!el || el.dataset.brandSwapped) return;
      el.dataset.brandSwapped = '1';
      el.innerHTML =
        '<img src="/logo-airl-white.png" alt="AI Research Labs" class="brand-logo" />';
    });
  }

  waitForApp(() => {
    buildMobileMenu();
    swapBrandLogos();
    setTimeout(swapBrandLogos, 1200);
    placeHeroStar();
    setTimeout(bindTeamCardTaps, 800);
    setTimeout(bindTeamCardTaps, 2500);
    linkTeamCards();
    linkProgramHeadings();
    setTimeout(linkTeamCards, 2500);
    window.addEventListener('resize', placeHeroStar);
    setTimeout(placeHeroStar, 600);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeHeroStar);
    removeHomeBlogSection();
    fixBlogNavLinks();
    fixEventTags();
    buildPartnersSection();
    rebuildForWhomSection();
    rebuildTeamSection();
    bindLeadersButton();
    window.addEventListener('resize', rebuildTeamSection, { passive: true });
  });
})();
