import { analysisComparison, selectAnalysisTarget } from "../core/analysis.js";
import { computeCashGap, selectCashGapPair } from "../core/cashflow.js";
import { buildFactorList, diffPair } from "../core/compare.js";
import { fieldHint, fieldLabel } from "../data/fields.js";
import { backButtonHtml, diffClass, esc, formatDiff, formatRate, formatYen } from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";

function diffText(figures, previousFigures, code) {
  if (!previousFigures) return "";
  const d = diffPair(figures[code], previousFigures[code]);
  if (d.amount === null) return "";
  return `<span class="${diffClass(d.amount)}">${formatDiff(d.amount)}（${formatRate(d.rate)}）</span> 前期比`;
}

function cashGapReasonMessage(reason) {
  if (reason === "NO_PREVIOUS") {
    return "比べる前期の年次登録がないため、表示できません。2期分の年次登録と、それぞれの貸借対照表（B/S）の登録があると表示されます。";
  }
  if (reason === "NOT_STANDARD") {
    return "対象の期が簡易登録のため、減価償却費などの内訳がなく、表示できません。標準登録（内訳まで登録）の期で、貸借対照表（B/S）も登録すると表示されます。";
  }
  if (reason === "NO_BS") {
    return "貸借対照表（B/S）の登録が、今期・前期のどちらか（または両方）にないため、表示できません。年次登録の画面でB/Sを登録すると表示されます。";
  }
  return "お金の動きを見る項目（現預金・売掛金・棚卸資産・買掛金・借入金）の登録が一部足りないため、表示できません。";
}

// 各内訳の「何のお金か」の説明。増減の向きで文面を変える。
function cashGapItemText(item) {
  switch (item.code) {
    case "NET_INCOME":
      return { label: "当期純利益", note: "税金などを引いたあと、最終的に残った利益です。利益は、まず手元のお金を増やす方向に働きます。" };
    case "DEPRECIATION":
      return { label: "減価償却費", note: "建物や機械などの価値の目減り分を費用にしたもので、実際にはお金が出ていないため、足し戻します。" };
    case "RECEIVABLES":
      return {
        label: "売掛金の増減",
        note: item.amount >= 0
          ? "まだ入金されていない売上が増えた分、そのお金はまだ手元に入っていません。"
          : "たまっていた売掛金の入金が進み、その分、手元のお金が戻ってきています。"
      };
    case "INVENTORY":
      return {
        label: "棚卸資産（在庫）の増減",
        note: item.amount >= 0
          ? "在庫を増やすためにお金を使っています。その分、手元のお金は減る方向です。"
          : "在庫が減った分、仕入れに使うお金が減り、手元のお金は増える方向です。"
      };
    case "PAYABLES":
      return {
        label: "買掛金の増減",
        note: item.amount >= 0
          ? "まだ支払っていない仕入代金が増えた分、そのお金は手元に残っています。"
          : "仕入代金の支払いが進んだ分、手元のお金が出ています。"
      };
    case "DEBT":
      return {
        label: "借入金の増減",
        note: item.amount >= 0
          ? "新しく借りた分、手元のお金が増えています。"
          : "返済した分、手元のお金が出ています。"
      };
    default:
      return { label: "その他の動き", note: "設備の購入・買い替えや、税金の支払いなど、上の項目以外の動きをまとめたものです。内訳は特定していません。" };
  }
}

// 利益と手元のお金のちがい（追加フェーズ）。過ぎた期の実績の説明であり、予測ではない。
// 対象が年次登録の場合だけ枠を出し、出せない場合は理由を示す（枠ごと消さない）。
export function renderCashGap(company) {
  const head = `<h2>利益と手元のお金のちがい</h2>`;
  const { current, previous } = selectCashGapPair(company);
  const result = computeCashGap(current, previous);
  if (!result.ok) {
    return head + `
      <div class="card">
        <div class="kpi-item">
          <div class="kpi-label">現預金の増減<span class="note">（手元のお金がどれだけ増えた・減ったか）</span></div>
          <div class="kpi-value">―</div>
          <div class="kpi-sub">${esc(cashGapReasonMessage(result.reason))}</div>
        </div>
      </div>`;
  }
  const rows = result.items.map((item) => {
    const text = cashGapItemText(item);
    return `<tr>
      <td>${esc(text.label)}<span class="row-hint">${esc(text.note)}</span></td>
      <td>${formatDiff(item.amount)}</td>
      <td style="font-weight:700">${formatDiff(item.effect)}</td>
    </tr>`;
  }).join("");
  return head + `
    <div class="card">
      <p class="note" style="margin-top:0">「利益は出ているのに、手元のお金が思ったより増えていない（または減っている）」ことがあります。その主な理由を、${esc(result.previousLabel)}から${esc(result.currentLabel)}にかけての実績で説明します。これは将来の予測ではなく、終わった期の数字の説明です。また、主な項目だけを取り上げており、すべての動きを説明するものではありません。</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>項目</th><th>金額・増減</th><th>手元のお金への影響</th></tr></thead>
          <tbody>
            ${rows}
            <tr class="auto-row">
              <td>現預金<span class="row-hint">手元のお金そのものです（${formatYen(result.cashPrevious)} → ${formatYen(result.cashCurrent)}）</span></td>
              <td>${formatDiff(result.cashChange)}</td>
              <td style="font-weight:700">${formatDiff(result.cashChange)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">「手元のお金への影響」は、＋がお金が増える方向、−が減る方向です。上の行の影響をすべて合計すると、現預金の増減と一致します。</p>
    </div>`;
}

