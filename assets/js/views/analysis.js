import { analysisComparison, selectAnalysisTarget } from "../core/analysis.js";
import { buildFactorList, diffPair } from "../core/compare.js";
import { fieldHint, fieldLabel } from "../data/fields.js";
import { diffClass, esc, formatDiff, formatRate, formatYen } from "../components/dom.js";
import { ROUTES } from "../navigation/router.js";

function diffText(figures, previousFigures, code) {
  if (!previousFigures) return "";
  const d = diffPair(figures[code], previousFigures[code]);
  if (d.amount === null) return "";
  return `<span class="${diffClass(d.amount)}">${formatDiff(d.amount)}（${formatRate(d.rate)}）</span> 前期比`;
}

export function renderAnalysis({ company, link }) {
  const selection = selectAnalysisTarget(company);
  const head = `
    <div class="page-head">
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>業績を見る</h1>
    </div>`;

  if (!selection.target) {
    return head + `
      <div class="card">
        <p>まだ表示できる登録がありません。決算の数値を年次登録するか、月次を12か月分登録すると、ここに業績が表示されます。</p>
        <div class="btn-row">
          <a class="btn btn--primary" href="${link(ROUTES.ANNUAL, { company: company.id, period: "new" })}">年次を登録する</a>
          <a class="btn" href="${link(ROUTES.MONTHLY, { company: company.id })}">月次を登録する</a>
        </div>
      </div>`;
  }

  const { target, previous } = selection;
  const figures = target.figures;
  const pf = previous?.figures ?? null;
  const comparison = analysisComparison(selection);

  const reference = target.kind === "annual" && target.stage === "STANDARD"
    ? `<div class="kpi-grid" style="margin-top:0.8rem">
         <div class="kpi-item">
           <div class="kpi-label">営業利益<span class="note">（本業で得た利益）</span></div>
           <div class="kpi-value">${formatYen(figures.PL017)}</div>
         </div>
         <div class="kpi-item">
           <div class="kpi-label">経常利益<span class="note">（本業以外も含めた通常の利益）</span></div>
           <div class="kpi-value">${formatYen(figures.PL020)}</div>
         </div>
       </div>`
    : "";

  let comparisonHtml = "";
  if (previous) {
    const rows = comparison.codes.map((code) => {
      const d = diffPair(figures[code], pf[code]);
      return `<tr>
        <td>${esc(fieldLabel(code))}${fieldHint(code) ? `<span class="row-hint">${esc(fieldHint(code))}</span>` : ""}</td>
        <td>${formatYen(d.current)}</td>
        <td>${formatYen(d.previous)}</td>
        <td class="${diffClass(d.amount)}">${formatDiff(d.amount)}</td>
        <td class="${diffClass(d.amount)}">${formatRate(d.rate)}</td>
      </tr>`;
    }).join("");
    comparisonHtml = `
      <h2>前期との比較（${esc(previous.label)}）</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>項目</th><th>今期</th><th>前期</th><th>増減額</th><th>増減率</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    comparisonHtml = `<p class="note">比較できる前期の登録がないため、今期の要約だけを表示しています。</p>`;
  }

  let factorsHtml = "";
  if (comparison.showFactors) {
    const factors = buildFactorList(target.period, previous.period);
    if (factors.length) {
      const rows = factors.map((f) => `<tr>
        <td>${esc(f.label)}</td>
        <td>${formatYen(f.current)}</td>
        <td>${formatYen(f.previous)}</td>
        <td class="${diffClass(f.amount)}">${formatDiff(f.amount)}</td>
        <td class="${diffClass(f.amount)}">${formatRate(f.rate)}</td>
      </tr>`).join("");
      factorsHtml = `
        <h2>増減の大きい項目</h2>
        <p class="note">前期と比べて金額の増減が大きい項目を、大きい順に最大5つ並べています。増えた・減った事実の表示であり、原因を断定するものではありません。</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>項目</th><th>今期</th><th>前期</th><th>増減額</th><th>増減率</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  }

  return head + `
    <p class="note">対象：${esc(target.label)}${target.kind === "monthlyAggregate" ? ' <span class="tag">月次集計</span>（年次登録ではなく、月次12か月分の合計です）' : ""}</p>
    <div class="card card--accent">
      <div class="kpi-big">
        <div class="kpi-label">当期純利益<span class="hint">最終的に残る利益</span></div>
        <div class="kpi-value">${formatYen(figures.PL025)}</div>
        <div class="kpi-sub">${diffText(figures, pf, "PL025")}</div>
      </div>
      <div class="kpi-big" style="margin-top:0.8rem">
        <div class="kpi-label">売上高</div>
        <div class="kpi-value" style="font-size:1.5rem">${formatYen(figures.PL001)}</div>
        <div class="kpi-sub">${diffText(figures, pf, "PL001")}</div>
      </div>
      ${reference}
    </div>
    ${comparisonHtml}
    ${factorsHtml}
    <div class="btn-row">
      <a class="btn" href="${link(ROUTES.REVIEW, { company: company.id, tab: "annual" })}">月次・年度レビューへ</a>
      <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">ホームへ戻る</a>
    </div>`;
}
