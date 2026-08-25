"use strict";

/*
  Сборка реестра процессов в Excel. Формат один в один повторяет реестр
  AI Research Lab × Kaizen: те же листы, колонки и живые формулы.
  Клиент открывает файл и продолжает работать в привычной таблице.

  Приоритет считают формулы Excel, а не модель и не этот код: клиент может
  менять веса на листе «Настройки», и всё пересчитывается у него на глазах.
*/

const ExcelJS = require("exceljs");

const FIRST = 8;
const LAST = 107;

// Направления компании: фиксированный порядок, чтобы Сводка и Настройки
// всегда показывали все четыре, даже если по какому-то нет ни одного ответа.
const TEAMS = ["HR", "Finance", "Marketing & Sales", "CEO"];
const ACCENT = "FF5B5BCA";
const INK = "FF1F2430";

const COLUMNS = [
  ["№", 5.3], ["Команда*", 13.9], ["Ответственные", 16.7], ["Процесс*", 23.3],
  ["Результат процесса", 21.1], ["Получатель результата", 17.2],
  ["Краткие шаги / вход → выход", 25.6], ["Частота*", 13.3],
  ["Выполнений в месяц*", 11.7], ["Время 1 цикла, мин*", 12.2],
  ["Участников*", 8.9], ["Трудозатраты в месяц, ч", 13.3],
  ["Текущие инструменты", 17.8], ["Доля ручной работы*", 11.7],
  ["Главная проблема / потери", 24.4], ["Повторяемость, 1–5*", 11.7],
  ["Ошибки / риск, 1–5*", 11.7], ["Влияние на клиента / выручку, 1–5*", 13.3],
  ["Данные в цифровом виде, 1–5*", 12.8], ["Стандартизированность, 1–5*", 13.9],
  ["Идея применения AI", 25.6], ["Ожидаемая экономия времени*", 12.2],
  ["Сложность внедрения, 1–5*", 12.2], ["Конфиденциальность*", 13.9],
  ["Объём трудозатрат, 1–5", 12.2], ["Приоритет AI, 0–100", 11.1],
  ["Категория", 17.2], ["Цель MVP за 6 недель", 25.6], ["Владелец пилота", 13.9],
  ["Статус", 13.9], ["Ссылка / комментарий", 25.6]
];

const CALC = new Set([1, 12, 25, 26, 27]);

const FREQUENCIES = ["Несколько раз в день", "Ежедневно", "Еженедельно",
  "Ежемесячно", "Ежеквартально", "По событию", "Реже"];
const STATUSES = ["К описанию", "На оценке", "Выбран в пилот", "В разработке",
  "Тестируется", "Внедрён", "Отложен"];
const CONFIDENTIALITY = [["Низкая", 1], ["Средняя", 0.9], ["Высокая", 0.75]];
const WEIGHTS = [
  ["Объём трудозатрат", 0.2], ["Доля ручной работы", 0.1], ["Повторяемость", 0.1],
  ["Ошибки / риск", 0.1], ["Влияние на результат", 0.15],
  ["Данные в цифровом виде", 0.1], ["Стандартизированность", 0.1],
  ["Ожидаемая экономия времени", 0.1], ["Простота внедрения", 0.05]
];
const VOLUME = [[0, 1], [2, 2], [5, 3], [10, 4], [25, 5]];
const CATEGORY = [[75, "P1 — пилот сейчас"], [60, "P2 — второй эшелон"],
  [45, "P3 — после уточнения"], [0, "Не сейчас"]];