export function renderAnalysis({ company, link }) {
  const selection = selectAnalysisTarget(company);
  const head = `
    <div class="page-head">
      ${backButtonHtml()}
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>${pageIcon("chart")}業績を見る</h1>
    </div>`;

  if (!selection.target) {
    return head + `
      <div class="card empty-state">
        <span class="empty-icon" aria-hidden="true">${icon("sprout")}</span>
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

  // 営業利益・経常利益の枠は、どの対象でも同じ位置に常時出す。
  // 標準登録以外では計算できないため、金額の代わりに理由を示す（枠ごと消さない）。
  const hasBreakdown = target.kind === "annual" && target.stage === "STANDARD";
  const breakdownReason = target.kind === "monthlyAggregate"
    ? "月次12か月分の集計では、売上高と当期純利益だけを集計しているため、この2つの利益は表示できません。"
    : "この期は簡易登録（売上高と当期純利益だけの登録）で、費用の内訳がないため、この2つの利益は表示できません。標準登録（内訳まで登録）にすると表示されます。";
  const referenceItem = (code, noteText) => `
         <div class="kpi-item">
           <div class="kpi-label">${esc(fieldLabel(code))}<span class="note">（${noteText}）</span></div>
           <div class="kpi-value">${hasBreakdown ? formatYen(figures[code]) : "―"}</div>
           ${hasBreakdown ? "" : '<div class="kpi-sub">表示できません</div>'}
         </div>`;
  const reference = `
      <div class="kpi-grid" style="margin-top:0.8rem">
        ${referenceItem("PL017", "本業で得た利益")}
        ${referenceItem("PL020", "本業以外も含めた通常の利益")}
      </div>
      ${hasBreakdown ? "" : `<p class="note" style="margin-top:0.6rem">${breakdownReason}</p>`}`;

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
      <p class="note">「今期」は今回の期、「前期」は1つ前の期の金額です。増減額と増減率は、前期と比べた差を表します。</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>項目</th><th>今期</th><th>前期</th><th>増減額</th><th>増減率</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${comparison.showFactors ? "" : `<p class="note">費用などの項目ごとの増減一覧は、今期と前期の両方が標準登録（費用の内訳まで登録）のときに表示されます。</p>`}`;
  } else {
    comparisonHtml = `<p class="note">比較できる前期の登録がないため、今期の要約だけを表示しています。</p>`;
  }

  let factorsHtml = "";
  if (comparison.showFactors) {
    const factors = buildFactorList(target.period, previous.period);
    if (factors.length) {
      const rows = factors.map((f) => `<tr>
        <td>${esc(f.label)}${fieldHint(f.code) ? `<span class="row-hint">${esc(fieldHint(f.code))}</span>` : ""}</td>
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

  const cashGapHtml = target.kind === "annual" ? renderCashGap(company) : "";

  return head + `
    <p class="note">対象：${esc(target.label)}${target.kind === "monthlyAggregate" ? ' <span class="tag">月次集計</span>（年次登録ではなく、月次12か月分の合計です）' : ""}</p>
    <div class="card card--accent">
      <div class="kpi-big">
        <div class="kpi-label">当期純利益<span class="hint">${esc(fieldHint("PL025"))}</span></div>
        <div class="kpi-value">${formatYen(figures.PL025)}</div>
        <div class="kpi-sub">${diffText(figures, pf, "PL025")}</div>
      </div>
      <div class="kpi-big" style="margin-top:0.8rem">
        <div class="kpi-label">売上高<span class="hint">商品やサービスを売った金額の合計</span></div>
        <div class="kpi-value" style="font-size:1.5rem">${formatYen(figures.PL001)}</div>
        <div class="kpi-sub">${diffText(figures, pf, "PL001")}</div>
      </div>
      ${reference}
    </div>
    ${comparisonHtml}
    ${factorsHtml}
    ${cashGapHtml}
    <div class="btn-row">
      <a class="btn" href="${link(ROUTES.SUMMARY, { company: company.id })}">1枚サマリーへ</a>
      <a class="btn" href="${link(ROUTES.GOAL, { company: company.id })}">目標と進捗へ</a>
      <a class="btn" href="${link(ROUTES.REVIEW, { company: company.id, tab: "annual" })}">月次・年度レビューへ</a>
      <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">ホームへ戻る</a>
    </div>`;
}
