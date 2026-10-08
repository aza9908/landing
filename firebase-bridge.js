/* AI Research Labs — Firebase bridge.
   ВАЖНО: вставьте сюда конфиг вашего проекта из Firebase Console:
   Project settings → General → Your apps → SDK setup and configuration.
   Пока конфиг не вставлен, сайт работает в fallback-режиме:
   заявки уходят только в WhatsApp, задачи хранятся локально в браузере. */

window.AIRL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDNSjN6mF5R5tVqrVtXeuOu3q6UtUdS39o",
  authDomain: "landing-page-8e314.firebaseapp.com",
  projectId: "landing-page-8e314",
  storageBucket: "landing-page-8e314.firebasestorage.app",
  messagingSenderId: "796647636375",
  appId: "1:796647636375:web:22cf9949b2e8f8bbdd58d2",
  measurementId: "G-V0VD438TFZ"
};

/* Telegram-уведомления для внутренних задач.
   Когда создадите канал: 1) создайте бота через @BotFather, 2) добавьте бота
   администратором канала, 3) вставьте токен и @имя_канала ниже. */
window.AIRL_TELEGRAM = {
  /* ВНИМАНИЕ: токен бота виден любому посетителю сайта (клиентский код).
     Если в канале появится спам — отзовите токен через @BotFather (/revoke)
     и попросите перенести отправку в Cloud Function. */
  botToken: "8793362793:AAFPq56gfITGyBDn9IZCcWB-MDxnOEaYSls",
  // Числовой номер канала «Задачи AIRL» (@AIRLtasks): он не меняется, если
  // канал сделать частным, а имя @AIRLtasks при этом пропадает.
  chatId: "-1004450740658"
};

/* Отдельный канал для результатов агента airl.kz/diagnostics (экспресс-
   диагностика): сводка, PDF для клиента, отчёт менеджера. Заявки с формы
   и коды групп по-прежнему идут в AIRL_TELEGRAM выше.
   Если поля очистить, результаты агента снова пойдут в AIRL_TELEGRAM.
   Токен, как и выше, виден в коде сайта — поэтому боту в канале дайте
   только право «Публикация сообщений», без удаления и редактирования. */
window.AIRL_TELEGRAM_AGENT = {
  botToken: "8711954523:AAEvCtEQ91TUizGNwSc00gNkuHPyXbjMC8s", // @airl9499_bot
  chatId: "-1004358402425"                                     // канал «AIRL-diagnostics»
};

(function () {
  'use strict';

  var app = null;
  var db = null;
  var ready = null;

  function hasConfig() {
    var c = window.AIRL_FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId);
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function init() {
    if (ready) return ready;
    if (!hasConfig()) {
      ready = Promise.resolve(false);
      return ready;
    }
    ready = loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
      .then(function () {
        return loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');
      })
      .then(function () {
        app = firebase.initializeApp(window.AIRL_FIREBASE_CONFIG);
        db = firebase.firestore();
        return true;
      })
      .catch(function (e) {
        console.warn('[AIRL] Firebase init failed:', e);
        return false;
      });
    return ready;
  }

  /* Заявка с формы → Firestore, коллекция "requests" */
  window.AIRL_saveRequest = function (data) {
    return init().then(function (ok) {
      if (!ok || !db) return false;
      return db
        .collection('requests')
        .add(Object.assign({}, data, { createdAt: new Date().toISOString() }))
        .then(function () { return true; })
        .catch(function (e) {
          console.warn('[AIRL] request save failed:', e);
          return false;
        });
    });
  };

  /* Внутренние задачи → Firestore, коллекция "tasks" (fallback: localStorage) */
  window.AIRL_tasks = {
    isCloud: function () { return init().then(function (ok) { return ok; }); },
    list: function () {
      return init().then(function (ok) {
        if (ok && db) {
          return db.collection('tasks').orderBy('createdAt', 'desc').get()
            .then(function (snap) {
              var out = [];
              snap.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
              return out;
            });
        }
        try { return JSON.parse(localStorage.getItem('airl-tasks') || '[]'); }
        catch (e) { return []; }
      });
    },
    save: function (task) {
      return init().then(function (ok) {
        if (ok && db) {
          if (task.id) {
            var id = task.id;
            var copy = Object.assign({}, task);
            delete copy.id;
            return db.collection('tasks').doc(id).set(copy).then(function () { return id; });
          }
          return db.collection('tasks').add(task).then(function (ref) { return ref.id; });
        }
        var all = [];
        try { all = JSON.parse(localStorage.getItem('airl-tasks') || '[]'); } catch (e) {}
        if (task.id) {
          all = all.map(function (t) { return t.id === task.id ? task : t; });
        } else {
          task.id = 't' + Date.now();
          all.unshift(task);
        }
        localStorage.setItem('airl-tasks', JSON.stringify(all));
        return task.id;
      });
    },
    remove: function (id) {
      return init().then(function (ok) {
        if (ok && db) return db.collection('tasks').doc(id).delete();
        var all = [];
        try { all = JSON.parse(localStorage.getItem('airl-tasks') || '[]'); } catch (e) {}
        localStorage.setItem('airl-tasks', JSON.stringify(all.filter(function (t) { return t.id !== id; })));
      });
    },
  };

  /* Telegram-уведомление (работает после вставки токена и chatId).
     opts.html — текст размечен HTML (ссылки, жирный); всё, что ввёл
     посетитель, вызывающий обязан экранировать сам. */
  window.AIRL_notifyTelegram = function (text, opts) {
    var t = window.AIRL_TELEGRAM || {};
    if (!t || !t.botToken || !t.chatId) return Promise.resolve(false);
    var body = { chat_id: t.chatId, text: text };
    if (opts && opts.html) {
      body.parse_mode = 'HTML';
      body.disable_web_page_preview = true;
    }
    return fetch('https://api.telegram.org/bot' + t.botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function () { return true; })
      .catch(function () { return false; });
  };
})();
