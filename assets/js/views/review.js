import { REGISTRATION_STAGES } from "../config/constants.js";
import {
  MONTHLY_AUTO_CODES,
  MONTHLY_INPUT_CODES,
  PL_FIELDS,
  fieldHint,
  fieldLabel
} from "../data/fields.js";
import { getAnnualFigures, getMonthlyFigures, findMonthlyRecord } from "../core/calc.js";
import { diffPair, monthlyCumulative, shiftYearMonth } from "../core/compare.js";
import { buildAnnualTrend, buildMonthlyTrend } from "../core/trend.js";
import { barChartSvg } from "../components/chart.js";
import { backButtonHtml, diffClass, esc, formatDiff, formatRate, formatYearMonth, formatYen } from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";
import { sortedPeriods } from "./home.js";

function labelCell(code) {
  const hint = fieldHint(code);
  const inner = code === "PL009" ? `${esc(fieldLabel(code))}（地代家賃の内数）` : esc(fieldLabel(code));
  return `<td>${inner}${hint && code !== "PL009" ? `<span class="row-hint">${esc(hint)}</span>` : ""}</td>`;
}

function rowHtml(code, current, previous, cumulative) {
  const d = previous ? diffPair(current, previous) : null;
  return `<tr>
    ${labelCell(code)}
    <td>${formatYen(current)}</td>
    ${previous ? `<td>${formatYen(d.previous)}</td><td class="${diffClass(d.amount)}">${formatDiff(d.amount)}</td><td class="${diffClass(d.amount)}">${formatRate(d.rate)}</td>` : ""}
    ${cumulative !== undefined ? `<td>${formatYen(cumulative)}</td>` : ""}
  </tr>`;
}

function chartFigure(heading, svg) {
  return `<div class="chart-block">
    <div class="chart-heading">${esc(heading)}</div>
    <div class="chart-scroll">${svg}</div>
  </div>`;
}

// 年次の推移グラフ（追加フェーズ）。登録済みの期だけを並べる。
function renderAnnualTrend(company) {
  const trend = buildAnnualTrend(company);
  const head = `<h2>推移グラフ</h2>`;
  if (trend.count < 2) {
    return head + `<div class="card"><p class="note" style="margin:0">―<br>推移グラフは、2期分以上の年次登録があると表示されます。</p></div>`;
  }
  const shortLabel = (p) => {
    const [y, m] = p.endDate.split("-");
    return `${String(y).slice(2)}年${Number(m)}月期`;
  };
  const mk = (code, name) => trend.points.map((p) => ({
    label: shortLabel(p),
    value: p[code],
    title: `${p.label} ${name}：${formatYen(p[code])}`
  }));
  return head + `<div class="card">
    ${chartFigure("売上高の推移", barChartSvg({ points: mk("PL001", "売上高"), ariaLabel: "売上高の推移グラフ" }))}
    ${chartFigure("当期純利益の推移（税金などを引いたあと、最終的に残る利益）", barChartSvg({ points: mk("PL025", "当期純利益"), barClass: "chart-bar--profit", ariaLabel: "当期純利益の推移グラフ" }))}
    ${trend.hasOperating
      ? chartFigure("営業利益の推移（本業で得た利益）", barChartSvg({ points: mk("PL017", "営業利益"), barClass: "chart-bar--profit", ariaLabel: "営業利益の推移グラフ" }))
      : `<p class="note">営業利益（本業の利益）の推移は、すべての期が標準登録（内訳まで登録）のときに表示されます。</p>`}
    <p class="note" style="margin-bottom:0">バーの上に添えた金額は、目で追うための概数（万円単位）です。正確な金額は下の表で確認してください。</p>
  </div>`;
}

