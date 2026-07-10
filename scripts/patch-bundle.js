#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '../assets/index-C9VrdjED.js');
let js = fs.readFileSync(bundlePath, 'utf8');

const replacements = [
  // Hero subtitle — remove AI skills sentence
  [
    'Центр прикладного ИИ. Мы готовим кадры для цифровой экономики Казахстана: обучаем команды и специалистов практическим навыкам работы с искусственным интеллектом',
    'Центр прикладного ИИ. Мы готовим кадры для цифровой экономики Казахстана',
  ],
  // Hero CTA
  ['text:`Узнать подробнее`,onClick:a[0]||=e=>t(`#about`)', 'text:`Оставить заявку`,onClick:a[0]||=e=>t(`#contacts`)'],
  // Remove partners block from hero
  [
    'aa(`<div class="img-gradient" data-v-46599b1c></div><div class="partners-container" data-v-46599b1c><span class="partners-label" data-v-46599b1c>При поддержке:</span><div class="partners-list" data-v-46599b1c><div class="partner-badge partner-freedom" data-v-46599b1c><span data-v-46599b1c>AI &amp; Digital Ministry</span></div><div class="partner-badge partner-choco" data-v-46599b1c><span data-v-46599b1c>MSU.kz</span></div><div class="partner-badge partner-airc" data-v-46599b1c><span data-v-46599b1c>AI Research Lab</span></div></div></div>`,2)',
    'aa(`<div class="img-gradient" data-v-46599b1c></div>`,2)',
  ],
  // Mission — remove last two lines
  [
    '[`Мы обучаем команды и специалистов`,`практическим навыкам работы`,`с искусственным интеллектом.`,`Даем навыки, которые работают с первого`,`дня и приносят реальный результат.`]',
    '[`Мы обучаем команды и специалистов`,`практическим навыкам работы`,`с искусственным интеллектом.`]',
  ],
  // About — remove subtitle
  [
    'n[0]||=[Z(`div`,{class:`reveal-wrap reveal-title`},[Z(`h2`,{class:`about-title`},`О нас`)],-1),Z(`div`,{class:`reveal-wrap reveal-sub`},[Z(`p`,{class:`about-sub`},[ia(` Узнай больше о тех, кто проведёт вас`),Z(`br`),ia(` к успеху с помощью AI `)])],-1)]',
    'n[0]||=[Z(`div`,{class:`reveal-wrap reveal-title`},[Z(`h2`,{class:`about-title`},`О нас`)],-1)]',
  ],
  // About — remove third card (Чем мы занимаемся), keep mission + values only
  [
    't=[{id:`mission`,title:`Миссия`,desc:`Мы готовим кадры для цифровой экономики Казахстана, соединяя университеты и индустрии`,img:`/1.png`,video:`/1.mp4`},{id:`values`,title:`Ценности`,desc:`Практическая польза, научная обоснованность, этичность и безопасность, партнерство и открытость — в основе всего, чему мы учим`,img:`/2.png`,video:`/2.mp4`},{id:`goal`,title:`Чем мы занимаемся`,desc:`Создаем прикладные лаборатории при вузах, обучаем сотрудников компаний на реальных бизнес-кейсах и проводим открытые программы для всех, кто хочет освоить ИИ`,img:`/3.png`,video:`/3.mp4`}],n=R([null,null,null])',
    't=[{id:`mission`,title:`Миссия`,desc:`Мы готовим кадры для цифровой экономики Казахстана, соединяя университеты и индустрии`,img:`/1.png`,video:`/1.mp4`},{id:`values`,title:`Ценности`,desc:`Практическая польза, научная обоснованность, этичность и безопасность, партнерство и открытость — в основе всего, чему мы учим`,img:`/2.png`,video:`/2.mp4`}],n=R([null,null])',
  ],
  // Team title → Кто мы + subtitle with former "чем мы занимаемся" content
  [
    'r[0]||=[Z(`h2`,{class:`team-title`},[ia(` Команда`),Z(`br`),ia(`AI Research Lab `)],-1),Z(`p`,{class:`team-subtitle`},` Наши тренеры — практики из индустрии, которые сами каждый день работают с ИИ в реальных проектах `,-1)]',
    'r[0]||=[Z(`h2`,{class:`team-title`},`Кто мы`,-1),Z(`p`,{class:`team-subtitle`},` Создаем прикладные лаборатории при вузах, обучаем сотрудников компаний на реальных бизнес-кейсах и проводим открытые программы для всех, кто хочет освоить ИИ. Наши тренеры — практики из индустрии, которые каждый день работают с ИИ в реальных проектах `,-1)]',
  ],
  // Nav: Команда → Кто мы
  ['text:`Команда`,href:`#team`', 'text:`Кто мы`,href:`#team`'],
  // App order: move Team after Hero, remove ResearchCycle
  [
    'Q(cl,{"scroll-y":t.value},null,8,[`scroll-y`]),Q(Es),Q(Ns,{"scroll-y":t.value},null,8,[`scroll-y`]),Q(Ks),Q(ec),Q(oc),Q(fc),Q(kc),Q(Yc),Q(il)',
    'Q(cl,{"scroll-y":t.value},null,8,[`scroll-y`]),Q(Es),Q(fc),Q(Ns,{"scroll-y":t.value},null,8,[`scroll-y`]),Q(Ks),Q(oc),Q(kc),Q(Yc),Q(il)',
  ],
  // Events — past events with real photos
  [
    'p=[{img:Oc,meta:`12 окт 2026 | Алматы`,title:`Воркшоп для Yandex Day`},{img:Oc,meta:`12 окт 2026 | Алматы`,title:`Воркшоп для Yandex Day`},{img:Oc,meta:`12 окт 2026 | Алматы`,title:`Воркшоп для Yandex Day`},{img:Oc,meta:`12 окт 2026 | Алматы`,title:`Воркшоп для Yandex Day`}]',
    'p=[{img:`/event-almaty-entrepreneurs.jpg`,meta:`2025 | Алматы`,title:`Воркшоп для предпринимателей Алматы`},{img:`/event-astana-business-club.jpg`,meta:`2025 | Астана`,title:`Воркшоп для членов бизнес клуба Астаны`},{img:`/event-almaty-women-business.jpg`,meta:`2025 | Алматы`,title:`Воркшоп для женского бизнес сообщества Алматы`}]',
  ],
  // Events upcoming — link to landing pages
  [
    'function f(){document.getElementById(`program`)?.scrollIntoView({behavior:`smooth`})}',
    'function f(e){if(e===0)window.open(`/ai-for-work/`,`_blank`);else if(e===1)window.open(`/ai-for-leaders/`,`_blank`);else document.getElementById(`program`)?.scrollIntoView({behavior:`smooth`})}',
  ],
  // Events row click handler
  ['onClick:f,style:{cursor:`pointer`}', 'onClick:()=>f(t),style:{cursor:`pointer`}'],
  // Programs — remove duplicate audience cards, add AI for leaders, link AI for work to landing
  [
    'function c(){r.value=!0}',
    'function c(){window.open(`/ai-for-work/`,`_blank`)}',
  ],
  // Remove the three pcard-soon divs and add AI for leaders card
  [
    'd[4]||=aa(`<div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Корпоративное обучение</span><h3 class="pcard-name" data-v-e197a197>Для бизнеса</h3><p class="pcard-desc" data-v-e197a197>Мы разрабатываем и проводим специализированные программы обучения искусственному интеллекту для организаций, управленческих команд и ключевых функций бизнеса. Обучение построено на логике полного цикла: от понимания технологий и мировых практик до применения ИИ в рабочих процессах.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: топ-менеджмент и собственники бизнеса · руководители направлений HR, Finance, Marketing, Sales, Operations · проектные и продуктовые команды.</p></div><div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Прикладные лаборатории</span><h3 class="pcard-name" data-v-e197a197>Для университетов</span><h3 class="pcard-name" data-v-e197a197>Для университетов</h3><p class="pcard-desc" data-v-e197a197>Мы создаем прикладные лаборатории при вузах и разрабатываем программы, которые готовят студентов к реальной работе с ИИ. Обучение построено на практических кейсах и работе с реальными данными индустрии.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: студенты и магистранты ИТ-специальностей · преподаватели и ППС. Университет получает тренеров-практиков, программу в кредитной системе как элективный курс, руководителей дипломных проектов, зачет производственной и преддипломной практики и выпускников с навыками, которые нужны работодателям прямо сейчас.</p></div><div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Открытые программы</span><h3 class="pcard-name" data-v-e197a197>Для частных лиц</h3><p class="pcard-desc" data-v-e197a197>Мы проводим открытые программы для тех, кто хочет применять ИИ в своей работе уже сейчас. Обучаем на реальных задачах, даем датасеты и open-source инструменты, с которыми работают практики индустрии.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: предприниматели и владельцы бизнеса · фрилансеры и специалисты · все, кто хочет освоить ИИ. Что получают: практические навыки, которые применяются сразу после программы, опыт работы с реальными датасетами и доступ к open-source инструментам без затрат на лицензии.</p></div>`,3)',
    'd[4]||=aa(`<div class="pcard pcard-main pcard-leaders" data-v-e197a197><div class="pcard-top" data-v-e197a197><span class="pcard-badge" data-v-e197a197>Скоро</span><h3 class="pcard-name" data-v-e197a197>AI for leaders</h3><p class="pcard-desc" data-v-e197a197> Программа для руководителей и собственников бизнеса: стратегия внедрения ИИ, управление командами и принятие решений на основе данных. </p></div><div class="pcard-stats" data-v-e197a197><div class="pstat" data-v-e197a197><b data-v-e197a197>1</b><span data-v-e197a197>день интенсива</span></div><div class="pstat" data-v-e197a197><b data-v-e197a197>100%</b><span data-v-e197a197>практика</span></div><div class="pstat" data-v-e197a197><b data-v-e197a197>5+</b><span data-v-e197a197>кейсов</span></div></div><button class="pcard-btn" data-leaders-btn data-v-e197a197> Узнать подробнее <svg width="18" height="18" viewBox="0 0 20 20" fill="none" data-v-e197a197><path d="M4 16L16 4M16 4V16M16 4H4" stroke="currentColor" stroke-width="1.8" data-v-e197a197></path></svg></button></div>`,1)',
  ],
  // AI for work button text
  ['ia(` Узнать подробнее `,-1)', 'ia(` Подробнее о программе `,-1)'],
  // Footer nav Команда → Кто мы
  ['Q(rs,{text:`Команда`})', 'Q(rs,{text:`Кто мы`})'],
  // Footer CTA
  ['Q(ds,{text:`Узнать подробнее`,onClick:a})', 'Q(ds,{text:`Оставить заявку`,onClick:()=>document.getElementById(`contacts`)?.scrollIntoView({behavior:`smooth`})})'],
];

