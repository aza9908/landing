/*
  Стеклянные 3D-объекты для тёмных шапок: звезда AIRL и спираль ДНК.
  Рисуются в браузере (WebGL), поэтому вращение идеально ровное, а резкость —
  под любой экран. Раньше здесь были видео из 5-секундного рендера: их
  приходилось растягивать, отсюда рывки и пиксели.

  Разметка:  <div class="hero__art" data-crystal="star|dna"><img …запасная картинка…></div>
  Пока скрипт грузится (или если WebGL недоступен) видна картинка.

  Сборка в /crystal3d.js (three.js вшивается в файл, внешних запросов нет):
    npm i --no-save three esbuild
    npx esbuild scripts/crystal3d.src.js --bundle --minify --format=esm --target=es2020 --outfile=crystal3d.js
*/
import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color,
  CylinderGeometry, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  PerspectiveCamera, PMREMGenerator, Scene, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';

const TAU = Math.PI * 2;

/* ── Свет: тёмная студия с несколькими яркими панелями. Они и дают блики,
      которые «бегут» по стеклу при вращении. Цвета — из палитры сайта. ── */
function studio(renderer) {
  const scene = new Scene();
  const room = new Mesh(new BoxGeometry(40, 40, 40), new MeshBasicMaterial({ color: 0x20202b, side: BackSide }));
  scene.add(room);
  const panel = (w, h, color, k, pos, look = [0, 0, 0]) => {
    const m = new Mesh(new BoxGeometry(w, h, 0.05), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k) }));
    m.position.set(...pos); m.lookAt(...look); scene.add(m);
  };
  panel(9, 5, 0xffffff, 7, [-6, 9, 8]);          // большой мягкий верхний свет
  panel(1.2, 14, 0xffffff, 16, [11, 2, 4]);      // узкая полоса справа — резкий блик
  panel(1.0, 12, 0xdfe6ff, 12, [-12, -1, 2]);    // полоса слева
  panel(6, 4, 0x8b7bff, 7, [7, 5, -10]);         // фиолетовый контровой
  panel(6, 4, 0x58c8ff, 6, [-8, -3, -10]);       // голубой контровой
  panel(4, 2.5, 0xffb07a, 6, [3, -9, 6]);        // тёплый снизу
  panel(14, 14, 0xe8e6ff, 0.9, [0, 3, 16]);      // большая мягкая фронтальная заливка — чтобы читались грани
  // мягкие большие панели вокруг — у каждой грани есть что отражать
  panel(16, 16, 0xc9cdfa, 1.1, [-16, 2, 0]);
  panel(16, 16, 0xd9d6ff, 1.1, [16, 0, 0]);
  panel(16, 16, 0xf2f2ff, 1.4, [0, 16, 0]);
  panel(16, 16, 0x9aa0d8, 0.8, [0, -16, 0]);
  panel(16, 16, 0xb8b4f0, 0.9, [0, 0, -16]);
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return env;
}

function glass(extra = {}) {
  return new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.035,
    transmission: 1, thickness: 0.9, ior: 1.5, dispersion: 6,
    attenuationColor: new Color(0xbfc4ff), attenuationDistance: 2.4,
    iridescence: 0.75, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620],
    clearcoat: 1, clearcoatRoughness: 0.03,
    specularIntensity: 1, envMapIntensity: 1.35,
    side: DoubleSide,
    ...extra,
  });
}

/* ── Звезда: четырёхлучевая, с вогнутыми сторонами и рёбрами от центра к
      лучам (как у знака AIRL), в центре — стеклянный шар. ── */