const font = (o = {}) => Object.assign({ name: "Arial", size: 10, color: { argb: "FF1F2430" } }, o);
const head = () => font({ bold: true });
const box = {
  top: { style: "thin", color: { argb: "FFD0D0D8" } },
  left: { style: "thin", color: { argb: "FFD0D0D8" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D8" } },
  right: { style: "thin", color: { argb: "FFD0D0D8" } }
};
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function priorityFormula(r) {
  const S = "Настройки";
  return (
    `IF(OR(N${r}="",P${r}="",Q${r}="",R${r}="",S${r}="",T${r}="",V${r}="",` +
    `W${r}="",X${r}="",Y${r}=""),"",ROUND(((Y${r}/${S}!$K$3)*${S}!$B$13` +
    `+N${r}*${S}!$B$14+(P${r}/${S}!$K$3)*${S}!$B$15` +
    `+(Q${r}/${S}!$K$3)*${S}!$B$16+(R${r}/${S}!$K$3)*${S}!$B$17` +
    `+(S${r}/${S}!$K$3)*${S}!$B$18+(T${r}/${S}!$K$3)*${S}!$B$19` +
    `+V${r}*${S}!$B$20+((${S}!$K$3+1-W${r})/${S}!$K$3)*${S}!$B$21)*100` +
    `*IF(X${r}=${S}!$H$3,${S}!$I$3,IF(X${r}=${S}!$H$4,${S}!$I$4,${S}!$I$5)),0))`
  );
}

function buildStart(ws, data) {
  ws.getColumn(1).width = 100;
  const lines = [
    [`AI Research Lab × ${data.company} — портрет боли`, true],
    ["", false],
    [`Код группы: ${data.code}    Дата диагностики: ${data.date}`, false],
    ["", false],
    ["Файл собран из ответов сотрудников на форме диагностики airl.kz.", false],
    ["Один процесс — одна строка. Приоритет считается сам, менять его руками не нужно.", false],
    ["", false],
    ["Что где лежит", true],
    ["  Реестр процессов — все процессы с расчётом трудозатрат и приоритета", false],
    ["  Сводка — картина по командам: где больше всего часов и пилотов P1", false],
    ["  Настройки — веса критериев. Меняете вес — пересчитывается всё", false],
    ["", false],
    ["Как читать приоритет", true],
    ["  P1 — берём в пилот сейчас: часто, дорого по времени, руками, данные цифровые", false],
    ["  P2 — второй эшелон: сильный процесс, но что-то мешает начать сразу", false],
    ["  P3 — после уточнения: не хватает данных или процесс не устоялся", false],
    ["", false],
    ["Где оценка, а не факт — написано в колонке «Ссылка / комментарий».", false],
    ["Эти строки уточняются на созвоне перед воркшопом.", false]
  ];
  lines.forEach(([text, bold], i) => {
    const c = ws.getCell(i + 1, 1);
    c.value = text;
    c.font = i === 0 ? font({ bold: true, size: 14 }) : bold ? head() : font();
  });
}

function buildRegistrySheet(ws, data) {
  ws.getCell("A1").value = `Реестр процессов — ${data.company}: выбор процессов под AI`;
  ws.getCell("A1").font = font({ bold: true, size: 14 });

  [["A2", "Процессов заполнено"], ["E2", "Трудозатраты, ч/мес"],
   ["I2", "P1 — пилот сейчас"], ["M2", "P2 — второй эшелон"]].forEach(([ref, t]) => {
    ws.getCell(ref).value = t;
    ws.getCell(ref).font = head();
  });
  ws.getCell("A3").value = { formula: `COUNTIF($D$${FIRST}:$D$${LAST},"<>")` };
  ws.getCell("E3").value = { formula: `SUM($L$${FIRST}:$L$${LAST})` };
  ws.getCell("I3").value = { formula: `COUNTIF($AA$${FIRST}:$AA$${LAST},"P1*")` };
  ws.getCell("M3").value = { formula: `COUNTIF($AA$${FIRST}:$AA$${LAST},"P2*")` };
  ["A3", "E3", "I3", "M3"].forEach((ref) => {
    ws.getCell(ref).font = font({ bold: true, size: 16, color: { argb: ACCENT } });
  });

  ws.getCell("A5").value =
    "Заполняйте белые поля. Серые поля рассчитываются сами: трудозатраты, объём, " +
    "приоритет и категория. Звёздочка — поле обязательное для расчёта.";
  ws.getCell("A5").font = font({ size: 9, color: { argb: "FF6B7280" } });

  COLUMNS.forEach(([title, width], i) => {
    const c = ws.getCell(7, i + 1);
    c.value = title;
    c.font = head();
    c.fill = fill("FFE8E8F5");
    c.alignment = { wrapText: true, vertical: "middle" };
    c.border = box;
    ws.getColumn(i + 1).width = width;
  });
  ws.getRow(7).height = 46;

  const P = data.processes || [];
  for (let r = FIRST; r <= LAST; r++) {
    const p = P[r - FIRST];

    ws.getCell(`A${r}`).value = { formula: `IF(D${r}="","",ROW()-${FIRST - 1})` };
    ws.getCell(`L${r}`).value = {
      formula: `IF(OR(I${r}="",J${r}="",K${r}=""),"",ROUND(I${r}*J${r}*K${r}/60,1))`
    };
    ws.getCell(`Y${r}`).value = {
      formula:
        `IF(L${r}="","",IF(L${r}<Настройки!$D$14,1,IF(L${r}<Настройки!$D$15,2,` +
        `IF(L${r}<Настройки!$D$16,3,IF(L${r}<Настройки!$D$17,4,5)))))`
    };
    ws.getCell(`Z${r}`).value = { formula: priorityFormula(r) };
    ws.getCell(`AA${r}`).value = {
      formula:
        `IF(Z${r}="","",IF(Z${r}>=Настройки!$G$13,Настройки!$H$13,` +
        `IF(Z${r}>=Настройки!$G$14,Настройки!$H$14,` +
        `IF(Z${r}>=Настройки!$G$15,Настройки!$H$15,Настройки!$H$16))))`
    };

    if (p) {
      const map = {
        B: p.team, C: p.owners, D: p.process, E: p.result, F: p.receiver,
        G: p.steps, H: p.frequency, I: p.runs_per_month, J: p.minutes,
        K: p.people, M: p.tools, N: p.manual_share, O: p.problem,
        P: p.repeatability, Q: p.risk, R: p.impact, S: p.digital, T: p.standard,
        U: p.ai_idea, V: p.time_saving, W: p.difficulty,
        X: p.confidentiality || "Средняя", AB: p.mvp_goal, AC: p.owner,
        AD: p.status || "На оценке", AE: p.comment
      };
      Object.entries(map).forEach(([col, v]) => {
        if (v !== undefined && v !== null && v !== "") ws.getCell(`${col}${r}`).value = v;
      });
    }

    for (let i = 1; i <= COLUMNS.length; i++) {
      const c = ws.getCell(r, i);
      c.font = font();
      c.border = box;
      c.alignment = { wrapText: true, vertical: "top" };
      if (CALC.has(i)) c.fill = fill("FFF0F0F0");
    }
    ws.getCell(`N${r}`).numFmt = "0%";
    ws.getCell(`V${r}`).numFmt = "0%";
  }

  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 7 }];
  ws.autoFilter = { from: "A7", to: `AE${LAST}` };

  const lists = [
    ["B", "Настройки!$A$3:$A$12"], ["H", "Настройки!$D$3:$D$9"],
    ["X", "Настройки!$H$3:$H$5"], ["AD", "Настройки!$F$3:$F$9"],
    ["AC", "Настройки!$M$3:$M$20"]
  ];
  for (let r = FIRST; r <= LAST; r++) {
    lists.forEach(([col, formula]) => {
      ws.getCell(`${col}${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [formula]
      };
    });
    ["P", "Q", "R", "S", "T", "W"].forEach((col) => {
      ws.getCell(`${col}${r}`).dataValidation = {
        type: "whole", operator: "between", allowBlank: true, formulae: [1, 5]
      };
    });
  }
}

function buildSummary(ws, teams) {
  ws.getCell("A1").value = "Сводка по командам и AI-приоритетам";
  ws.getCell("A1").font = font({ bold: true, size: 14 });

  [["A3", "Всего процессов"], ["C3", "Трудозатраты, ч/мес"], ["E3", "P1 — пилот сейчас"]]
    .forEach(([ref, t]) => { ws.getCell(ref).value = t; ws.getCell(ref).font = head(); });

  const R = "'Реестр процессов'";
  ws.getCell("A4").value = { formula: `COUNTIF(${R}!$D$${FIRST}:$D$${LAST},"<>")` };
  ws.getCell("C4").value = { formula: `SUM(${R}!$L$${FIRST}:$L$${LAST})` };
  ws.getCell("E4").value = { formula: `COUNTIF(${R}!$AA$${FIRST}:$AA$${LAST},"P1*")` };
  ["A4", "C4", "E4"].forEach((ref) => {
    ws.getCell(ref).font = font({ bold: true, size: 16, color: { argb: ACCENT } });
  });

  ["Команда", "Процессов", "Трудозатраты, ч/мес", "P1", "P2", "P3", "Средний балл"]
    .forEach((h, i) => {
      const c = ws.getCell(7, i + 1);
      c.value = h; c.font = head(); c.fill = fill("FFE8E8F5"); c.border = box;
    });

  teams.forEach((team, i) => {
    const r = 8 + i;
    ws.getCell(`A${r}`).value = team;
    ws.getCell(`B${r}`).value = { formula: `COUNTIF(${R}!$B$${FIRST}:$B$${LAST},A${r})` };
    ws.getCell(`C${r}`).value = {
      formula: `SUMIF(${R}!$B$${FIRST}:$B$${LAST},A${r},${R}!$L$${FIRST}:$L$${LAST})`
    };
    [["D", "P1*"], ["E", "P2*"], ["F", "P3*"]].forEach(([col, pat]) => {
      ws.getCell(`${col}${r}`).value = {
        formula: `COUNTIFS(${R}!$B$${FIRST}:$B$${LAST},A${r},${R}!$AA$${FIRST}:$AA$${LAST},"${pat}")`
      };
    });
    ws.getCell(`G${r}`).value = {
      formula: `IFERROR(ROUND(AVERAGEIF(${R}!$B$${FIRST}:$B$${LAST},A${r},${R}!$Z$${FIRST}:$Z$${LAST}),0),"")`
    };
    for (let c = 1; c <= 7; c++) {
      ws.getCell(r, c).font = font();
      ws.getCell(r, c).border = box;
    }
  });

  [20, 13, 22, 8, 8, 8, 15].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function buildSettings(ws, teams, owners) {
  ws.getCell("A1").value = "Настройки приоритизации";
  ws.getCell("A1").font = font({ bold: true, size: 14 });

  const heads = { A2: "Команда", B2: "Состав команды", D2: "Частота", F2: "Статус",
    H2: "Конфиденциальность", I2: "Коэффициент", K2: "Макс. оценка", M2: "Участники" };
  Object.entries(heads).forEach(([ref, t]) => {
    ws.getCell(ref).value = t; ws.getCell(ref).font = head();
  });

  teams.forEach((t, i) => { ws.getCell(3 + i, 1).value = t; });
  FREQUENCIES.forEach((f, i) => { ws.getCell(3 + i, 4).value = f; });
  STATUSES.forEach((s, i) => { ws.getCell(3 + i, 6).value = s; });
  CONFIDENTIALITY.forEach(([n, k], i) => {
    ws.getCell(3 + i, 8).value = n; ws.getCell(3 + i, 9).value = k;
  });
  ws.getCell("K3").value = 5;
  owners.forEach((o, i) => { ws.getCell(3 + i, 13).value = o; });

  [["A12", "Критерий"], ["B12", "Вес"], ["D12", "От, часов/месяц"],
   ["E12", "Баллы объёма"], ["G12", "Баллы от"], ["H12", "Категория"]]
    .forEach(([ref, t]) => { ws.getCell(ref).value = t; ws.getCell(ref).font = head(); });

  WEIGHTS.forEach(([n, w], i) => {
    ws.getCell(13 + i, 1).value = n; ws.getCell(13 + i, 2).value = w;
  });
  VOLUME.forEach(([h, s], i) => {
    ws.getCell(13 + i, 4).value = h; ws.getCell(13 + i, 5).value = s;
  });
  CATEGORY.forEach(([s, c], i) => {
    ws.getCell(13 + i, 7).value = s; ws.getCell(13 + i, 8).value = c;
  });

  ws.getCell("A23").value =
    "Логика: высокий балл получают частые, трудоёмкие, ручные и повторяемые процессы " +
    "с цифровыми данными, где ошибка дорого стоит. Веса можно менять — приоритеты " +
    "пересчитаются сами.";
  ws.getCell("A23").font = font({ size: 9, color: { argb: "FF6B7280" } });

  [26, 12, 3, 22, 14, 3, 12, 22, 13, 3, 14, 3, 16]
    .forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

async function buildRegistry(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AI Research Lab";
  wb.created = new Date();

  const processes = data.processes || [];
  const owners = [...new Set(processes.map((p) => p.owner).filter(Boolean))].sort();

  buildStart(wb.addWorksheet("Старт"), data);
  buildRegistrySheet(wb.addWorksheet("Реестр процессов"), data);
  buildSummary(wb.addWorksheet("Сводка"), TEAMS);
  buildSettings(wb.addWorksheet("Настройки"), TEAMS, owners);

  // Excel сам пересчитает формулы при открытии.
  wb.calcProperties = { fullCalcOnLoad: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildRegistry, INK };