// 月次の推移グラフ（追加フェーズ）。直近12か月までを表示する。
function renderMonthlyTrend(company) {
  const trend = buildMonthlyTrend(company);
  const head = `<h2>推移グラフ</h2>`;
  if (trend.count < 2) {
    return head + `<div class="card"><p class="note" style="margin:0">―<br>推移グラフは、2か月分以上の月次登録があると表示されます。</p></div>`;
  }
  const mk = (code, name) => trend.series[code].map((pt) => {
    const [y, m] = pt.yearMonth.split("-");
    return {
      label: `${String(y).slice(2)}/${Number(m)}`,
      value: pt.value,
      title: `${formatYearMonth(pt.yearMonth)} ${name}：${formatYen(pt.value)}`
    };
  });
  return head + `<div class="card">
    ${trend.truncated ? `<p class="note" style="margin-top:0">登録が多いため、直近${trend.limit}か月を表示しています。</p>` : ""}
    ${chartFigure("売上高の推移", barChartSvg({ points: mk("M001", "売上高"), ariaLabel: "売上高の推移グラフ" }))}
    ${chartFigure("営業利益の推移（本業で得た利益）", barChartSvg({ points: mk("M103", "営業利益"), barClass: "chart-bar--profit", ariaLabel: "営業利益の推移グラフ" }))}
    ${chartFigure("当期純利益の推移（その月の最終利益）", barChartSvg({ points: mk("M007", "当期純利益"), barClass: "chart-bar--profit", ariaLabel: "当期純利益の推移グラフ" }))}
    <p class="note" style="margin-bottom:0">バーの上に添えた金額は、目で追うための概数（万円単位）です。正確な金額は下の表で確認してください。</p>
  </div>`;
}

