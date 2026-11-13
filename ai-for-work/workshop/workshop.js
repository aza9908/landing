/* «Нам доверяют»: по клику фото выезжает из карточки и показывается целиком
   (в карточке оно обрезано под формат). Только на компьютере — на телефоне
   фото и так видны полностью и цветные, без эффекта. */
(function () {
  var desktop = window.matchMedia('(hover: hover) and (min-width: 768px)');
  var EASE = 'cubic-bezier(.22, 1, .36, 1)';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function open(fig) {
    var thumb = fig.querySelector('img');
    var caption = fig.querySelector('figcaption');
    var from = thumb.getBoundingClientRect();

    var box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', thumb.alt);
    box.innerHTML =
      '<button class="lightbox__close" type="button" aria-label="Закрыть">×</button>' +
      '<figure class="lightbox__fig"><img class="lightbox__img" alt="" /><figcaption class="lightbox__cap"></figcaption></figure>';
    var img = box.querySelector('img');
    img.src = thumb.currentSrc || thumb.src;
    img.alt = thumb.alt;
    box.querySelector('figcaption').textContent = caption ? caption.textContent : '';

    // Размер «во весь кадр»: пропорции оригинала, до 90 % ширины и 78 % высоты экрана
    var nw = thumb.naturalWidth || 4, nh = thumb.naturalHeight || 3;
    var k = Math.min(window.innerWidth * 0.9 / nw, window.innerHeight * 0.78 / nh);
    img.style.width = Math.round(nw * k) + 'px';
    img.style.height = Math.round(nh * k) + 'px';

    document.body.appendChild(box);
    document.body.classList.add('lightbox-open');
    var to = img.getBoundingClientRect();

    // Старт: фото в масштабе и обрезке карточки, финиш — целиком
    var s = Math.max(from.width / to.width, from.height / to.height);
    var dx = from.left + from.width / 2 - (to.left + to.width / 2);
    var dy = from.top + from.height / 2 - (to.top + to.height / 2);
    var ix = Math.max(0, (to.width - from.width / s) / 2);
    var iy = Math.max(0, (to.height - from.height / s) / 2);
    var start = {
      transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')',
      clipPath: 'inset(' + iy + 'px ' + ix + 'px round ' + 18 / s + 'px)',
      filter: 'grayscale(1)',
    };
    var end = { transform: 'none', clipPath: 'inset(0px 0px round 14px)', filter: 'grayscale(0)' };
    var dur = reduce.matches ? 0 : 520;
    img.animate([start, end], { duration: dur, easing: EASE });
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.6, easing: 'ease-out' });

    var closing = false;
    function close() {
      if (closing) return;
      closing = true;
      var back = thumb.getBoundingClientRect();
      start.transform = 'translate(' + (back.left + back.width / 2 - (to.left + to.width / 2)) + 'px,' +
        (back.top + back.height / 2 - (to.top + to.height / 2)) + 'px) scale(' + s + ')';
      var d = reduce.matches ? 0 : 380;
      img.animate([end, start], { duration: d, easing: EASE, fill: 'forwards' });
      var fade = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: 'ease-in', fill: 'forwards' });
      fade.onfinish = function () {
        box.remove();
        document.body.classList.remove('lightbox-open');
        fig.focus({ preventScroll: true });
      };
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    box.querySelector('.lightbox__close').focus({ preventScroll: true });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.gallery figure'), function (fig) {
    fig.tabIndex = 0;
    fig.setAttribute('role', 'button');
    fig.setAttribute('aria-label', 'Открыть фото целиком: ' + (fig.querySelector('img') || {}).alt);
    fig.addEventListener('click', function () { if (desktop.matches) open(fig); });
    fig.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && desktop.matches) { e.preventDefault(); open(fig); }
    });
  });
})();
