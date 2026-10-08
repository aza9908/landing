"""Собирает airl.kz/diagnostics (экспресс-диагностику AI) из base-artifact.html.
Запуск из корня репозитория:  python3 express-diagnostics/build.py  → diagnostics.html

Исходник бота — base-artifact.html (интерфейс, логика, голос). Сборка вшивает в него
актуальные report.js и voice.js, применяет настройки публичной версии и добавляет
delivery.js: код группы из ссылки, абзац и PDF-summary для клиента, отправку в Telegram.
Ключей в результате нет: Telegram и Firestore берутся из /firebase-bridge.js лендинга."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "diagnostics.html"
s = (ROOT / "base-artifact.html").read_text(encoding="utf-8")

# 0. всегда вшиваем АКТУАЛЬНЫЕ report.js и voice.js (первые два <script> в базе), чтобы копия не устаревала
_report = (ROOT / "report.js").read_text(encoding="utf-8")
_voice = (ROOT / "voice.js").read_text(encoding="utf-8")
_blocks = list(re.finditer(r"<script>\n([\s\S]*?)\n</script>", s))
assert len(_blocks) >= 3 and "ExpressReport" in _blocks[0].group(1) and "Voice" in _blocks[1].group(1), "структура базы изменилась"
s = s[:_blocks[0].start(1)] + _report.rstrip("\n") + s[_blocks[0].end(1):]
_blocks = list(re.finditer(r"<script>\n([\s\S]*?)\n</script>", s))
s = s[:_blocks[1].start(1)] + _voice.rstrip("\n") + s[_blocks[1].end(1):]
(ROOT / "base-artifact.html").write_text(s, encoding="utf-8")
assert "toManagerHtml" in s and "icp:" in s, "report.js не вшился"

def rep(old, new, count=1):
    global s
    assert old in s, "не найдено: " + old[:70]
    s = s.replace(old, new, count)

# 1. конфиг публичной версии: отчёт клиенту не показываем, контакт спрашиваем, чат участников — вписать ссылку
rep('var CFG = { whatsapp: "77072314955", lead: "https://airl.kz/", askContact: true, showReportToClient: true, communityChat: "" };',
    'var CFG = { whatsapp: "77072212930", lead: "https://airl.kz/", askContact: true, showReportToClient: false, communityChat: "", collection: "express_diagnostics", storeInFirestore: true };\n'
    '// storeInFirestore:true — результат пишется в Firestore express_diagnostics (правила разрешают только create), отсюда его читает статистика лидов stats.html.\n'
    '// showReportToClient:false — клиент видит только экран «Спасибо», полный разбор приходит от менеджера. Команда видит всё по адресу #airl-team.\n'
    '// communityChat — ссылка на единый чат участников (Telegram/WhatsApp): появится кнопка на экране «Спасибо».\n'
    '// Уведомления менеджеру и Firestore берутся из firebase-bridge.js лендинга airl.kz (window.AIRL_notifyTelegram, window.AIRL_TELEGRAM, window.AIRL_FIREBASE_CONFIG) — ключей здесь нет.')

# 2. доставка разбора менеджеру: Telegram (сводка + документ HTML) и Firestore
rep('function applyCapsToResult(){', '''function tgMessage(a, r){
  var L = ["🧭 Экспресс-диагностика AI", a.name + " — " + a.position + ", " + a.company, "Отрасль: " + (a.industry || "—") + " · Команда: " + (a.team_size || "—") + " · Контакт: " + (a.contact || "не указан"),
    "Уровень: " + r.level + " (" + r.score + "/16) · Сегмент: " + r.segment.name + " · Лид: " + r.tierRu + " " + r.heat + "/14" + (r.priority ? " · ⚑ ПРИОРИТЕТ ДЛЯ ЗВОНКА" : ""),
    "ICP: " + r.icp.verdict, "Шаг воронки: " + r.icp.funnel, "Точка входа: " + r.segment.entry, "Триггер: " + r.trigger, "",
    "Зоны роста:"].concat(r.zones.map(function(z){ return z.n + ") " + z.title + " — первый шаг: " + z.first; }), ["",
    "Пробелы: " + r.gaps.map(function(g){ return g.title; }).join("; "), "Функция: " + r.effectFunction + " · Барьер: " + (a.q6 || "—"), "",
    "Что болит:"].concat(r.pains.map(function(p){ return "• " + p; }), ["", "Ответы: " + R.answersTable(a).filter(function(x){ return x.n; }).map(function(x){ return x.n + "=" + x.answer.split(".")[0]; }).join(", "), "Следом придут PDF для клиента и отчёт для менеджера. Страница: airl.kz/diagnostics"]));
  return L.join("\\n").slice(0, 3800);
}
function fsFields(obj){ var out = {}; Object.keys(obj).forEach(function(k){ var v = obj[k]; if (v === null || v === undefined || v === "") return; if (typeof v === "number") out[k] = { integerValue: String(v) }; else if (typeof v === "boolean") out[k] = { booleanValue: v }; else out[k] = { stringValue: String(v) }; }); return out; }
function deliver(a, r){
  setSent("Отправляем разбор менеджеру…");
  var fail = function(){ setSent("Автоматическая отправка не сработала — напишите менеджеру в WhatsApp, он соберёт разбор вручную.", true); };
  if (!window.AIRLDelivery) { fail(); return; }
  var html = R.toManagerHtml(a, r, null, { date: new Date().toLocaleDateString("ru-RU"), source: "airl.kz/diagnostics" });
  window.AIRLDelivery.deliver(a, r, { summary: tgMessage(a, r), managerHtml: html,
    managerFile: "otchet-" + String(a.company || "client").replace(/[^A-Za-zА-Яа-я0-9_-]+/g, "_").slice(0, 40) + ".html" })
    .then(function(sent){
      if (sent.message || sent.pdf || sent.html) setSent("Ответы переданы менеджеру AIRL. Разбор придёт " + (a.contact ? "на " + a.contact : "лично от менеджера") + ".");
      else fail();
    }, fail);
  var fc = window.AIRL_FIREBASE_CONFIG || {};
  if (CFG.storeInFirestore && fc.apiKey && fc.projectId) {
    var flat = { name: a.name, company: a.company, position: a.position, industry: a.industry, team_size: a.team_size, contact: a.contact, q1: a.q1, q2: a.q2, q3: a.q3, q4: a.q4, q5: a.q5, q6: a.q6, q7: a.q7, q8: a.q8,
      group_code: window.AIRLDelivery.group.code, score: r.score, level: r.level, priority: r.priority, segment: r.segment.name, tier: r.tier, heat: r.heat, icp: r.icp.verdict, trigger: r.trigger, report_markdown: fullMarkdown(), source: "airl.kz/diagnostics", status: "new", created_at: new Date().toISOString(), bot: "express-diagnostics" };
    var attr = window.AIRL_ATTR ? window.AIRL_ATTR() : {};
    ["utm_source", "utm_medium", "utm_campaign", "referrer", "landing"].forEach(function(k){ if (attr[k]) flat[k] = attr[k]; });
    fetch("https://firestore.googleapis.com/v1/projects/" + fc.projectId + "/databases/(default)/documents/" + CFG.collection + "?key=" + fc.apiKey, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: fsFields(flat) }) }).catch(function(){});
  }
}
function applyCapsToResult(){''')

# 3. блок менеджера — по хешу #airl-team; сохранение файла — всегда; экран результата только в режиме команды
rep('$("aiCard").hidden = !cap.sample; $("qaCard").hidden = !cap.sample; $("mgrCard").hidden = !cap.canEdit; $("saveReport").hidden = !cap.downloads;',
    '$("aiCard").hidden = !cap.sample; $("qaCard").hidden = !cap.sample; $("mgrCard").hidden = !(cap.canEdit || teamMode()); $("saveReport").hidden = false;')
rep('''$("saveReport").addEventListener("click", function(){
  if (!cap.downloads) return; var btn = this; btn.disabled = true;
  var name = "airl-diagnostics-" + String(state.answers.company || "report").replace(/[^A-Za-zА-Яа-я0-9_-]+/g, "_").slice(0, 40) + ".md";
  cap.downloads.save({ filename: name, data: cap.canEdit ? fullMarkdown() : clientMarkdown() }).catch(function(){}).then(function(){ btn.disabled = false; });
});''', '''$("saveReport").addEventListener("click", function(){
  var btn = this; btn.disabled = true;
  var name = "airl-diagnostics-" + String(state.answers.company || "report").replace(/[^A-Za-zА-Яа-я0-9_-]+/g, "_").slice(0, 40) + ".md";
  var data = (cap.canEdit || teamMode()) ? fullMarkdown() : clientMarkdown();
  if (cap.downloads) { cap.downloads.save({ filename: name, data: data }).catch(function(){}).then(function(){ btn.disabled = false; }); return; }
  try { var url = URL.createObjectURL(new Blob([data], { type: "text/markdown;charset=utf-8" })); var link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function(){ URL.revokeObjectURL(url); }, 2000); } catch (e) {}
  btn.disabled = false;
});''')
rep('<span id="sentText">Разбор собран на вашем устройстве. Кнопка WhatsApp отправит его менеджеру AIRL вместе с вашими ответами.</span>', '<span id="sentText">Отправляем разбор менеджеру…</span>')
rep('<a class="btn wa" id="ctaWa" href="#" target="_blank" rel="noopener">Отправить разбор менеджеру в WhatsApp</a>', '<a class="btn wa" id="ctaWa" href="#" target="_blank" rel="noopener">Обсудить разбор в WhatsApp</a>')

html = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="description" content="Экспресс-диагностика AI-трансформации компании от AI Research Lab: 8 вопросов, разбор от менеджера — уровень зрелости, карта пробелов и что делать первым.">\n'
        '<meta property="og:title" content="Экспресс-диагностика AI — AI Research Lab">\n<meta property="og:description" content="5 минут: где ваша компания теряет на AI прямо сейчас.">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%236E56F5%27/%3E%3Ccircle cx=%2724%27 cy=%2734%27 r=%275%27 fill=%27white%27/%3E%3Ccircle cx=%2740%27 cy=%2734%27 r=%275%27 fill=%27white%27/%3E%3C/svg%3E">\n'
        '<meta name="robots" content="noindex">\n'
        '<script src="https://airl.kz/firebase-bridge.js?v=27"></script>\n'
        '<script src="/airl-attr.js?v=1"></script>\n'
        + s.replace("<title>Экспресс-диагностика AI</title>", "<title>Экспресс-диагностика AI — AI Research Lab</title>", 1).replace("</style>", "</style>\n</head>\n<body>", 1)
        + "\n<script>\n" + (ROOT / "delivery.js").read_text(encoding="utf-8").rstrip("\n") + "\n</script>\n</body>\n</html>\n")
out = OUT
out.write_text(html, encoding="utf-8")
assert "botToken:" not in html and "AIza" not in html, "в файле не должно быть ключей"
print("собрано:", out, len(html) // 1024, "KB")
