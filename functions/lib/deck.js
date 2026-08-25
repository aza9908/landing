"use strict";

/*
  Рендер презентации урока в один HTML-файл: тёмная тема AIRL, листается
  стрелками, печатается в PDF через Cmd+P. Ничего не устанавливается,
  файл открывается двойным кликом и работает без интернета.
*/

const CSS = `
:root{
  --ink:#0B0B12; --ink-2:#14141F; --line:#2A2A3C;
  --text:#EDEDF5; --muted:#9A9AB0; --accent:#5B5BCA; --accent-soft:#8A8AE0;
  --warm:#E0B15B;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05050A;color:var(--text);
  font-family:"Inter Tight","Inter",-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.deck{width:100%}
.slide{position:relative;width:100vw;height:100vh;display:none;
  flex-direction:column;justify-content:center;padding:6vh 8vw;background:var(--ink);
  border-bottom:1px solid var(--line)}
.slide.on{display:flex}
.eyebrow{font-size:1.05vw;letter-spacing:.18em;text-transform:uppercase;
  color:var(--accent-soft);font-weight:600;margin-bottom:2.4vh}
h1{font-size:5.6vw;line-height:1.02;font-weight:800;letter-spacing:-.02em}
h2{font-size:3.6vw;line-height:1.08;font-weight:700;letter-spacing:-.015em}
.sub{font-size:1.7vw;color:var(--muted);margin-top:2.6vh;max-width:60ch;line-height:1.45}
.body{font-size:1.9vw;line-height:1.5;margin-top:3vh;max-width:58ch;color:var(--text)}
.rule{width:12vw;height:4px;background:var(--accent);margin:3.4vh 0}
ul{list-style:none;margin-top:3vh}
li{font-size:2vw;line-height:1.35;padding:1.5vh 0 1.5vh 3.4vw;position:relative;
  border-top:1px solid var(--line)}
li:last-child{border-bottom:1px solid var(--line)}
li::before{content:attr(data-n);position:absolute;left:0;top:1.6vh;
  font-family:"Victor Mono",ui-monospace,"SF Mono",Menlo,monospace;
  font-size:1.3vw;color:var(--accent-soft);font-weight:600}
li b{color:#fff;font-weight:700}
.prompt{margin-top:3vh;background:var(--ink-2);border:1px solid var(--line);
  border-left:5px solid var(--accent);border-radius:10px;padding:3.4vh 3vw}
.prompt pre{font-family:"Victor Mono",ui-monospace,"SF Mono",Menlo,monospace;
  font-size:1.85vw;line-height:1.5;white-space:pre-wrap;color:#fff}
.result{margin-top:3vh;font-size:1.5vw;color:var(--muted);max-width:66ch}
.result b{color:var(--warm);font-weight:600}
.big{font-size:8vw;font-weight:800;letter-spacing:-.03em;color:var(--accent-soft)}
.foot{position:absolute;left:8vw;right:8vw;bottom:3.4vh;display:flex;
  justify-content:space-between;font-size:1vw;color:#5A5A70;
  border-top:1px solid var(--line);padding-top:1.6vh}
.foot .num{font-family:"Victor Mono",ui-monospace,monospace}
.bar{position:fixed;left:0;top:0;height:3px;background:var(--accent);z-index:9;transition:width .2s}
.hint{position:fixed;right:1.6vw;bottom:1.6vh;font-size:.85vw;color:#3A3A4C;z-index:9}
.center{align-items:center;text-align:center;justify-content:center}
.center .sub{max-width:48ch}
@media print{
  @page{size:landscape;margin:0}
  body{background:#fff}
  .slide{display:flex!important;page-break-after:always;height:100vh;
    width:100vw;border:none}
  .bar,.hint{display:none}
}
@media (max-width:900px){
  h1{font-size:9vw}h2{font-size:6.4vw}.prompt pre{font-size:3.6vw}
  li{font-size:4vw;padding-left:8vw}.sub,.body{font-size:4vw}
  .eyebrow,.foot,.result{font-size:2.6vw}
}
`;

