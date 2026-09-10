import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "design-references", "organization-tree");
const W = 1600;
const H = 1000;
const C = {
  bg: "#f5f7f8",
  canvas: "#ffffff",
  panel: "#ffffff",
  panel2: "#f8f9f9",
  panel3: "#eef1f2",
  text: "#182028",
  muted: "#5f6b75",
  soft: "#87929b",
  border: "#dfe4e7",
  borderStrong: "#c9d1d5",
  accent: "#e9661e",
  accentSoft: "#fff2ea",
  good: "#238f4b",
  goodBg: "#eaf7ef",
  warn: "#a66a16",
  warnBg: "#fff5df",
  info: "#3379b2",
  infoBg: "#edf5fb",
};

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rect = (x, y, w, h, fill = C.panel, stroke = C.border, r = 7, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke = C.borderStrong, width = 1.5, extra = "") => `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
const poly = (points, stroke = C.borderStrong, width = 1.5, extra = "") => `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const txt = (x, y, value, size = 12, fill = C.text, weight = 400, anchor = "start", extra = "") => `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}px" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" ${extra}>${esc(value)}</text>`;
const icon = (x, y, glyph = "▦", fill = C.accent) => `<circle cx="${x}" cy="${y}" r="15" fill="${C.accentSoft}" stroke="#f6cdb7"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="${fill}" font-weight="700">${glyph}</text>`;
const badge = (x, y, value, fill = C.panel3, color = C.muted, width = 0) => { const w = width || Math.max(42, value.length * 6.2 + 16); return `${rect(x, y, w, 22, fill, "none", 4)}${txt(x + w / 2, y + 15, value, 9, color, 650, "middle")}`; };
const avatar = (x, y, initials, fill = C.text) => `${circle(x, y, 14, fill)}${txt(x, y + 4, initials, 8, C.canvas, 750, "middle")}`;
const circle = (cx, cy, r, fill, stroke = "none") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}"/>`;

