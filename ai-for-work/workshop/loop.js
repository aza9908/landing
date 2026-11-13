/* Бесшовное зацикливание видео со звездой.
   Обычный <video loop> на стыке конец→начало на долю секунды притормаживает —
   вращение «дёргается». На компьютере берём ролик с запасом (data-loop-src:
   после data-loop-len секунд он ещё 0,7 с повторяет своё начало) и держим два
   экземпляра: когда первый доходит до конца оборота, второй уже идёт в той же
   фазе, и они плавно меняются местами. На телефоне остаётся лёгкий ролик с
   обычным loop (он там фоновый и приглушён). */
(function () {
  var FADE = 0.35;
  var desktop = window.matchMedia('(min-width: 768px) and (hover: hover)');
  if (!desktop.matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  Array.prototype.forEach.call(document.querySelectorAll('[data-loop-src]'), function (box) {
    var first = box.querySelector('video');
    var len = parseFloat(box.dataset.loopLen);
    if (!first || !len) return;
    var second = first.cloneNode(false);
    [first, second].forEach(function (v) {
      v.removeAttribute('loop'); v.loop = false;
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.src = box.dataset.loopSrc;
      v.style.transition = 'opacity ' + FADE + 's linear';
    });
    second.removeAttribute('autoplay'); second.autoplay = false;
    second.style.opacity = '0';
    box.appendChild(second);

    var cur = first, next = second, swapping = false, visible = true;
    cur.play().catch(function () {});

    function tick() {
      if (visible && !swapping && cur.currentTime >= len && next.readyState >= 2) {
        swapping = true;
        var from = cur, to = next;
        to.currentTime = from.currentTime - len + 0.04;   // та же фаза вращения (+ поправка на запуск)
        to.play().catch(function () {});
        to.style.opacity = '1'; from.style.opacity = '0';
        cur = to; next = from;
        setTimeout(function () { from.pause(); from.currentTime = 0; swapping = false; }, FADE * 1000 + 150);
      }
      // страховка: если подмена не успела (вкладка спала), просто начинаем круг заново
      if (!swapping && cur.ended) { cur.currentTime = 0; cur.play().catch(function () {}); }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // вне экрана не декодируем видео зря
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        if (visible) cur.play().catch(function () {}); else { cur.pause(); if (!swapping) next.pause(); }
      }, { rootMargin: '150px' }).observe(box);
    }
  });
})();
