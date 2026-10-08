/*
  Голосовой слой экспресс-диагностики: speech-to-text, text-to-speech и
  режим speech-to-speech (hands-free: бот говорит → слушает → отвечает).
  ---------------------------------------------------------------------
  STT — встроенная в браузер речевая модель (Web Speech API, ru-RU).
  TTS — два провайдера с одинаковым интерфейсом speak(text) -> Promise:
    • "server"  — мужской русский голос с сервера через POST /api/tts (ElevenLabs
                  «Артём» или Microsoft «Дмитрий»; mp3, кэш на сервере);
    • "browser" — системный голос (SpeechSynthesis), запасной вариант.
  Перед озвучкой текст проходит speechify(): латинские термины, проценты,
  диапазоны и «В1…В8» переписываются так, как их произносит русский диктор.
*/
(function (root) {
  "use strict";

  /* ---------- Нормализация под дикцию ---------- */
  var TERMS = [
    [/AI for Work/gi, "Эй-Ай фор Ворк"], [/Vibe Coding/gi, "Вайб Кодинг"], [/Study Tour/gi, "Стади Тур"],
    [/Boardroom Simulation/gi, "Бордрум Симьюлейшн"], [/AI Systems Architecture/gi, "архитектура ИИ-систем"],
    [/Luckin Coffee/gi, "Лакин Кофе"], [/Alibaba Cloud/gi, "Алибаба Клауд"], [/Alibaba/gi, "Алибаба"],
    [/Cainiao/gi, "Цайняо"], [/\bHema\b/g, "Хэма"], [/FlyZoo Hotel/gi, "ФлайЗу Хотел"], [/AIRL/g, "Эй-Ай-Ар-Эл"],
    [/AI Research Lab/gi, "Эй-Ай Рисёрч Лаб"], [/supply chain/gi, "саплай чейн"], [/roadmap/gi, "роадмап"],
    [/AI-native/gi, "ИИ-нейтив"], [/DIAGNOSE/g, "Диагноз"], [/HoReCa/gi, "хорека"], [/Retail/gi, "ритейл"],
    [/EdTech/gi, "эдтек"], [/\bIT\b/g, "айти"], [/\bCRM\b/g, "си-ар-эм"], [/\bBI\b/g, "би-ай"], [/\bCEO\b/g, "си-и-о"],
    [/\bExcel\b/gi, "Эксель"], [/WhatsApp/gi, "Ватсап"], [/Starter/g, "Стартер"], [/Developing/g, "Девелопинг"],
    [/Advanced/g, "Эдвансд"], [/face recognition/gi, "распознавание лиц"], [/\bAI\b/g, "ИИ"], [/ИИ-/g, "ИИ "]
  ];
  function speechify(text) {
    var t = String(text || "");
    TERMS.forEach(function (r) { t = t.replace(r[0], r[1]); });
    t = t.replace(/(^|[^А-Яа-яA-Za-z0-9])В([1-8])(?![0-9А-Яа-я])/g, "$1вопрос $2")
         .replace(/([А-Яа-яA-Za-z])\/([А-Яа-яA-Za-z])/g, "$1 или $2")
         .replace(/(\d+)\s*[–-]\s*(\d+)\s*%/g, "от $1 до $2 процентов")
         .replace(/(\d+)\s*%/g, "$1 процентов")
         .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 из $2")
         .replace(/\s[—–]\s/g, ", ").replace(/[—–]/g, "-").replace(/→/g, " к ").replace(/×/g, " на ")
         .replace(/[«»"“”]/g, "").replace(/\s{2,}/g, " ").trim();
    return t;
  }

  /* ---------- Speech-to-text ---------- */
  var SpeechRec = root.SpeechRecognition || root.webkitSpeechRecognition;
  var stt = {
    supported: !!SpeechRec, active: false, _rec: null,
    listen: function (opts) {
      if (!SpeechRec) { opts.onError && opts.onError("unsupported"); return function () {}; }
      var rec = new SpeechRec();
      rec.lang = "ru-RU"; rec.continuous = !!opts.continuous; rec.interimResults = true; rec.maxAlternatives = 1;
      var finalText = "", gotFinal = false, self = this;
      var watchdog = setTimeout(function () { try { rec.stop(); } catch (e) {} }, opts.continuous ? 60000 : 15000);
      rec.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) { finalText = (finalText + " " + chunk).trim(); gotFinal = true; } else interim += chunk;
        }
        opts.onInterim && opts.onInterim((finalText + " " + interim).trim());
        if (gotFinal && !opts.continuous) { try { rec.stop(); } catch (er) {} }
      };
      rec.onerror = function (e) { if (e.error !== "no-speech" && e.error !== "aborted") opts.onError && opts.onError(e.error); };
      rec.onend = function () {
        clearTimeout(watchdog); self.active = false; self._rec = null;
        if (finalText) opts.onFinal && opts.onFinal(finalText);
        opts.onEnd && opts.onEnd(!!finalText);
      };
      this.active = true; this._rec = rec;
      try { rec.start(); } catch (e) { this.active = false; this._rec = null; opts.onError && opts.onError("start"); }
      return function () { try { rec.stop(); } catch (e) {} };
    },
    stop: function () { if (this._rec) { try { this._rec.stop(); } catch (e) {} } }
  };

  /* ---------- Text-to-speech: браузер ---------- */
  var synth = root.speechSynthesis;
  var FEMALE = /milena|милена|irina|ирина|katya|катя|elena|елена|anna|анна|alyona|алёна|tatyana|татьяна|oksana|оксана|svetlana|светлана|dariya|дарья|female|женск|google русский/i;
  var MALE = /yuri|юрий|dmitry|дмитрий|dmitri|artem|артём|артем|artyom|pavel|павел|maxim|максим|ivan|иван|sergey|сергей|andrey|андрей|nikita|никита|male|мужск/i;
  var browserVoice = null;
  function pickBrowserVoice() {
    if (!synth) return;
    var ru = (synth.getVoices() || []).filter(function (v) { return /^ru/i.test(v.lang); });
    if (!ru.length) { browserVoice = null; return; }
    var premium = function (list) { return list.filter(function (v) { return /premium|enhanced|natural|neural|siri/i.test(v.name); }); };
    var male = ru.filter(function (v) { return MALE.test(v.name) && !FEMALE.test(v.name); });
    var notFemale = ru.filter(function (v) { return !FEMALE.test(v.name); });
    browserVoice = premium(male)[0] || male[0] || premium(notFemale)[0] || notFemale[0] || ru[0];
  }
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", pickBrowserVoice);
  pickBrowserVoice();

  function speakBrowser(text) {
    return new Promise(function (resolve) {
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") return resolve(false);
      if (!browserVoice) pickBrowserVoice();
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU"; u.rate = 1.03; u.pitch = 0.95;
      if (browserVoice) u.voice = browserVoice;
      var done = false, finish = function () { if (done) return; done = true; resolve(true); };
      u.onend = finish; u.onerror = finish;
      synth.speak(u);
      setTimeout(finish, Math.min(25000, 400 + text.length * 90));
    });
  }

  /* ---------- Text-to-speech: ElevenLabs через сервер ---------- */
  var audioCache = {}, current = null, generation = 0;
  function fetchAudio(text, base, group) {
    if (audioCache[text]) return audioCache[text];
    var p = fetch((base || "") + "/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(group ? { text: text, group: group } : { text: text }) })
      .then(function (r) { if (!r.ok) throw new Error("tts " + r.status); return r.blob(); })
      .then(function (b) { return URL.createObjectURL(b); });
    p.catch(function () { delete audioCache[text]; });
    audioCache[text] = p;
    return p;
  }
  function playUrl(url) {
    return new Promise(function (resolve, reject) {
      var a = new Audio(url); current = a;
      a.onended = function () { current = null; resolve(true); };
      a.onerror = function () { current = null; reject(new Error("audio")); };
      a.play().catch(reject);
    });
  }

  var tts = {
    supported: !!(synth && typeof SpeechSynthesisUtterance !== "undefined"),
    provider: "browser",            // "browser" | "server" (ElevenLabs или Microsoft через /api/tts)
    label: "",
    base: "",                       // адрес сервера с /api/tts (пусто = тот же хост)
    enabled: false, speaking: false,
    setProvider: function (name, base, label) { this.provider = name === "browser" ? "browser" : "server"; this.base = base || ""; this.label = label || ""; if (this.provider === "server") this.supported = true; },
    browserVoiceName: function () { if (!browserVoice) pickBrowserVoice(); return browserVoice ? browserVoice.name.replace(/\(.*?\)/g, "").trim() : ""; },
    /* Предзагрузка: озвучка следующего вопроса готова заранее, играет без задержки. */
    prefetch: function (text) { if (this.provider === "server" && text) fetchAudio(speechify(text), this.base).catch(function () {}); },
    /* Предзагрузка списка реплик по одной: все вопросы бота лежат в кэше ещё до того, как их зададут,
       а сервис озвучки не перегружается параллельными запросами. */
    prefetchAll: function (texts) {
      var self = this, list = (texts || []).filter(Boolean), i = 0;
      if (self.provider !== "server") return;
      function next() { if (i >= list.length) return; var t = speechify(list[i++]); fetchAudio(t, self.base).catch(function () {}).then(next); }
      next();
    },
    /* Одна реплика. Каждый вызов получает номер поколения: если пока грузился звук, начали говорить что-то
       новое, запоздавший ответ не воспроизводится — голоса не накладываются. */
    speak: function (text) {
      var self = this;
      if (!self.enabled || !text) return Promise.resolve(false);
      self.cancel();
      var t = speechify(text), gen = ++generation;
      self.speaking = true;
      var p = self.provider === "server"
        ? fetchAudio(t, self.base).then(function (url) { if (gen !== generation) return false; return playUrl(url); })
                                   .catch(function () { if (gen !== generation) return false; return speakBrowser(t); })
        : speakBrowser(t);
      return p.then(function (r) { if (gen === generation) self.speaking = false; return r; }, function () { if (gen === generation) self.speaking = false; return false; });
    },
    /* Длинный текст (разбор, ответ чата): режем по предложениям и играем по очереди, следующий кусок
       грузится пока звучит текущий — старт через секунду, а не после генерации всего текста. */
    speakLong: function (text) {
      var self = this;
      if (!self.enabled || !text) return Promise.resolve(false);
      if (self.provider !== "server") return self.speak(text);
      var parts = [], cur = "";
      String(text).split(/(?<=[.!?…])\s+/).forEach(function (sn) {
        if ((cur + " " + sn).trim().length > 220 && cur) { parts.push(cur.trim()); cur = sn; } else cur = (cur + " " + sn).trim();
      });
      if (cur) parts.push(cur);
      self.cancel();
      var gen = ++generation, group = "g" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      self.speaking = true;
      var i = 0;
      function step() {
        if (gen !== generation) return Promise.resolve(false);
        if (i >= parts.length) { self.speaking = false; return Promise.resolve(true); }
        var t = speechify(parts[i++]);
        var current = fetchAudio(t, self.base, group);
        if (i < parts.length) current.then(function () { fetchAudio(speechify(parts[i]), self.base, group).catch(function () {}); }, function () {});
        return current.then(function (url) { if (gen !== generation) return false; return playUrl(url); })
          .catch(function () { if (gen !== generation) return false; return speakBrowser(t); })
          .then(step);
      }
      return step();
    },
    cancel: function () { generation++; if (synth) synth.cancel(); if (current) { try { current.pause(); } catch (e) {} current = null; } this.speaking = false; }
  };

  root.Voice = { stt: stt, tts: tts, speechify: speechify };
})(window);
