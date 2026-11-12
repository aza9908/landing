/* Карусель кейсов участников: видео сверху, короткая статья снизу, листается стрелками и свайпом.
   Один и тот же код на странице кейсов (/ai-for-work/cases/) и в блоке на странице воркшопа:
   <div data-cases></div> — сюда рисуется карусель. */
(function () {
  var MEDIA = '/ai-for-work/cases/media/';

  // p — абзацы статьи; первые два видны сразу, остальные по кнопке «Читать дальше»
  var CASES = [
    {
      id: 'aigerim',
      name: 'Айгерим',
      role: 'Управляющий директор IT-компании',
      title: 'Личный кабинет пациента и CRM для аптек — с обеда до пяти вечера',
      p: [
        ['Кто', 'Айгерим — управляющий директор IT-компании. «Работаю в IT, но никогда не кодила». На воркшопе назначила себя бизнес-аналитиком и вайб-кодером и взяла задачу из бизнеса родителей: у них аптеки и процедурные кабинеты.'],
        ['Проблема', 'Лекарства учитываются в системе автоматически, а процедуры до сих пор записывают в бумажный журнал. Пациент не видит своей истории, руководитель — общей картины.'],
        ['Что сделала с ИИ', 'Личный кабинет пациента: после входа он видит хронологию анализов, какие капельницы ставили, какие рекомендации дал врач, сколько раз был в аптеке и сколько стоил визит. Плюс дашборд руководителя и CRM-система с пациентами и процедурами.'],
        ['Результат', 'Всё это собрано за один день — с обеда до 17:00. Вместо журнала у бизнеса появилась цифровая история каждого пациента.']
      ]
    },
    {
      id: 'kairat',
      name: 'Кайрат',
      role: 'Юрист нефтегазовой компании',
      title: 'Сборщик тендерных заявок, который находит «заточку» под поставщика',
      p: [
        ['Кто', 'Кайрат — юрист по закупкам в нефтегазовой компании. Каждый тендер — это десятки требований и документов, и команде нужно понимать, что именно собирать.'],
        ['Две цели', 'Первая — собрать конкурсную заявку так, чтобы всем было понятно, как её собирать. Вторая — находить в техспецификациях заточку под конкретного поставщика.'],
        ['Что сделал с ИИ', '«Сборщик конкурсных заявок»: загружаешь тендерную документацию — получаешь чек-лист документов и сверку с папкой компании. Второй модуль разбирает техспецификацию, сам ищет информацию в интернете и показывает, под кого она примерно написана. Плюс отдельная страница с описанием инструмента.'],
        ['Результат', 'Обе цели достигнуты. Уже на первой проверке инструмент нашёл несколько пунктов техспецификации, заточенных под конкретного поставщика.']
      ]
    },
    {
      id: 'danil',
      name: 'Данил',
      role: 'Системный администратор IT-компании',
      title: 'Увольнение или отпуск сотрудника — права и лицензии меняются сами',
      p: [
        ['Кто', 'Данил — системный администратор. Его цель была простой: сократить объём ручной работы и упростить процессы.'],
        ['Проблема', 'Учётные записи и права доступа живут в двух порталах Microsoft 365. Каждое увольнение или отпуск — это ручное отключение доступов к папкам, файлам и почте.'],
        ['Что сделал с ИИ', 'Объединил систему с порталами Microsoft 365. У каждого отдела свои права, менять отделы могут только кадры и руководство. Ставишь сотруднику статус «уволен» или «в отпуске» — и через Admin Center сразу отключаются права, освобождается лицензия, а почта остаётся доступной ещё 30 дней, чтобы передать её замещающему.'],
        ['Результат', '«Это значительно облегчило нашу работу». Или, как говорит сам Данил: «ИИ делает сложное простым».']
      ]
    },
    {
      id: 'firia',
      name: 'Фирия',
      role: 'Стратегический эксперт по развитию бизнеса',
      title: 'Сайт и система контроля стратегий для клиентов — без программиста',
      p: [
        ['Кто', 'Фирия — эксперт по систематизации и развитию бизнеса, 20 лет в бизнесе. Работает с собственниками: пишет им стратегии и каждый месяц проверяет, каких шагов они достигли.'],
        ['Проблема', 'Стратегии, доходы и маржа по каждому клиенту — это таблицы, в которых «очень много цифр». Следить за ними вручную тяжело.'],
        ['Что сделала с ИИ', 'Сайт «Бизнес-партнёр собственника» с её историей, форматом работы и записью на знакомство. И рабочий инструмент: по каждому проекту видны доход, маржа и вся статистика, а главное — как выполняются стратегические задачи.'],
        ['Результат', '«Мне осталось просто загружать туда данные». По каждому клиенту — понятный контроль. «Был барьер, но всё-таки я это сделала».']
      ]
    },
    {
      id: 'alfira',
      name: 'Альфира',
      role: 'Проектный менеджер школы китайского языка',
      title: 'Заявки, задачи учителей и Telegram-бот для учеников',
      p: [
        ['Кто', 'Альфира — проектный менеджер в школе китайского языка.'],
        ['Проблема', '«Моя большая боль была в том, что я обрабатывала всех студентов сама через Google Диск»: заявки, расписание, материалы — всё вручную.'],
        ['Что сделала с ИИ', 'Сайт, где слушатели оставляют заявку, а она сразу попадает к менеджеру. Кабинет, где каждый сотрудник видит свои задачи на сегодня. Отдельный аккаунт для учителей с материалами для учеников. И Telegram-бот для учеников: слушаешь, смотришь на картинку, отвечаешь «верно» или «неверно», смотришь уроки и свои результаты, тренируешь произношение.'],
        ['Результат', 'Вместо ручной работы в Google Диске — система, где у каждого свои задачи, а ученики занимаются в Telegram.']
      ]
    },
    {
      id: 'aina',
      name: 'Участник воркшопа',
      role: 'Личный проект для семьи',
      title: '«Айна» — своя умная колонка вместо «Алисы»',
      p: [
        ['Идея', 'У участника воркшопа по AI-трансформации был личный проект для семьи. Он задумался: почему бы не собрать свою станцию вместо готовой колонки?'],
        ['Что сделал с ИИ', 'Благодаря вайб-кодингу собрал голосового ассистента «Айна». Она синхронизирована со Spotify: «Айна, поставь Меладзе» — и музыка играет. Распознаёт жанры, узнаёт голоса членов семьи и обращается к каждому по имени, а гостей приветствует.'],
        ['Дальше', 'Следующий шаг — отдельный гаджет, который будет распознавать голос ещё чище.'],
        ['Вывод', 'Вайб-кодинг — это не только про работу. Если есть идея, её можно собрать самому.']
      ]
    }
  ];

  var ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" /></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>'
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  }

  function build(root) {
    var soundOn = false; // включил звук один раз — дальше следующие видео тоже со звуком
    var current = 0;
    var inView = false;
    var userPaused = false;

    var track = el('div', 'cases__track');
    track.setAttribute('aria-roledescription', 'карусель');
    var dots = el('div', 'cases__dots');
    var slides = CASES.map(function (c, i) {
      var slide = el('article', 'case');
      slide.setAttribute('aria-roledescription', 'слайд');
      slide.setAttribute('aria-label', (i + 1) + ' из ' + CASES.length + ': ' + c.name);

      var media = el('div', 'case__media');
      var video = el('video', 'case__video');
      video.src = MEDIA + c.id + '.mp4';
      video.poster = MEDIA + c.id + '.jpg';
      video.preload = i === 0 ? 'metadata' : 'none';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      media.appendChild(video);

      var count = el('span', 'case__count', (i + 1) + ' / ' + CASES.length);
      var sound = el('button', 'case__sound', ICON.muted + '<span>Включить звук</span>');
      sound.type = 'button';
      var play = el('span', 'case__play', ICON.play);
      var bar = el('span', 'case__progress');
      var barFill = el('span');
      bar.appendChild(barFill);
      media.appendChild(count);
      media.appendChild(play);
      media.appendChild(sound);
      media.appendChild(bar);

      if (i > 0) {
        var prev = el('button', 'case__arrow case__arrow--prev', ICON.prev);
        prev.type = 'button';
        prev.setAttribute('aria-label', 'Предыдущий кейс');
        prev.addEventListener('click', function () { go(current - 1); });
        media.appendChild(prev);
      }
      if (i < CASES.length - 1) {
        var next = el('button', 'case__arrow case__arrow--next', ICON.next);
        next.type = 'button';
        next.setAttribute('aria-label', 'Следующий кейс');
        next.addEventListener('click', function () { go(current + 1); });
        media.appendChild(next);
      }

      video.addEventListener('timeupdate', function () {
        if (video.duration) barFill.style.width = (video.currentTime / video.duration) * 100 + '%';
      });
      video.addEventListener('play', function () { media.classList.remove('is-paused'); });
      video.addEventListener('pause', function () { media.classList.add('is-paused'); });

      // Нажатие на видео: первый раз включает звук, дальше — пауза / продолжить
      video.addEventListener('click', function () {
        if (video.muted) { setSound(true); video.play().catch(function () {}); return; }
        if (video.paused) { userPaused = false; video.play().catch(function () {}); }
        else { userPaused = true; video.pause(); }
      });
      play.addEventListener('click', function () { userPaused = false; video.play().catch(function () {}); });
      sound.addEventListener('click', function (e) { e.stopPropagation(); setSound(!soundOn); });

      var body = el('div', 'case__body');
      body.appendChild(el('p', 'eyebrow', '')).textContent = c.name + ' · ' + c.role;
      body.appendChild(el('h3', 'case__title')).textContent = c.title;
      var text = el('div', 'case__text');
      c.p.forEach(function (p, k) {
        var para = el('p', k > 1 ? 'case__more' : '');
        var b = el('strong');
        b.textContent = p[0] + '. ';
        para.appendChild(b);
        para.appendChild(document.createTextNode(p[1]));
        text.appendChild(para);
      });
      body.appendChild(text);
      var more = el('button', 'link-btn case__toggle', 'Читать дальше');
      more.type = 'button';
      more.addEventListener('click', function () {
        var open = slide.classList.toggle('is-open');
        more.textContent = open ? 'Свернуть' : 'Читать дальше';
      });
      body.appendChild(more);

      slide.appendChild(media);
      slide.appendChild(body);
      track.appendChild(slide);

      var dot = el('button', 'cases__dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Кейс ' + (i + 1) + ': ' + c.name);
      dot.addEventListener('click', function () { go(i); });
      dots.appendChild(dot);

      return { slide: slide, video: video, media: media, sound: sound, dot: dot };
    });

    root.appendChild(track);
    root.appendChild(dots);

    function setSound(on) {
      soundOn = on;
      slides.forEach(function (s) {
        s.video.muted = !on;
        s.sound.innerHTML = on ? ICON.sound : ICON.muted + '<span>Включить звук</span>';
        s.sound.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
        s.media.classList.toggle('has-sound', on);
      });
    }

    function sync() {
      slides.forEach(function (s, i) {
        var active = i === current;
        s.dot.classList.toggle('is-active', active);
        s.dot.setAttribute('aria-current', active ? 'true' : 'false');
        if (active && inView && !userPaused) {
          s.video.preload = 'auto';
          s.video.muted = !soundOn;
          s.video.play().catch(function () {
            // браузер не дал включить со звуком без нажатия — играем без звука
            if (soundOn) { setSound(false); s.video.play().catch(function () {}); }
          });
        } else if (!s.video.paused) {
          s.video.pause();
        }
        // следующее видео подгружаем заранее, чтобы листалось без ожидания
        if (i === current + 1 && s.video.preload === 'none') s.video.preload = 'metadata';
      });
    }

    function go(i) {
      i = Math.max(0, Math.min(CASES.length - 1, i));
      // номер слайда меняем сразу, не дожидаясь конца прокрутки: быстрые нажатия подряд не путаются
      if (i !== current) { current = i; userPaused = false; sync(); }
      target = i;
      clearTimeout(targetTimer);
      targetTimer = setTimeout(function () { target = null; }, 1500);
      track.scrollTo({ left: slides[i].slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }

    // Слайд, к которому листаем стрелкой или точкой: пока прокрутка до него не дошла, промежуточные слайды не считаем
    var target = null;
    var targetTimer;
    var t;
    track.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var i = Math.round(track.scrollLeft / (track.clientWidth + 16)); // 16 — отступ между слайдами
        if (target !== null) {
          if (i !== target) return;
          target = null;
        }
        if (i !== current) { current = i; userPaused = false; sync(); }
      }, 80);
    }, { passive: true });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { go(current + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { go(current - 1); e.preventDefault(); }
    });

    // Видео играет, только пока карусель на экране
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.45 }).observe(track);
    } else {
      inView = true;
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) slides[current].video.pause(); else sync();
    });
    sync();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-cases]'), build);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
