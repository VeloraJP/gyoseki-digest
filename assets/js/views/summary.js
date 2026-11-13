import { analysisComparison, selectAnalysisTarget } from "../core/analysis.js";
import { computeCashGap, selectCashGapPair } from "../core/cashflow.js";
import { buildFactorList, diffPair } from "../core/compare.js";
import { computeBreakEven, computeGoalSummary } from "../core/goal.js";
import { fieldHint, fieldLabel } from "../data/fields.js";
import {
  backButtonHtml,
  diffClass,
  esc,
  formatDiff,
  formatPercent,
  formatRate,
  formatYen
} from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";

// 1枚サマリー（追加フェーズ）。
// 既存の表示（自動業績分析・目標と進捗・損益分岐点・お金のちがい）の要点を
// 再配置したもので、新しい計算は行わない。印刷・共有に使う。

function progressBarHtml(rate, done = false) {
  const width = typeof rate === "number" && Number.isFinite(rate)
    ? Math.min(100, Math.max(0, rate))
    : 0;
  return `<div class="progress${done || width >= 100 ? " progress--done" : ""}">
    <div class="progress__bar" style="width:${width}%"></div>
    <span class="progress__cap">${icon("flag")}</span>
  </div>`;
}

// 作成日時の表示（印刷用見出しに使う）。曜日はロケールの表示に任せる。
function formatCreatedAt(date) {
  const day = date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const time = date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

function diffSub(figures, previousFigures, code) {
  if (!previousFigures) return "";
  const d = diffPair(figures[code], previousFigures[code]);
  if (d.amount === null) return "";
  return `<span class="${diffClass(d.amount)}">${formatDiff(d.amount)}（${formatRate(d.rate)}）</span> 前期比`;
}

export function renderSummary({ company, link }) {
  const head = `
    <div class="page-head">
      ${backButtonHtml({ topHref: link(ROUTES.HOME, { company: company.id }) })}
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>${pageIcon("sparkle", "sun")}1枚サマリー</h1>
      <p class="note">登録済みの数字から自動で作った、要点を1枚にまとめた表示です。印刷して、そのまま共有にも使えます。</p>
    </div>
    <div class="btn-row summary-actions">
      <button type="button" class="btn btn--primary" id="summary-print">印刷する</button>
    </div>
    <p class="note summary-print-note" id="summary-print-note" hidden>印刷プレビューが出ない場合は、このページをSafariで開き直してから、もう一度「印刷する」を押してください。</p>`;

  const selection = selectAnalysisTarget(company);
  const goalSummary = computeGoalSummary(company);

  if (!selection.target && !goalSummary) {
    return head + `
      <div class="card empty-state">
        <span class="empty-icon" aria-hidden="true">${icon("sprout")}</span>
        <p>まだ表示できる登録がありません。決算の数値を年次登録するか、月次を12か月分登録すると、ここに要点がまとまります。</p>
        <div class="btn-row">
          <a class="btn btn--primary" href="${link(ROUTES.ANNUAL, { company: company.id, period: "new" })}">年次を登録する</a>
          <a class="btn" href="${link(ROUTES.MONTHLY, { company: company.id })}">月次を登録する</a>
        </div>
      </div>`;
  }

  // 印刷用見出し（画面では出さない。print.css で表示する）。
  // 先頭の題字に会社名・対象期間・作成日時を置き、各ページ上部にも同じ見出しを繰り返す。
  const createdAt = formatCreatedAt(new Date());
  const periodLabel = selection.target?.label ?? goalSummary?.period?.displayName ?? "";
  const printBlocks = `
    <div class="print-head print-only" aria-hidden="true">
      <span class="print-head__brand">業績ダイジェスト｜1枚サマリー</span>
      <span class="print-head__meta">${esc(company.name)}${periodLabel ? `／${esc(periodLabel)}` : ""}／作成日時：${createdAt}</span>
    </div>
    <div class="print-title print-only">
      <p class="print-title__name">${esc(company.name)}</p>
      <p class="print-title__meta">1枚サマリー${periodLabel ? `（${esc(periodLabel)}）` : ""}</p>
      <p class="print-title__date">作成日時：${createdAt}</p>
    </div>`;

  const sections = [];

  if (selection.target) {
    const { target, previous } = selection;
    const figures = target.figures;
    const pf = previous?.figures ?? null;
    const comparison = analysisComparison(selection);
    const hasBreakdown = target.kind === "annual" && target.stage === "STANDARD";

    let pointsHtml = "";
    if (hasBreakdown) {
      pointsHtml = `
      <div class="kpi-grid" style="margin-top:0.8rem">
        <div class="kpi-item">
          <div class="kpi-label">営業利益<span class="note">（本業で得た利益）</span></div>
          <div class="kpi-value">${formatYen(figures.PL017)}</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">経常利益<span class="note">（本業以外も含めた通常の利益）</span></div>
          <div class="kpi-value">${formatYen(figures.PL020)}</div>
        </div>
      </div>`;
    } else {
      pointsHtml = `
      <div class="kpi-grid" style="margin-top:0.8rem">
        <div class="kpi-item">
          <div class="kpi-label">営業利益・経常利益</div>
          <div class="kpi-value">―</div>
          <div class="kpi-sub">${target.kind === "monthlyAggregate"
            ? "月次12か月分の集計では、売上高と当期純利益だけを集計しているため表示できません。"
            : "簡易登録（売上高と当期純利益だけの登録）では、費用の内訳がないため表示できません。"}</div>
        </div>
      </div>`;
    }

    let comparisonHtml = "";
    if (previous) {
      const rows = comparison.codes.map((code) => {
        const d = diffPair(figures[code], pf[code]);
        return `<tr>
          <td>${esc(fieldLabel(code))}</td>
          <td>${formatYen(d.current)}</td>
          <td>${formatYen(d.previous)}</td>
          <td class="${diffClass(d.amount)}">${formatDiff(d.amount)}</td>
          <td class="${diffClass(d.amount)}">${formatRate(d.rate)}</td>
        </tr>`;
      }).join("");
      comparisonHtml = `
      <h3>前期との比較（${esc(previous.label)}）</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>項目</th><th>今期</th><th>前期</th><th>増減額</th><th>増減率</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }

    let factorsHtml = "";
    if (comparison.showFactors) {
      const factors = buildFactorList(target.period, previous.period);
      if (factors.length) {
        const items = factors.map((f) =>
          `<li><span>${esc(f.label)}</span><span class="${diffClass(f.amount)}">${formatDiff(f.amount)}</span></li>`
        ).join("");
        factorsHtml = `
        <h3>増減の大きい項目</h3>
        <ul class="list-rows">${items}</ul>
        <p class="note">前期と比べて金額の増減が大きい項目を、大きい順に最大5つ並べています。増えた・減った事実の表示であり、原因を断定するものではありません。</p>`;
      }
    }

    sections.push(`
    <div class="card card--accent">
      <div class="kpi-label">${esc(company.name)}／${esc(target.label)}${target.kind === "monthlyAggregate" ? ' <span class="tag">月次集計</span>' : ""}</div>
      <div class="kpi-big" style="margin-top:0.4rem">
        <div class="kpi-label">当期純利益<span class="hint">${esc(fieldHint("PL025"))}</span></div>
        <div class="kpi-value">${formatYen(figures.PL025)}</div>
        <div class="kpi-sub">${diffSub(figures, pf, "PL025")}</div>
      </div>
      <div class="kpi-big" style="margin-top:0.8rem">
        <div class="kpi-label">売上高<span class="hint">商品やサービスを売った金額の合計</span></div>
        <div class="kpi-value" style="font-size:1.5rem">${formatYen(figures.PL001)}</div>
        <div class="kpi-sub">${diffSub(figures, pf, "PL001")}</div>
      </div>
      ${target.kind === "monthlyAggregate" ? `<p class="note" style="margin-top:0.8rem">当期純利益は月次12か月分の合計です。月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます。</p>` : ""}
      ${pointsHtml}
    </div>
    ${comparisonHtml || factorsHtml ? `<div class="card">${comparisonHtml}${factorsHtml}</div>` : ""}`);
  }

  if (goalSummary) {
    const { period, goal, result, progress } = goalSummary;
    const rate = progress ? progress.salesProgressRate : result.achievementRate;
    sections.push(`
    <div class="card">
      <h2 style="margin-top:0">${icon("flag")} 目標と進捗</h2>
      <div class="kpi-label">${esc(period.displayName)}の目標：${esc(fieldLabel(goal.profitCode))} ${formatYen(goal.amount)}${result.approximate ? ' <span class="tag">概算</span>' : ""}</div>
      <div class="kpi-grid" style="margin-top:0.6rem">
        <div class="kpi-item">
          <div class="kpi-label">必要な売上高</div>
          <div class="kpi-value">${formatYen(result.requiredSales)}</div>
          <div class="kpi-sub">目標の利益を出すために必要な、1年間の売上の合計</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">あといくら必要か</div>
          <div class="kpi-value">${goalSummary.remainingSales > 0 ? formatYen(goalSummary.remainingSales) : "届いています"}</div>
          <div class="kpi-sub">${progress ? "必要な売上高から、月次累計の売上を引いた金額" : "必要な売上高と、現在の売上との差"}</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">${progress ? "進捗率" : "達成率"}</div>
          <div class="kpi-value">${formatPercent(rate)}</div>
          <div class="kpi-sub">${progress ? `月次累計の売上 ${formatYen(progress.cumulativeSales)} ／ 必要売上高 ${formatYen(result.requiredSales)}` : "現在の売上 ÷ 必要な売上高（100%で目標に届きます）"}</div>
        </div>
      </div>
      ${progressBarHtml(rate, goalSummary.remainingSales <= 0)}
      ${progress && progress.remainingMonthCount > 0
        ? `<p style="margin:0.7rem 0 0">残り<strong>${progress.remainingMonthCount}か月</strong>で、月平均あと<strong>${formatYen(progress.requiredMonthlyAverage)}</strong>の売上が必要です。これまでの実績ペースは、月平均 <strong>${formatYen(progress.actualMonthlyAverage)}</strong> の売上です。</p>`
        : ""}
    </div>`);
  }

  // 損益分岐点は、対象が年次登録（標準）のときだけ。要点として金額と現在位置だけを載せる。
  const annualTarget = selection.target?.kind === "annual" ? selection.target.period : null;
  if (annualTarget) {
    const be = computeBreakEven(annualTarget);
    if (be.ok) {
      sections.push(`
    <div class="card">
      <h2 style="margin-top:0">${icon("chart")} 赤字にならない最低限の売上（損益分岐点）</h2>
      <div class="kpi-item">
        <div class="kpi-label">損益分岐点の売上高<span class="note">（売上と費用がちょうど釣り合う金額）</span></div>
        <div class="kpi-value">${formatYen(be.breakEvenSales)}</div>
        <div class="kpi-sub">現在の売上 ${formatYen(be.sales)} は、損益分岐点より ${be.difference >= 0 ? `${formatYen(be.difference)} 多い金額です` : `あと ${formatYen(-be.difference)} 足りません`}。</div>
      </div>
    </div>`);
    }
  }

  // お金のちがいは、計算できる場合だけ要点（現預金の動き）を載せる。内訳は業績を見る画面にある。
  const { current, previous } = selectCashGapPair(company);
  const gap = computeCashGap(current, previous);
  if (gap.ok) {
    sections.push(`
    <div class="card">
      <h2 style="margin-top:0">${icon("database")} 利益と手元のお金のちがい</h2>
      <div class="kpi-item">
        <div class="kpi-label">現預金の増減<span class="note">（${esc(gap.previousLabel)} → ${esc(gap.currentLabel)}）</span></div>
        <div class="kpi-value">${formatDiff(gap.cashChange)}</div>
        <div class="kpi-sub">現預金は ${formatYen(gap.cashPrevious)} から ${formatYen(gap.cashCurrent)} になりました。当期純利益は ${formatYen(gap.items[0].amount)} です。利益とお金の動きがずれる主な理由は、「業績を見る」画面で説明しています。これは予測ではなく、終わった期の実績の説明です。</div>
      </div>
    </div>`);
  }

  return printBlocks + head + sections.join("\n") + `
    <p class="note">このサマリーは、登録済みの数字から自動で作っています。数字の登録・修正は、それぞれの登録画面から行ってください。</p>
    <div class="btn-row summary-actions">
      <a class="btn" href="${link(ROUTES.ANALYSIS, { company: company.id })}">業績を見るへ</a>
      <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">ホームへ戻る</a>
    </div>`;
}

export function mountSummary(el) {
  const button = el.querySelector("#summary-print");
  if (!button) return;
  const note = el.querySelector("#summary-print-note");
  button.addEventListener("click", () => {
    // 通常のSafariタブでは window.print() で印刷プレビューが開き、
    // その直前に beforeprint が発火する。アプリ内ブラウザ等では
    // window.print() が無反応で beforeprint も来ないため、
    // 印刷が始まらなかった場合だけ Safari で開き直す案内を出す。
    let engaged = false;
    const onBeforePrint = () => {
      engaged = true;
      if (note) note.hidden = true;
    };
    window.addEventListener("beforeprint", onBeforePrint, { once: true });
    try {
      window.print();
    } catch {
      window.removeEventListener("beforeprint", onBeforePrint);
      if (note) note.hidden = false;
      return;
    }
    window.setTimeout(() => {
      window.removeEventListener("beforeprint", onBeforePrint);
      if (!engaged && note) note.hidden = false;
    }, 800);
  });
}
