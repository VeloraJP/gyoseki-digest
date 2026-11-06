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
import { diffClass, esc, formatDiff, formatRate, formatYearMonth, formatYen } from "../components/dom.js";
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

function renderAnnualReview({ company, params, link }) {
  const periods = sortedPeriods(company);
  if (periods.length === 0) {
    return `<div class="card"><p>年次登録がまだありません。登録すると年度の比較が表示されます。</p>
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
    return `<div class="card"><p>月次登録がまだありません。登録すると月ごとの比較が表示されます。</p>
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
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>月次・年度レビュー</h1>
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
