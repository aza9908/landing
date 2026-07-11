(function () {
  const AUDIENCES = [
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
  ];

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
    document.querySelectorAll('a[href="/blog/"], .menu a, .nav-menu a').forEach((link) => {
      if (link.textContent.trim() === 'Блог') {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '/blog/';
        });
      }
    });
  }

  function fixEventTags() {
    document.querySelectorAll('.events-section .tag, .events-section [class*="tag"]').forEach((el) => {
      if (el.textContent.trim().toLowerCase() === 'скоро') {
        el.textContent = 'Скоро';
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
          <nav class="forwhom-nav" aria-label="Аудитории">
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
        <button type="button" class="forwhom-panel-btn" id="forwhom-detail-btn">Подробнее</button>
        <div class="forwhom-panel-detail" id="forwhom-detail">
          ${item.detail.map((p) => `<p>${p}</p>`).join('')}
        </div>
      `;

      const detailBtn = panel.querySelector('#forwhom-detail-btn');
      const detail = panel.querySelector('#forwhom-detail');
      detailBtn.addEventListener('click', () => {
        detail.classList.toggle('open');
        detailBtn.textContent = detail.classList.contains('open') ? 'Свернуть' : 'Подробнее';
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
    if (cards.length < 6 || !text) return;

    const layout = document.createElement('div');
    layout.className = 'team-layout';

    const left = document.createElement('div');
    left.className = 'team-side team-side--left';
    const right = document.createElement('div');
    right.className = 'team-side team-side--right';

    cards.forEach((card, i) => {
      card.style.cssText = 'position:relative;left:auto;top:auto;opacity:1;';
      (i < 3 ? left : right).appendChild(card);
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
          window.open('/ai-for-leaders/', '_blank');
        }
      },
      true
    );
  }

  function buildMobileMenu() {
    if (document.querySelector('.m-menu-btn')) return;
    const links = [
      ['О нас', '#about'],
      ['Блог', '/blog/'],
      ['Корп обучение', '#training'],
      ['Кто мы', '#team'],
      ['Мероприятия', '#events'],
      ['Контакты', '#contacts'],
    ];

    const overlay = document.createElement('div');
    overlay.className = 'm-menu-overlay';
    overlay.innerHTML =
      '<nav class="m-menu-nav">' +
      links
        .map(([t, h]) => `<a href="${h}" class="m-menu-link">${t}</a>`)
        .join('') +
      '<div class="m-menu-cta">' +
      '<a href="#events" class="m-cta-primary m-menu-link-cta">Начать обучение</a>' +
      '<a href="#contacts" class="m-cta-secondary m-menu-link-cta">Контакты ↗</a>' +
      '</div>' +
      '</nav>';
    document.body.appendChild(overlay);

    function makeBtn() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-menu-btn';
      btn.setAttribute('aria-label', 'Меню');
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

  waitForApp(() => {
    buildMobileMenu();
    removeHomeBlogSection();
    fixBlogNavLinks();
    fixEventTags();
    rebuildForWhomSection();
    rebuildTeamSection();
    bindLeadersButton();
    window.addEventListener('resize', rebuildTeamSection, { passive: true });
  });
})();