function renderAnnualReview({ company, params, link }) {
  const periods = sortedPeriods(company);
  if (periods.length === 0) {
    return `<div class="card empty-state"><span class="empty-icon" aria-hidden="true">${icon("book")}</span><p>年次登録がまだありません。登録すると年度の比較が表示されます。</p>
      <div class="btn-row"><a class="btn btn--primary" href="${link(ROUTES.ANNUAL, { company: company.id, period: "new" })}">年次を登録する</a></div></div>`;
  }
  const target = periods.find((p) => p.id === params.period) ?? periods[periods.length - 1];
  const idx = periods.findIndex((p) => p.id === target.id);
  const previous = idx > 0 ? periods[idx - 1] : null;

  const options = [...periods].reverse().map((p) =>
    `<option value="${p.id}" ${p.id === target.id ? "selected" : ""}>${esc(p.displayName)}</option>`).join("");

  const targetFigures = getAnnualFigures(target);
  const previousFigures = previous ? getAnnualFigures(previous) : null;
  const bothStandard = previous &&
    target.stage === REGISTRATION_STAGES.STANDARD &&
    previous.stage === REGISTRATION_STAGES.STANDARD;
  const codes = (!previous || bothStandard || (target.stage === REGISTRATION_STAGES.STANDARD && !previous))
    ? (target.stage === REGISTRATION_STAGES.STANDARD ? PL_FIELDS.map((f) => f.id) : ["PL001", "PL025"])
    : ["PL001", "PL025"];
  // 登録段階が異なる場合は共通2項目だけ（仕様書 7.2）
  const finalCodes = previous && !bothStandard ? ["PL001", "PL025"] : codes;

  const autoSet = new Set(PL_FIELDS.filter((f) => f.auto).map((f) => f.id));
  const rows = finalCodes.map((code) => {
    const html = rowHtml(code, targetFigures[code], previous ? previousFigures[code] : null);
    return autoSet.has(code) ? html.replace("<tr>", '<tr class="auto-row">') : html;
  }).join("");

  return `
    <div class="field" style="max-width:20rem">
      <label for="review-period">対象の期</label>
      <select id="review-period" data-review-select="period">${options}</select>
    </div>
    ${previous ? "" : `<p class="note">前年度の登録がないため、この期だけの表を表示しています。</p>`}
    ${renderAnnualTrend(company)}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>項目</th><th>${esc(target.displayName)}</th>${previous ? `<th>前年度（${esc(previous.displayName)}）</th><th>増減額</th><th>増減率</th>` : ""}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMonthlyReview({ company, params, link }) {
  const records = [...(company.monthlyRecords ?? [])].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  if (records.length === 0) {
    return `<div class="card empty-state"><span class="empty-icon" aria-hidden="true">${icon("calendar")}</span><p>月次登録がまだありません。登録すると月ごとの比較が表示されます。</p>
      <div class="btn-row"><a class="btn btn--primary" href="${link(ROUTES.MONTHLY, { company: company.id })}">月次を登録する</a></div></div>`;
  }
  const targetYm = records.some((r) => r.yearMonth === params.ym)
    ? params.ym
    : records[records.length - 1].yearMonth;
  const target = findMonthlyRecord(company, targetYm);
  const prevMonth = findMonthlyRecord(company, shiftYearMonth(targetYm, -1));
  const prevYear = findMonthlyRecord(company, shiftYearMonth(targetYm, -12));
  const cumulative = monthlyCumulative(company, targetYm);

  const options = [...records].reverse().map((r) =>
    `<option value="${r.yearMonth}" ${r.yearMonth === targetYm ? "selected" : ""}>${formatYearMonth(r.yearMonth)}</option>`).join("");

  const targetFigures = getMonthlyFigures(target);
  const prevFigures = prevMonth ? getMonthlyFigures(prevMonth) : null;
  const prevYearFigures = prevYear ? getMonthlyFigures(prevYear) : null;
  const codes = [...MONTHLY_INPUT_CODES, ...MONTHLY_AUTO_CODES];
  const autoSet = new Set(MONTHLY_AUTO_CODES);

  const rows = codes.map((code) => {
    const cells = [labelCell(code), `<td>${formatYen(targetFigures[code])}</td>`];
    if (prevFigures) {
      const d = diffPair(targetFigures[code], prevFigures[code]);
      cells.push(`<td>${formatYen(d.previous)}</td>`, `<td class="${diffClass(d.amount)}">${formatDiff(d.amount)}</td>`, `<td class="${diffClass(d.amount)}">${formatRate(d.rate)}</td>`);
    }
    if (prevYearFigures) {
      const d = diffPair(targetFigures[code], prevYearFigures[code]);
      cells.push(`<td>${formatYen(d.previous)}</td>`, `<td class="${diffClass(d.amount)}">${formatDiff(d.amount)}</td>`, `<td class="${diffClass(d.amount)}">${formatRate(d.rate)}</td>`);
    }
    cells.push(`<td>${formatYen(cumulative.figures[code])}</td>`);
    const tr = `<tr>${cells.join("")}</tr>`;
    return autoSet.has(code) ? tr.replace("<tr>", '<tr class="auto-row">') : tr;
  }).join("");

  const missingNote = cumulative.missingMonths.length
    ? `未登録の月（${cumulative.missingMonths.map(formatYearMonth).join("、")}）があります。累計は登録済みの月だけの合計です。`
    : "対象期間の月はすべて登録されています。";

  return `
    <div class="field" style="max-width:20rem">
      <label for="review-month">対象の月</label>
      <select id="review-month" data-review-select="ym">${options}</select>
    </div>
    ${prevMonth ? "" : `<p class="note">前月の登録がないため、前月との比較は表示していません。</p>`}
    ${prevYear ? "" : `<p class="note">前年同月の登録がないため、前年同月との比較は表示していません。</p>`}
    ${renderMonthlyTrend(company)}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>項目</th><th>${formatYearMonth(targetYm)}</th>
          ${prevMonth ? `<th>前月</th><th>増減額</th><th>増減率</th>` : ""}
          ${prevYear ? `<th>前年同月</th><th>増減額</th><th>増減率</th>` : ""}
          <th>当年度累計</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="note-box">
      当年度累計は、${formatYearMonth(cumulative.rangeMonths[0])}から${formatYearMonth(targetYm)}までのうち、登録済みの${cumulative.registeredCount}か月分の合計です。${missingNote}
    </div>`;
}

export function renderReview({ company, params, link }) {
  const tab = params.tab === "monthly" ? "monthly" : "annual";
  return `
    <div class="page-head">
      ${backButtonHtml()}
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>${pageIcon("calendar")}月次・年度レビュー</h1>
      <p class="note">前月・前年同月・前年度と比べて、数字がどう変わったかを確認します。</p>
    </div>
    <nav class="tabs" aria-label="レビューの切り替え">
      <a href="${link(ROUTES.REVIEW, { company: company.id, tab: "annual" })}" aria-selected="${tab === "annual"}">年度</a>
      <a href="${link(ROUTES.REVIEW, { company: company.id, tab: "monthly" })}" aria-selected="${tab === "monthly"}">月次</a>
    </nav>
    ${tab === "annual" ? renderAnnualReview({ company, params, link }) : renderMonthlyReview({ company, params, link })}`;
}

export function mountReview(el, { params, navigate }) {
  const periodSelect = el.querySelector('[data-review-select="period"]');
  periodSelect?.addEventListener("change", () => {
    navigate(ROUTES.REVIEW, { company: params.company, tab: "annual", period: periodSelect.value });
  });
  const monthSelect = el.querySelector('[data-review-select="ym"]');
  monthSelect?.addEventListener("change", () => {
    navigate(ROUTES.REVIEW, { company: params.company, tab: "monthly", ym: monthSelect.value });
  });
}