// Fix the programs replacement - I had a typo in old_string. Let me use the exact string from bundle.
const programsOld = 'd[4]||=aa(`<div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Корпоративное обучение</span><h3 class="pcard-name" data-v-e197a197>Для бизнеса</h3><p class="pcard-desc" data-v-e197a197>Мы разрабатываем и проводим специализированные программы обучения искусственному интеллекту для организаций, управленческих команд и ключевых функций бизнеса. Обучение построено на логике полного цикла: от понимания технологий и мировых практик до применения ИИ в рабочих процессах.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: топ-менеджмент и собственники бизнеса · руководители направлений HR, Finance, Marketing, Sales, Operations · проектные и продуктовые команды.</p></div><div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Прикладные лаборатории</span><h3 class="pcard-name" data-v-e197a197>Для университетов</h3><p class="pcard-desc" data-v-e197a197>Мы создаем прикладные лаборатории при вузах и разрабатываем программы, которые готовят студентов к реальной работе с ИИ. Обучение построено на практических кейсах и работе с реальными данными индустрии.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: студенты и магистранты ИТ-специальностей · преподаватели и ППС. Университет получает тренеров-практиков, программу в кредитной системе как элективный курс, руководителей дипломных проектов, зачет производственной и преддипломной практики и выпускников с навыками, которые нужны работодателям прямо сейчас.</p></div><div class="pcard pcard-soon" data-v-e197a197><span class="pcard-badge pcard-badge--soon" data-v-e197a197>Открытые программы</span><h3 class="pcard-name" data-v-e197a197>Для частных лиц</h3><p class="pcard-desc" data-v-e197a197>Мы проводим открытые программы для тех, кто хочет применять ИИ в своей работе уже сейчас. Обучаем на реальных задачах, даем датасеты и open-source инструменты, с которыми работают практики индустрии.</p><p class="pcard-desc" data-v-e197a197>Кому подходят: предприниматели и владельцы бизнеса · фрилансеры и специалисты · все, кто хочет освоить ИИ. Что получают: практические навыки, которые применяются сразу после программы, опыт работы с реальными датасетами и доступ к open-source инструментам без затрат на лицензии.</p></div>`,3)';