function starGeometry({ w = 1.02, h = 1.42, depth = 0.34, edge = 0.014, p = 0.66, seg = 40, rings = 22 } = {}) {
  const pos = [];
  const idx = [];
  const e = 2 / p;
  // контур: |x/w|^p + |y/h|^p = 1 — вогнутая «астроида»
  const rim = (q, a) => {
    const t = (a / seg) * (Math.PI / 2);
    const c = Math.cos(t) ** e, s = Math.sin(t) ** e;
    const sx = q === 0 || q === 3 ? 1 : -1, sy = q < 2 ? 1 : -1;
    return q % 2 === 0 ? [sx * w * c, sy * h * s] : [sx * w * s, sy * h * c];
  };
  for (const side of [1, -1]) {
    for (let q = 0; q < 4; q++) {           // у каждой четверти свои вершины → рёбра по осям остаются острыми
      const base = pos.length / 3;
      for (let a = 0; a <= seg; a++) {
        const [bx, by] = rim(q, a);
        for (let r = 0; r <= rings; r++) {
          const k = r / rings;
          const z = edge + (depth - edge) * (1 - k);   // ровный скат от центра к контуру: рёбра к лучам, ложбины к углам
          pos.push(bx * k, by * k, side * z);
        }
      }
      const row = rings + 1;
      for (let a = 0; a < seg; a++) for (let r = 0; r < rings; r++) {
        const i0 = base + a * row + r, i1 = i0 + 1, i2 = i0 + row, i3 = i2 + 1;
        const flip = (q % 2 === 0) === (side === 1);
        if (flip) idx.push(i0, i2, i1, i1, i2, i3); else idx.push(i0, i1, i2, i1, i3, i2);
      }
    }
  }
  // тонкая боковая грань по контуру
  for (let q = 0; q < 4; q++) {
    const base = pos.length / 3;
    for (let a = 0; a <= seg; a++) { const [x, y] = rim(q, a); pos.push(x, y, edge, x, y, -edge); }
    for (let a = 0; a < seg; a++) {
      const i0 = base + a * 2;
      if (q % 2 === 0) idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      else idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildStar() {
  const group = new Group();
  group.add(new Mesh(starGeometry(), glass({
    // чуть «молочное» стекло: у каждой грани есть собственный тон, она не пропадает в темноте
    color: 0xd9dcff, transmission: 0.86, ior: 1.7, thickness: 0.6, dispersion: 7,
    iridescence: 0.3, iridescenceThicknessRange: [120, 380],
  })));
  const ball = new Mesh(new SphereGeometry(0.37, 96, 64), glass({
    color: 0xe4e6ff, transmission: 0.86, thickness: 1.6, ior: 1.46, dispersion: 3, roughness: 0.02, iridescence: 0.35,
    attenuationColor: new Color(0xa9b2ff), attenuationDistance: 1.6, side: FrontSide,
  }));
  group.add(ball);
  return { group, fit: 1.86, tilt: [0.1, 0, 0] };
}

/* ── ДНК: две стеклянные ленты-спирали и перемычки между ними ── */
function ribbonGeometry(phase, { R = 0.5, H = 3.1, turns = 1.55, a = 0.2, b = 0.055, n = 260, m = 20 } = {}) {
  const pos = [], idx = [];
  const P = new Vector3(), T = new Vector3(), N = new Vector3(), B = new Vector3(), V = new Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n, ang = phase + u * turns * TAU, y = (u - 0.5) * H;
    P.set(R * Math.cos(ang), y, R * Math.sin(ang));
    T.set(-R * Math.sin(ang) * turns * TAU, H, R * Math.cos(ang) * turns * TAU).normalize();
    N.set(Math.cos(ang), 0, Math.sin(ang));             // от оси наружу
    B.crossVectors(T, N).normalize();
    const end = Math.min(u, 1 - u) / 0.09;                       // концы ленты сходят на нет
    const k = end < 1 ? Math.max(0.001, Math.sin(end * Math.PI / 2)) : 1;
    for (let j = 0; j < m; j++) {
      const t = (j / m) * TAU;
      // сечение — «суперэллипс»: плоская лента со скруглёнными краями
      const cx = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.75 * a * k;
      const cy = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.75 * b * k;
      V.copy(P).addScaledVector(B, cx).addScaledVector(N, cy);
      pos.push(V.x, V.y, V.z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a0 = i * m + j, a1 = i * m + (j + 1) % m, b0 = a0 + m, b1 = a1 + m;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildDna() {
  const group = new Group();
  const R = 0.5, H = 3.1, turns = 1.55;
  const mat = glass({ thickness: 0.5, dispersion: 8, iridescence: 0.9, attenuationDistance: 1.4 });
  group.add(new Mesh(ribbonGeometry(0, { R, H, turns }), mat));
  group.add(new Mesh(ribbonGeometry(Math.PI, { R, H, turns }), mat));
  const rungMat = glass({ thickness: 0.25, roughness: 0.06, dispersion: 4, iridescence: 0.5, attenuationDistance: 3 });
  const rung = new CylinderGeometry(0.034, 0.034, 2 * R - 0.06, 20, 1);
  const count = 15;
  for (let i = 0; i < count; i++) {
    const u = 0.1 + (i / (count - 1)) * 0.8, ang = u * turns * TAU;
    const m = new Mesh(rung, rungMat);
    m.position.set(0, (u - 0.5) * H, 0);
    m.rotation.set(0, -ang, Math.PI / 2);       // вдоль диаметра спирали
    group.add(m);
  }
  return { group, fit: 1.92, tilt: [0.06, 0, -0.12] };
}

const BUILD = { star: buildStar, dna: buildDna };

function mount(el) {
  const kind = el.dataset.crystal in BUILD ? el.dataset.crystal : 'star';
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { return; }                         // нет WebGL — остаётся картинка
  renderer.setClearColor(0x000000, 1);            // чёрный фон: в CSS он убирается через mix-blend-mode: screen
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.environment = studio(renderer);
  const { group, fit, tilt } = BUILD[kind]();
  const pivot = new Group();
  pivot.rotation.set(...tilt);
  pivot.add(group);
  scene.add(pivot);

  const camera = new PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, fit / Math.tan((26 / 2) * Math.PI / 180));

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', opacity: '0', transition: 'opacity .8s ease' });
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(canvas);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const speed = TAU / (kind === 'dna' ? 26 : 22);   // один оборот за 22–26 с
  // data-crystal-angle="1.2" — один неподвижный кадр под этим углом (для проверки вида)
  const fixed = el.dataset.crystalAngle !== undefined;
  let visible = false, raf = 0, last = 0, angle = fixed ? +el.dataset.crystalAngle : (kind === 'star' ? 0.5 : 0), shown = false, size = 0;

  function resize() {
    const s = Math.round(el.clientWidth);
    if (!s || s === size) return;
    size = s;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(s, s, false);
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!still.matches && !fixed) angle += speed * dt;
    group.rotation.y = angle;                       // вокруг собственной вертикальной оси
    resize();
    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      canvas.style.opacity = '1';
      el.classList.add('is-3d');                    // CSS прячет запасную картинку
    }
    if (!still.matches && !fixed) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; kick(); }, { rootMargin: '120px' }).observe(el);
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('resize', () => { resize(); kick(); }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); canvas.style.opacity = '0'; el.classList.remove('is-3d'); });
  canvas.addEventListener('webglcontextrestored', () => { shown = false; kick(); });
}

function init() { document.querySelectorAll('[data-crystal]').forEach(mount); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
