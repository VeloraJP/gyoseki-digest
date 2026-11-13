import { getAnnualFigures, getMonthlyFigures, listFiscalKeys, buildMonthlyAggregate } from "../core/calc.js";
import { computeGoalSummary } from "../core/goal.js";
import { fieldLabel } from "../data/fields.js";
import { esc, formatPercent, formatYearMonth, formatYen } from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";

export function sortedPeriods(company) {
  return [...(company.annualPeriods ?? [])].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function renderHome({ company, link }) {
  const periods = sortedPeriods(company);
  const latestPeriod = periods[periods.length - 1] ?? null;
  const monthly = [...(company.monthlyRecords ?? [])].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const latestMonthly = monthly[monthly.length - 1] ?? null;

  let annualSummary;
  if (latestPeriod) {
    const figures = getAnnualFigures(latestPeriod);
    annualSummary = `
      <div class="kpi-label">${esc(latestPeriod.displayName)}の当期純利益<span class="hint">最終的に残る利益</span></div>
      <div class="kpi-value">${formatYen(figures.PL025)}</div>`;
  } else {
    const keys = listFiscalKeys(company);
    const agg = keys.length ? buildMonthlyAggregate(company, keys[keys.length - 1]) : null;
    annualSummary = agg
      ? `<div class="kpi-label">当期純利益 <span class="tag">月次集計</span></div>
         <div class="kpi-value">${formatYen(agg.netIncome)}</div>
         <div class="kpi-sub">年次登録はまだありません。月次12か月分の合計です。月次の利益は税金計算前の金額です。</div>`
      : `<div class="kpi-label">当期純利益</div>
         <div class="kpi-value">未登録</div>
         <div class="kpi-sub">年次登録をすると、ここに最新の利益が表示されます。</div>`;
  }

  const monthlySummary = latestMonthly
    ? `<div class="kpi-label">${formatYearMonth(latestMonthly.yearMonth)}の当期純利益</div>
       <div class="kpi-value" style="font-size:1.5rem">${formatYen(getMonthlyFigures(latestMonthly).M007)}</div>
       <div class="kpi-sub">月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます。</div>`
    : `<div class="kpi-label">最新月次の当期純利益</div>
       <div class="kpi-value" style="font-size:1.5rem">未登録</div>`;

  const goalSummary = computeGoalSummary(company);
  const goalRate = goalSummary
    ? (goalSummary.progress && goalSummary.result.requiredSales > 0
        ? goalSummary.progress.salesProgressRate
        : goalSummary.result.achievementRate)
    : null;
  const goalBarWidth = typeof goalRate === "number" && Number.isFinite(goalRate)
    ? Math.min(100, Math.max(0, goalRate))
    : 0;
  const goalHtml = goalSummary
    ? `<div class="card">
         <div class="kpi-label">${icon("flag")} ${esc(goalSummary.period.displayName)}の目標（${esc(fieldLabel(goalSummary.goal.profitCode))} ${formatYen(goalSummary.goal.amount)}${goalSummary.result.approximate ? ' <span class="tag">概算</span>' : ""}）</div>
         ${goalSummary.remainingSales > 0
           ? `<div class="kpi-value" style="font-size:1.5rem">目標まで、あと ${formatYen(goalSummary.remainingSales)} の売上</div>
              <div class="kpi-sub">必要な売上高 ${formatYen(goalSummary.result.requiredSales)}${goalSummary.progress ? ` ／ 月次累計の売上 ${formatYen(goalSummary.progress.cumulativeSales)}` : ` ／ 現在の売上 ${formatYen(goalSummary.result.sales)}`}（達成率 ${formatPercent(goalRate)}）</div>
              <div class="progress${goalBarWidth >= 100 ? " progress--done" : ""}">
                <div class="progress__bar" style="width:${goalBarWidth}%"></div>
                <span class="progress__cap">${icon("flag")}</span>
              </div>`
           : `<div class="kpi-value" style="font-size:1.5rem">${icon("check")} 目標の売上に届いています</div>
              <div class="kpi-sub">必要な売上高 ${formatYen(goalSummary.result.requiredSales)}</div>
              <div class="progress progress--done">
                <div class="progress__bar" style="width:100%"></div>
                <span class="progress__cap">${icon("flag")}</span>
              </div>`}
         <div class="btn-row"><a class="btn btn--small" href="${link(ROUTES.GOAL, { company: company.id, period: goalSummary.period.id })}">目標と進捗を見る</a></div>
       </div>`
    : "";

  const periodRows = [...periods].reverse().map((p) => `
    <li>
      <span>${esc(p.displayName)}（${p.stage === "SIMPLE" ? "簡易登録" : "標準登録"}）</span>
      <a class="btn btn--small" href="${link(ROUTES.ANNUAL, { company: company.id, period: p.id })}">開く・直す</a>
    </li>`).join("");
  const monthlyRows = [...monthly].reverse().slice(0, 12).map((r) => `
    <li>
      <span>${formatYearMonth(r.yearMonth)}</span>
      <a class="btn btn--small" href="${link(ROUTES.MONTHLY, { company: company.id, ym: r.yearMonth })}">開く・直す</a>
    </li>`).join("");

  return `
    <div class="page-head">
      <p class="crumb"><a href="${link(ROUTES.START)}">会社選択</a> ／ <a href="${link(ROUTES.SETUP, { company: company.id })}">設定</a></p>
      <h1>${pageIcon("building")}${esc(company.name)}</h1>
    </div>

    <div class="card card--accent">
      <div class="kpi-big">${annualSummary}</div>
      <hr style="border:none;border-top:1px solid rgb(255 255 255 / 35%);margin:0.8rem 0">
      <div class="kpi-big">${monthlySummary}</div>
    </div>

    ${goalHtml}

    <div class="nav-grid">
      <a class="btn btn--primary" href="${link(ROUTES.ANALYSIS, { company: company.id })}">${icon("chart")}業績を見る</a>
      <a class="btn" href="${link(ROUTES.SUMMARY, { company: company.id })}">${icon("sparkle")}1枚サマリー</a>
      <a class="btn" href="${link(ROUTES.GOAL, { company: company.id })}">${icon("target")}目標と進捗</a>
      <a class="btn" href="${link(ROUTES.SIMULATIONS, { company: company.id })}">${icon("calculator")}試算する</a>
      <a class="btn" href="${link(ROUTES.REVIEW, { company: company.id, tab: "annual" })}">${icon("calendar")}月次・年度レビュー</a>
      <a class="btn" href="${link(ROUTES.ANNUAL, { company: company.id, period: "new" })}">${icon("book")}年次を登録する</a>
      <a class="btn" href="${link(ROUTES.MONTHLY, { company: company.id })}">${icon("clock")}月次を登録する</a>
      <a class="btn" href="${link(ROUTES.DATA)}">${icon("database")}データ管理</a>
    </div>

    <h2>登録の状況</h2>
    <div class="card">
      <h3 style="margin-top:0">年次（${periods.length}件）</h3>
      ${periods.length ? `<ul class="list-rows">${periodRows}</ul>` : `<p class="note">年次登録はまだありません。決算が確定したら登録してください。</p>`}
      <h3>月次（${monthly.length}件）</h3>
      ${monthly.length ? `<ul class="list-rows">${monthlyRows}</ul>` : `<p class="note">月次登録はまだありません。月の締めが終わったら登録してください。</p>`}
    </div>`;
}