const JS = `
const slides=[...document.querySelectorAll('.slide')];let i=0;
const bar=document.querySelector('.bar');
function show(n){i=Math.max(0,Math.min(slides.length-1,n));
  slides.forEach((s,k)=>s.classList.toggle('on',k===i));
  bar.style.width=((i+1)/slides.length*100)+'%';
  location.hash=i+1;}
document.addEventListener('keydown',e=>{
  if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();show(i+1)}
  if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}
  if(e.key==='Home')show(0); if(e.key==='End')show(slides.length-1);});
document.addEventListener('click',e=>{if(!e.target.closest('a'))show(i+1)});
let x0=null;
addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true});
addEventListener('touchend',e=>{if(x0===null)return;
  const d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>50)show(i+(d<0?1:-1));x0=null;},{passive:true});
addEventListener('hashchange',()=>{const n=parseInt(location.hash.slice(1))-1;if(n!==i&&!isNaN(n))show(n)});
show(parseInt(location.hash.slice(1))-1||0);
`;

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* **жирный** внутри пунктов и абзацев */
function inline(text) {
  let out = esc(text);
  while ((out.match(/\*\*/g) || []).length >= 2) {
    out = out.replace("**", "<b>").replace("**", "</b>");
  }
  return out;
}

function foot(deck, n, total) {
  const left = esc(`${deck.company || ""} · ${deck.lesson || ""}`);
  const pad = (x) => String(x).padStart(2, "0");
  return `<div class="foot"><span>${left}</span>` +
         `<span class="num">${pad(n)} / ${pad(total)}</span></div>`;
}

function slideHtml(s, deck, n, total) {
  const f = foot(deck, n, total);
  const eyebrow = s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : "";
  const sub = s.subtitle ? `<div class="sub">${esc(s.subtitle)}</div>` : "";

  switch (s.type) {
    case "title":
      return `<section class="slide">${eyebrow}<h1>${esc(s.title)}</h1>` +
             `<div class="rule"></div>${sub}${f}</section>`;

    case "break":
      return `<section class="slide center"><div class="big">${esc(s.title)}</div>` +
             `${sub}${f}</section>`;

    case "prompt": {
      const result = s.result ? `<div class="result">${inline(s.result)}</div>` : "";
      return `<section class="slide">${eyebrow}<h2>${esc(s.title)}</h2>` +
             `<div class="prompt"><pre>${esc(s.prompt)}</pre></div>${result}${f}</section>`;
    }

    case "list":
    case "steps":
    case "question": {
      const items = (s.items || [])
        .map((it, i) => `<li data-n="${String(i + 1).padStart(2, "0")}">${inline(it)}</li>`)
        .join("");
      return `<section class="slide">${eyebrow}<h2>${esc(s.title)}</h2>${sub}` +
             `<ul>${items}</ul>${f}</section>`;
    }

    case "final":
      return `<section class="slide center">${eyebrow}<h1>${esc(s.title)}</h1>` +
             `<div class="rule" style="margin-left:auto;margin-right:auto"></div>` +
             `${sub}${f}</section>`;

    default: {
      const body = s.body ? `<div class="body">${inline(s.body)}</div>` : "";
      return `<section class="slide">${eyebrow}<h2>${esc(s.title)}</h2>` +
             `<div class="rule"></div>${sub}${body}${f}</section>`;
    }
  }
}

function renderDeck(deck) {
  const slides = deck.slides || [];
  if (!slides.length) throw new Error("В презентации нет слайдов.");

  const total = slides.length;
  const body = slides.map((s, i) => slideHtml(s, deck, i + 1, total)).join("\n");
  const title = `${deck.lesson || "Урок"} — ${deck.company || ""}`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body><div class="bar"></div><div class="deck">${body}</div>
<div class="hint">← → листать · Cmd+P — PDF</div>
<script>${JS}</script></body></html>`;
}

module.exports = { renderDeck };