const programsNew = 'd[4]||=aa(`<div class="pcard pcard-main pcard-leaders" data-v-e197a197><div class="pcard-top" data-v-e197a197><span class="pcard-badge" data-v-e197a197>Скоро</span><h3 class="pcard-name" data-v-e197a197>AI for leaders</h3><p class="pcard-desc" data-v-e197a197> Программа для руководителей и собственников бизнеса: стратегия внедрения ИИ, управление командами и принятие решений на основе данных. </p></div><div class="pcard-stats" data-v-e197a197><div class="pstat" data-v-e197a197><b data-v-e197a197>1</b><span data-v-e197a197>день интенсива</span></div><div class="pstat" data-v-e197a197><b data-v-e197a197>100%</b><span data-v-e197a197>практика</span></div><div class="pstat" data-v-e197a197><b data-v-e197a197>5+</b><span data-v-e197a197>кейсов</span></div></div><button class="pcard-btn" data-leaders-btn data-v-e197a197> Узнать подробнее <svg width="18" height="18" viewBox="0 0 20 20" fill="none" data-v-e197a197><path d="M4 16L16 4M16 4V16M16 4H4" stroke="currentColor" stroke-width="1.8" data-v-e197a197></path></svg></button></div>`,1)';

// Remove bad programs entry from replacements array
const filtered = replacements.filter(([old]) => !old.includes('pcard-soon'));
filtered.push([programsOld, programsNew]);

let changed = 0;
let failed = [];
for (const [oldStr, newStr] of filtered) {
  if (js.includes(oldStr)) {
    js = js.replace(oldStr, newStr);
    changed++;
  } else {
    failed.push(oldStr.slice(0, 80) + '...');
  }
}

fs.writeFileSync(bundlePath, js);
console.log(`Applied ${changed}/${filtered.length} patches`);
if (failed.length) {
  console.log('Failed patches:');
  failed.forEach((f) => console.log(' -', f));
}