function shell(title, subtitle, body, option, note) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${rect(0, 0, 238, H, "#f7f8f8", "none", 0)}
  ${rect(238, 0, W - 238, 64, C.panel, C.border, 0)}
  ${rect(0, 0, 238, 64, "#f7f8f8", C.border, 0)}
  ${rect(24, 17, 30, 30, C.accent, "none", 7)}${txt(39, 37, "O", 16, C.canvas, 750, "middle")}${txt(66, 31, "OPERIS", 14, C.text, 750)}${txt(66, 46, "Operations OS", 9, C.soft, 500)}
  ${txt(270, 27, "Организация", 10, C.accent, 750)}${txt(270, 47, "Структура", 12, C.text, 650)}
  ${txt(1486, 28, "Демонстрационный набор", 9, C.soft, 500, "end")}${circle(1512, 45, 12, C.text)}${txt(1512, 49, "СП", 7, C.canvas, 750, "middle")}
  ${txt(270, 102, title, 25, C.text, 720)}${txt(270, 130, subtitle, 11, C.muted, 400)}
  ${rect(270, 151, 1240, 39, C.panel2, C.border, 0)}${txt(286, 176, "Организация", 10, C.soft, 600)}${txt(356, 176, "›", 13, C.soft, 500)}${txt(375, 176, "Оргструктура", 10, C.muted, 600)}
  ${rect(270, 207, 1240, 42, C.panel2, C.border, 0)}${txt(286, 233, "Компания", 10, C.muted, 600)}${txt(345, 233, "ООО «ОПЕРИС»", 10, C.text, 700)}${txt(520, 233, "Подразделения", 10, C.muted, 600)}${txt(602, 233, "8", 11, C.text, 700)}${txt(655, 233, "Сотрудники", 10, C.muted, 600)}${txt(727, 233, "46", 11, C.text, 700)}${txt(780, 233, "Вакансии", 10, C.muted, 600)}${txt(841, 233, "5", 11, C.warn, 700)}${txt(895, 233, "Без руководителя", 10, C.muted, 600)}${txt(1001, 233, "1", 11, C.warn, 700)}
  ${rect(270, 265, 1240, 47, C.panel, C.border, 7)}${rect(284, 273, 154, 31, C.panel3, C.border, 5)}${txt(361, 293, option, 10.5, C.text, 700, "middle")}${rect(450, 273, 265, 31, C.panel, C.border, 5)}${txt(467, 293, "⌕", 17, C.soft, 400)}${txt(492, 293, "Подразделение или сотрудник", 10, C.soft, 400)}${rect(730, 273, 120, 31, C.panel, C.border, 5)}${txt(745, 293, "Все регионы", 10, C.muted, 500)}${txt(835, 293, "⌄", 11, C.soft, 400)}${rect(866, 273, 96, 31, C.panel, C.border, 5)}${txt(914, 293, "Проблемы", 10, C.warn, 650, "middle")}${txt(1479, 293, "Вместить", 10, C.muted, 600, "end")}
  ${txt(270, 338, `Вариант ${option}: ${note}`, 10, C.soft, 500)}
  ${body}
  <g transform="translate(20 100)">${txt(0, 0, "ГЛАВНАЯ", 9, C.soft, 750)}${txt(0, 34, "⌂  Командный центр", 11, C.muted, 600)}${txt(0, 63, "◷  Мои задачи", 11, C.muted, 600)}${txt(0, 111, "КОММЕРЦИЯ", 9, C.soft, 750)}${txt(0, 145, "▣  Продажи", 11, C.muted, 650)}${txt(0, 174, "    Заявки", 10, C.muted, 500)}${txt(0, 203, "    Клиенты", 10, C.muted, 500)}${txt(0, 232, "    Предложения", 10, C.muted, 500)}${txt(0, 280, "ОРГАНИЗАЦИЯ", 9, C.accent, 750)}${rect(-9, 298, 208, 34, C.accentSoft, "none", 5)}${txt(0, 321, "▦  Оргструктура", 11, C.text, 700)}${txt(0, 350, "    Сотрудники компании", 10, C.muted, 500)}${txt(0, 379, "    Должности и обязанности", 10, C.muted, 500)}${txt(0, 408, "    Подразделения и регионы", 10, C.muted, 500)}${txt(0, 456, "АДМИНИСТРИРОВАНИЕ", 9, C.soft, 750)}${txt(0, 490, "⚙  Настройки", 11, C.muted, 600)}</g>
  </svg>`;
}

function node(x, y, w, h, label, name, manager, metrics, tone = "unit", selected = false) {
  const top = tone === "root" ? C.accent : tone === "region" ? "#d88a57" : C.borderStrong;
  return `${rect(x, y, w, h, selected ? C.accentSoft : C.panel, selected ? C.accent : C.borderStrong, 8)}<path d="M ${x + 8} ${y + 2} H ${x + w - 8}" stroke="${top}" stroke-width="${tone === "root" ? 3 : 2}" stroke-linecap="round"/>${icon(x + 25, y + 29, tone === "root" ? "⌂" : tone === "region" ? "◉" : "▦", tone === "root" ? C.accent : C.muted)}${txt(x + 49, y + 24, label.toUpperCase(), 8, C.accent, 750)}${txt(x + 49, y + 43, name, 13, C.text, 700)}${avatar(x + 20, y + 61, manager === "Не назначен" ? "?" : manager.split(" ").map((p) => p[0]).join(""), manager === "Не назначен" ? C.warn : C.text)}${txt(x + 41, y + 59, "Руководитель", 8, C.soft, 500)}${txt(x + 41, y + 72, manager, 9, manager === "Не назначен" ? C.warn : C.muted, 650)}${txt(x + 14, y + h - 10, metrics, 8.5, C.muted, 550)}`;
}

function classic() {
  const body = `<g>${line(890, 407, 890, 448, C.accent, 2)}${line(505, 448, 1275, 448, C.borderStrong, 1.5)}${line(505, 448, 505, 474)}${line(890, 448, 890, 474)}${line(1275, 448, 1275, 474)}
  ${node(760, 365, 260, 102, "Компания", "ООО «ОПЕРИС»", "С. Петров", "46 сотрудников · 8 подразделений", "root")}
  ${node(375, 474, 260, 102, "Коммерция", "Продажи", "И. Петров", "12 сотрудников · 1 вакансия", "region")}
  ${node(760, 474, 260, 102, "Операции", "Производство", "М. Иванова", "21 сотрудник · 3 вакансии", "region")}
  ${node(1145, 474, 260, 102, "Люди", "Подбор и персонал", "Не назначен", "8 сотрудников · 1 вакансия", "region")}
  ${line(505, 576, 505, 610)}${line(505, 610, 365, 610)}${line(505, 610, 645, 610)}${line(365, 610, 365, 628)}${line(645, 610, 645, 628)}
  ${node(235, 628, 260, 91, "Команда", "Клиентский отдел", "А. Смирнов", "6 сотрудников", "unit")}${node(515, 628, 260, 91, "Команда", "Расчёты и КП", "Е. Орлова", "6 сотрудников", "unit")}
  ${line(890, 576, 890, 628)}${node(760, 628, 260, 91, "Команда", "Запуски объектов", "Д. Ким", "13 сотрудников", "unit")}
  ${rect(270, 758, 1240, 40, C.infoBg, "#c7ddeb", 6)}${txt(290, 783, "Как читается", 10, C.info, 700)}${txt(380, 783, "Один центр сверху, уровни ниже, одна линия = одна связь подчинения. Подходит для небольшой и средней компании.", 10, C.info, 500)}
  </g>`;
  return shell("Оргструктура", "Иерархия подразделений и руководителей в привычном вертикальном представлении.", body, "01", "Классическое дерево");
}

function horizontal() {
  const body = `<g>${line(530, 528, 620, 528, C.accent, 2)}${line(620, 418, 620, 648, C.borderStrong, 1.5)}${line(620, 418, 690, 418)}${line(620, 528, 690, 528)}${line(620, 648, 690, 648)}
  ${node(300, 474, 230, 108, "Компания", "ООО «ОПЕРИС»", "С. Петров", "46 сотрудников", "root")}
  ${node(690, 370, 290, 96, "Коммерция", "Продажи", "И. Петров", "12 сотрудников · 1 вакансия", "region")}${node(690, 480, 290, 96, "Операции", "Производство", "М. Иванова", "21 сотрудник · 3 вакансии", "region")}${node(690, 600, 290, 96, "Люди", "Подбор и персонал", "Не назначен", "8 сотрудников · 1 вакансия", "region")}
  ${line(980, 418, 1045, 418)}${line(1045, 418, 1045, 438)}${line(1045, 418, 1110, 418)}${line(1045, 438, 1110, 438)}${node(1110, 355, 300, 100, "Команда", "Клиентский отдел", "А. Смирнов", "6 сотрудников", "unit")}${node(1110, 475, 300, 100, "Команда", "Расчёты и КП", "Е. Орлова", "6 сотрудников", "unit")}
  ${line(980, 528, 1110, 528)}${node(1110, 585, 300, 100, "Команда", "Запуски объектов", "Д. Ким", "13 сотрудников", "unit")}
  ${rect(270, 758, 1240, 40, C.infoBg, "#c7ddeb", 6)}${txt(290, 783, "Как читается", 10, C.info, 700)}${txt(380, 783, "Движение слева направо оставляет место для нескольких веток и лучше работает при широкой структуре.", 10, C.info, 500)}
  </g>`;
  return shell("Оргструктура", "Горизонтальная карта: от компании к подразделениям и командам слева направо.", body, "02", "Горизонтальная карта");
}

function lanes() {
  const body = `<g>${rect(270, 365, 1240, 405, C.panel2, C.border, 8)}${txt(310, 396, "Уровень 1", 9, C.soft, 750)}${txt(665, 396, "Уровень 2", 9, C.soft, 750)}${txt(1020, 396, "Уровень 3", 9, C.soft, 750)}${line(620, 365, 620, 770, C.border)}${line(975, 365, 975, 770, C.border)}
  ${node(325, 505, 235, 108, "Компания", "ООО «ОПЕРИС»", "С. Петров", "46 сотрудников", "root")}
  ${line(560, 559, 665, 430, C.accent, 1.8)}${line(560, 559, 665, 559, C.accent, 1.8)}${line(560, 559, 665, 688, C.accent, 1.8)}
  ${node(665, 383, 250, 96, "Направление", "Продажи", "И. Петров", "12 сотрудников", "region")}${node(665, 511, 250, 96, "Направление", "Операции", "М. Иванова", "21 сотрудник", "region")}${node(665, 640, 250, 96, "Направление", "Подбор и персонал", "Не назначен", "8 сотрудников", "region")}
  ${line(915, 431, 1020, 431, C.borderStrong)}${line(915, 559, 1020, 559, C.borderStrong)}${line(915, 688, 1020, 688, C.borderStrong)}
  ${node(1020, 383, 300, 96, "Команда", "Клиентский отдел", "А. Смирнов", "6 сотрудников", "unit")}${node(1020, 511, 300, 96, "Команда", "Запуски объектов", "Д. Ким", "13 сотрудников", "unit")}${node(1020, 640, 300, 96, "Команда", "Подбор персонала", "Не назначен", "4 сотрудника · 1 вакансия", "unit")}
  ${rect(270, 795, 1240, 40, C.infoBg, "#c7ddeb", 6)}${txt(290, 820, "Как читается", 10, C.info, 700)}${txt(380, 820, "Каждая колонка имеет один смысл. Структура остаётся читаемой, даже если у одного направления много дочерних подразделений.", 10, C.info, 500)}
  </g>`;
  return shell("Оргструктура", "Колонная схема с фиксированными уровнями. Ветви не расползаются по всей ширине экрана.", body, "03", "Колонная схема");
}

function focusDrawer() {
  const body = `<g>${rect(270, 365, 780, 455, C.panel2, C.border, 8)}${txt(300, 395, "Выбранная ветка", 9, C.soft, 750)}${node(515, 425, 290, 105, "Направление", "Операции", "М. Иванова", "21 сотрудник · 3 вакансии", "region", true)}${line(660, 530, 660, 575, C.accent, 2)}${line(430, 575, 890, 575, C.borderStrong)}${line(430, 575, 430, 602)}${line(660, 575, 660, 602)}${line(890, 575, 890, 602)}${node(300, 602, 260, 96, "Команда", "Запуски объектов", "Д. Ким", "13 сотрудников", "unit")}${node(530, 602, 260, 96, "Команда", "Табели и смены", "Н. Волкова", "8 сотрудников", "unit")}${node(760, 602, 260, 96, "Команда", "Обеспечение", "Не назначен", "5 сотрудников · 2 вакансии", "unit")}
  ${rect(1070, 365, 440, 455, C.panel, C.border, 8)}${icon(1105, 405, "▦", C.accent)}${txt(1135, 400, "ПОДРАЗДЕЛЕНИЕ", 8, C.accent, 750)}${txt(1135, 422, "Операции", 17, C.text, 720)}${txt(1135, 442, "Направление", 10, C.muted, 500)}${txt(1100, 481, "Руководитель", 9, C.soft, 500)}${txt(1340, 481, "М. Иванова", 10, C.text, 650)}${line(1100, 491, 1480, 491, C.border)}${txt(1100, 519, "Регион", 9, C.soft, 500)}${txt(1340, 519, "Москва и область", 10, C.text, 600)}${line(1100, 529, 1480, 529, C.border)}${txt(1100, 557, "Сотрудники", 9, C.soft, 500)}${txt(1340, 557, "21", 10, C.text, 700)}${line(1100, 567, 1480, 567, C.border)}${txt(1100, 595, "Штат / вакансии", 9, C.soft, 500)}${txt(1340, 595, "24 / 3", 10, C.warn, 700)}${line(1100, 605, 1480, 605, C.border)}${badge(1100, 635, "3 вакансии", C.warnBg, C.warn)}${badge(1200, 635, "Выбрано", C.accentSoft, C.accent)}${rect(1100, 690, 178, 32, C.accent, "none", 5)}${txt(1189, 711, "Открыть подразделение", 10, C.canvas, 700, "middle")}${txt(1100, 756, "Обзор  ·  Назначения  ·  История", 9, C.muted, 600)}
  </g>`;
  return shell("Оргструктура", "Карта с фокусом на выбранной ветке и постоянным контекстом справа.", body, "04", "Фокус и контекст");
}

function register() {
  const body = `<g>${rect(270, 365, 1240, 455, C.panel, C.border, 8)}${rect(270, 365, 1240, 42, C.panel2, C.border, 8)}${txt(300, 391, "Структурная единица / штатная позиция", 9, C.soft, 750)}${txt(1120, 391, "Занятость", 9, C.soft, 750)}${txt(1280, 391, "Статус", 9, C.soft, 750)}${txt(1450, 391, "", 9, C.soft, 750)}
  ${rect(270, 407, 1240, 61, C.panel2, C.border, 0)}${txt(300, 438, "⌄", 15, C.muted, 500)}${icon(337, 432, "▦", C.accent)}${txt(370, 425, "ПОДРАЗДЕЛЕНИЕ", 8, C.accent, 750)}${txt(370, 446, "Операции", 13, C.text, 700)}${txt(1120, 440, "3 профиля", 9, C.muted, 550)}${txt(1280, 440, "21 сотрудник", 9, C.muted, 550)}
  ${row(468, "   ⌄   Профиль должности", "Менеджер объекта", "8 / 10 FTE", "Занята", C.goodBg, C.good)}${row(523, "   ⌄   Профиль должности", "Мастер объекта", "6 / 8 FTE", "Занята", C.goodBg, C.good)}${row(578, "   ⌄   Профиль должности", "Координатор смен", "4 / 6 FTE", "2 свободно", C.warnBg, C.warn)}${row(633, "   ›   Штатная позиция", "Специалист по обеспечению", "0 / 2 FTE", "Открыта", C.warnBg, C.warn)}${row(688, "   ›   Штатная позиция", "Администратор объекта", "3 / 3 FTE", "Занята", C.goodBg, C.good)}
  ${rect(270, 770, 1240, 50, C.infoBg, "#c7ddeb", 6)}${txt(290, 800, "Как читается", 10, C.info, 700)}${txt(380, 800, "Это не карта подчинения, а рабочий вид для штата: быстро видно профили, занятость и вакансии. Подходит как вторая вкладка.", 10, C.info, 500)}
  </g>`;
  return shell("Оргструктура", "Практический вариант для ежедневной работы со штатными позициями и назначениями.", body, "05", "Дерево-реестр");
}

function row(y, label, name, occupancy, status, fill, color) {
  return `${rect(270, y, 1240, 55, C.panel, C.border, 0)}${txt(300, y + 22, label, 9, C.muted, 550)}${txt(500, y + 22, name, 11, C.text, 650)}${txt(1120, y + 22, occupancy, 10, C.text, 650)}${badge(1270, y + 9, status, fill, color)}${txt(1450, y + 24, "⌄", 14, C.muted, 500)}`;
}

const files = [
  ["01-klassicheskoe-derevo.svg", classic()],
  ["02-gorizontalnaya-karta.svg", horizontal()],
  ["03-kolonnaya-shema.svg", lanes()],
  ["04-fokus-i-kontekst.svg", focusDrawer()],
  ["05-derevo-reestr.svg", register()],
];

await mkdir(out, { recursive: true });
await Promise.all(files.map(([name, svg]) => writeFile(join(out, name), svg, "utf8")));
console.log(`Generated ${files.length} references in ${out}`);
