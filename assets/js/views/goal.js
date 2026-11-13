import {
  AMOUNT_INPUT_UNIT_LABELS,
  GOAL_PROFIT_CODES,
  REGISTRATION_STAGES
} from "../config/constants.js";
import { fieldHint, fieldLabel } from "../data/fields.js";
import {
  compareGoalPlans,
  computeBreakEven,
  computeGoalProgress,
  computeRequiredSales,
  latestGoalPeriod
} from "../core/goal.js";
import { clearPeriodGoal } from "../core/manage.js";
import {
  backButtonHtml,
  esc,
  formatPercent,
  formatYearMonth,
  formatYen,
  fromYen,
  parseAmountInput,
  toYen
} from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";
import { sortedPeriods } from "./home.js";

// 進捗バーの幅（0〜100に丸める）。数値でない場合は0。
function barWidth(rate) {
  return typeof rate === "number" && Number.isFinite(rate)
    ? Math.min(100, Math.max(0, rate))
    : 0;
}

function progressBarHtml(rate, { light = false, done = false } = {}) {
  const width = barWidth(rate);
  return `<div class="progress${light ? " progress--light" : ""}${done || width >= 100 ? " progress--done" : ""}">
    <div class="progress__bar" style="width:${width}%"></div>
    <span class="progress__cap">${icon("flag")}</span>
  </div>`;
}

const GOAL_TYPE_ORDER = ["PL025", "PL020", "PL017"];

function goalTypeLabel(code) {
  const hint = fieldHint(code);
  return hint ? `${fieldLabel(code)}（${hint}）` : fieldLabel(code);
}

function assumptionText(goalType) {
  if (goalType === "PL017") {
    return "目標は営業利益（本業で得た利益）です。そのまま必要売上高の計算に使います。";
  }
  if (goalType === "PL020") {
    return "経常利益の目標を、営業外の収益・費用（受取利息や支払利息など）がこの期と同じという前提で、営業利益の目標に換算しています。";
  }
  return "当期純利益の目標を、営業外の収益・費用、特別な利益・損失、法人税等がこの期と同じという前提で、営業利益の目標に換算しています。前提が多いため、結果は概算です。";
}

function reasonMessage(reason) {
  if (reason === "NO_SALES") return "この期の売上高が0のため、必要売上高を計算できません。";
  if (reason === "RATE_NOT_POSITIVE") {
    return "この期は、売上に対して原価などの変動費が大きく、売上を増やしても利益が増えにくい形のため、この計算では必要売上高を求められません。";
  }
  return "計算に必要な数字がそろっていません。";
}

function renderResult(company, period) {
  const goal = period.goal;
  if (!goal) {
    return `<div class="card empty-state">
      <span class="empty-icon" aria-hidden="true">${icon("flag")}</span>
      <p>目標を保存すると、必要な売上高と「あといくら必要か」「達成率」がここに表示されます。</p>
    </div>`;
  }
  const result = computeRequiredSales(period, goal);
  if (!result.ok) {
    return `<div class="card"><div class="error-box">${esc(reasonMessage(result.reason))}</div></div>`;
  }
  const progress = computeGoalProgress(company, period, result);

  // 利益の累計の枠は、どの利益の種類でも同じ位置に常時出す。
  // 経常利益は月次に同じ物差しの数字がないため進捗を計算できないが、
  // 枠ごと消さず、理由を示す（構造をそろえ、何が違うかを利用者に伝える）。
  let profitProgressHtml = "";
  if (progress) {
    if (progress.profitProgress) {
      const pp = progress.profitProgress;
      const ppHint = fieldHint(pp.profitCode);
      profitProgressHtml = `<div class="kpi-item">
         <div class="kpi-label">${esc(fieldLabel(pp.profitCode))}の累計${ppHint ? `<span class="note">（${esc(ppHint)}）</span>` : ""}（目標 ${formatYen(pp.target)}）</div>
         <div class="kpi-value">${formatYen(pp.actual)}</div>
         <div class="kpi-sub">月次に登録した${esc(fieldLabel(pp.profitCode))}の合計です${pp.profitCode === "PL025" ? "。月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます" : ""}</div>
         ${pp.rate !== null ? `<div class="kpi-sub">進捗率 ${formatPercent(pp.rate)}</div>${progressBarHtml(pp.rate)}` : ""}
       </div>`;
    } else {
      const typeHint = fieldHint(result.goalType);
      profitProgressHtml = `<div class="kpi-item">
         <div class="kpi-label">${esc(fieldLabel(result.goalType))}の累計${typeHint ? `<span class="note">（${esc(typeHint)}）</span>` : ""}（目標 ${formatYen(result.goalAmount)}）</div>
         <div class="kpi-value">―</div>
         <div class="kpi-sub">${esc(fieldLabel(result.goalType))}は、月次に同じ物差しの数字がないため、利益の進捗は表示できません。売上の進捗で見てください。</div>
       </div>`;
    }
  }

  const progressHtml = progress
    ? `<h2>月次の進捗</h2>
       <div class="card">
         <p class="note" style="margin-top:0">進捗は、目標の期の翌期（${esc(progress.fiscalLabel)}）の月次登録で計算しています。</p>
         <div class="kpi-grid">
           <div class="kpi-item">
             <div class="kpi-label">必要売上高までの進捗率</div>
             <div class="kpi-value">${formatPercent(progress.salesProgressRate)}</div>
             <div class="kpi-sub">月次累計の売上 ${formatYen(progress.cumulativeSales)} ／ 必要売上高 ${formatYen(result.requiredSales)}（必要な売上高に対して、ここまで進んだ割合）</div>
           </div>
           ${profitProgressHtml}
           <div class="kpi-item">
             <div class="kpi-label">あと必要な売上</div>
             <div class="kpi-value">${formatYen(progress.remainingSales)}</div>
             <div class="kpi-sub">必要な売上高から、月次累計の売上を引いた金額</div>
           </div>
         </div>
         ${progressBarHtml(progress.salesProgressRate)}
         ${progress.remainingMonthCount > 0
           ? `<p style="margin-top:0.8rem">残り<strong>${progress.remainingMonthCount}か月</strong>で、月平均あと<strong>${formatYen(progress.requiredMonthlyAverage)}</strong>の売上が必要です。<br>
              これまでの実績ペースは、月平均 <strong>${formatYen(progress.actualMonthlyAverage)}</strong> の売上です。</p>`
           : `<p style="margin-top:0.8rem">この期の月はすべて過ぎています。残りの期間はありません。</p>`}
         <p class="note">進捗は、${formatYearMonth(progress.months[0])}から${formatYearMonth(progress.latestYearMonth)}までのうち、登録済みの${progress.registeredCount}か月分の月次で計算しています。${
           progress.missingMonths.length
             ? `まだ登録されていない月（${progress.missingMonths.map(formatYearMonth).join("、")}）があり、累計は登録済みの月だけの合計です。`
             : ""
         }</p>
       </div>`
    : "";

  return `
    <div class="card card--accent">
      <div class="kpi-label">${esc(period.displayName)}の目標：${esc(fieldLabel(result.goalType))} ${formatYen(result.goalAmount)}${result.approximate ? ' <span class="tag">概算</span>' : ""}</div>
      <div class="kpi-grid" style="margin-top:0.6rem">
        <div class="kpi-item">
          <div class="kpi-label">必要な売上高</div>
          <div class="kpi-value">${formatYen(result.requiredSales)}</div>
          <div class="kpi-sub">目標の利益を出すために必要な、1年間の売上の合計</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">あといくら必要か</div>
          <div class="kpi-value">${result.alreadyAchieved ? "届いています" : formatYen(result.additionalSales)}</div>
          <div class="kpi-sub">必要な売上高と、現在の売上 ${formatYen(result.sales)} との差</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">達成率</div>
          <div class="kpi-value">${formatPercent(result.achievementRate)}</div>
          <div class="kpi-sub">現在の売上 ÷ 必要な売上高（100%で目標に届きます）</div>
        </div>
      </div>
      ${progressBarHtml(result.achievementRate, { light: true, done: result.alreadyAchieved })}
    </div>
    <div class="note-box">
      ${esc(assumptionText(result.goalType))}<br>
      費用の内訳（固定費・変動費）と、売上に対して残る利益の割合は、この期の実績と同じという前提で計算しています。あくまで目安として使ってください。
    </div>
    ${progressHtml}`;
}

function breakEvenReasonMessage(reason) {
  if (reason === "NO_SALES") return "この期の売上高が0のため、計算できません。";
  if (reason === "RATE_NOT_POSITIVE") {
    return "この期は、売上に対して原価などの変動費が大きく、売上を増やしても利益が増えにくい形のため、この計算では求められません。";
  }
  return "計算に必要な数字がそろっていません。";
}

// 損益分岐点（赤字にならない最低限の売上）。目標の有無にかかわらず、
// 標準登録の期では常に出す。出せない場合は枠を残して理由を示す。
function renderBreakEven(period) {
  const result = computeBreakEven(period);
  const head = `<h2>赤字にならない最低限の売上（損益分岐点）</h2>`;
  if (!result.ok) {
    return head + `
    <div class="card">
      <div class="kpi-item">
        <div class="kpi-label">損益分岐点の売上高<span class="note">（売上と費用がちょうど釣り合う金額）</span></div>
        <div class="kpi-value">―</div>
        <div class="kpi-sub">${esc(breakEvenReasonMessage(result.reason))}</div>
      </div>
    </div>`;
  }
  const diffText = result.difference >= 0
    ? `現在の売上 ${formatYen(result.sales)} は、損益分岐点より ${formatYen(result.difference)} 多い金額です。`
    : `現在の売上 ${formatYen(result.sales)} は、損益分岐点まであと ${formatYen(-result.difference)} 足りません。`;
  return head + `
    <div class="card">
      <div class="kpi-item">
        <div class="kpi-label">損益分岐点の売上高<span class="note">（売上と費用がちょうど釣り合う金額）</span></div>
        <div class="kpi-value">${formatYen(result.breakEvenSales)}</div>
        <div class="kpi-sub">この期の費用の内訳（固定費・変動費）で計算しています。売上がこの金額を下回ると、営業利益（本業の利益）がマイナスになります。</div>
      </div>
      <p style="margin:0.7rem 0 0">${esc(diffText)}</p>
    </div>`;
}

function renderPlans(period) {
  const goalAmount = period.goal && period.goal.profitCode ? period.goal.amount : null;
  const inputs = [0, 1, 2].map((i) => `
    <div class="field">
      <label for="plan-amount-${i}">案${i + 1}の目標額</label>
      <input type="number" inputmode="decimal" id="plan-amount-${i}" data-plan-amount="${i}"
             value="${i === 0 && goalAmount !== null ? esc(String(goalAmount)) : ""}">
    </div>`).join("");
  return `
    <h2>目標額を変えて比べる</h2>
    <div class="card">
      <p class="note">同じ費用の内訳のまま、目標額だけを変えた案を最大3つまで並べて比べます。案は保存されません（この場だけの比較です）。金額は円で入力してください。</p>
      ${inputs}
      <div class="btn-row">
        <button type="button" class="btn" id="plans-compare-btn">比べる</button>
      </div>
      <div id="plans-result"></div>
    </div>`;
}

export function renderGoal({ company, params, link }) {
  const head = `
    <div class="page-head">
      ${backButtonHtml({ topHref: link(ROUTES.HOME, { company: company.id }) })}
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>${pageIcon("flag", "sun")}目標と進捗</h1>
      <p class="note">目標の利益を決めると、そのために必要な売上高と、あといくら必要かを表示します。</p>
    </div>`;

  const periods = sortedPeriods(company);
  if (periods.length === 0) {
    return head + `
      <div class="card empty-state">
        <span class="empty-icon" aria-hidden="true">${icon("book")}</span>
        <p>年次登録がまだありません。目標は、決算の数字（年次登録）をもとに計算します。まず年次を登録してください。</p>
        <div class="btn-row">
          <a class="btn btn--primary" href="${link(ROUTES.ANNUAL, { company: company.id, period: "new" })}">年次を登録する</a>
        </div>
      </div>`;
  }

  const selected =
    periods.find((p) => p.id === params.period) ??
    latestGoalPeriod(company) ??
    periods[periods.length - 1];
  const unit = company.amountInputUnit;
  const unitLabel = AMOUNT_INPUT_UNIT_LABELS[unit];

  const options = [...periods].reverse().map((p) =>
    `<option value="${p.id}" ${p.id === selected.id ? "selected" : ""}>${esc(p.displayName)}（${p.stage === "SIMPLE" ? "簡易登録" : "標準登録"}）${p.goal ? "・目標あり" : ""}</option>`
  ).join("");

  const periodSelect = `
    <div class="field" style="max-width:22rem">
      <label for="goal-period">対象の期</label>
      <select id="goal-period">${options}</select>
    </div>`;

  if (selected.stage !== REGISTRATION_STAGES.STANDARD) {
    return head + periodSelect + `
      <div class="card">
        <p>この期は簡易登録（売上高と当期純利益だけ）のため、目標の計算は使えません。費用の内訳が分かる標準登録の期で使えます。</p>
        <div class="btn-row">
          <a class="btn" href="${link(ROUTES.ANNUAL, { company: company.id, period: selected.id })}">この期の登録を開く</a>
        </div>
      </div>`;
  }

  const goal = selected.goal ?? null;
  const typeOptions = GOAL_TYPE_ORDER.map((code) =>
    `<option value="${code}" ${goal?.profitCode === code || (!goal && code === "PL025") ? "selected" : ""}>${esc(goalTypeLabel(code))}</option>`
  ).join("");

  const form = `
    <div class="card">
      <h2 style="margin-top:0">目標の設定（${esc(selected.displayName)}）</h2>
      <p class="note">目標は、この期の実績（費用の内訳）をもとに計算します。進捗は、翌期の月次登録で追います。</p>
      <form id="goal-form" novalidate>
        <div class="field">
          <label for="goal-type">目標にする利益の種類</label>
          <select id="goal-type">${typeOptions}</select>
        </div>
        <div class="field">
          <label for="goal-amount">目標額<span class="hint">金額の入力単位は「${unitLabel}」です。</span></label>
          <input type="number" inputmode="decimal" id="goal-amount" value="${goal ? esc(fromYen(goal.amount, unit)) : ""}">
        </div>
        <div id="goal-errors"></div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary">目標を保存する</button>
        </div>
      </form>
      ${goal ? `
        <div class="btn-row">
          <button type="button" class="btn" id="goal-clear-btn">目標を取り消す</button>
        </div>
        <div id="goal-clear-confirm" hidden>
          <div class="error-box">
            この期の目標を取り消しますか。登録した決算の数字は消えません。
            <div class="btn-row" style="margin-top:0.5rem">
              <button type="button" class="btn btn--danger" id="goal-clear-confirm-btn">取り消す</button>
            </div>
          </div>
        </div>` : ""}
    </div>`;

  return head + periodSelect + form + renderResult(company, selected) + renderBreakEven(selected) + renderPlans(selected) + `
    <div class="btn-row">
      <a class="btn" href="${link(ROUTES.ANALYSIS, { company: company.id })}">業績を見るへ</a>
      <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">ホームへ戻る</a>
    </div>`;
}

export function mountGoal(el, { store, company, navigate }) {
  const unit = company.amountInputUnit;

  const periodSelect = el.querySelector("#goal-period");
  periodSelect?.addEventListener("change", () => {
    navigate(ROUTES.GOAL, { company: company.id, period: periodSelect.value });
  });

  const form = el.querySelector("#goal-form");
  if (form) {
    const periodId = periodSelect.value;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const errorsEl = el.querySelector("#goal-errors");
      const parsed = parseAmountInput(el.querySelector("#goal-amount").value ?? "");
      if (parsed === null) {
        errorsEl.innerHTML = `<div class="error-box">目標額を入力してください。</div>`;
        return;
      }
      const profitCode = el.querySelector("#goal-type").value;
      if (!GOAL_PROFIT_CODES.includes(profitCode)) {
        errorsEl.innerHTML = `<div class="error-box">目標にする利益の種類を選んでください。</div>`;
        return;
      }
      const amount = toYen(parsed, unit);
      store.commit((draft) => {
        const target = draft.companies.find((c) => c.id === company.id);
        const period = target?.annualPeriods.find((p) => p.id === periodId);
        if (period) period.goal = { profitCode, amount };
      });
      navigate(ROUTES.GOAL, { company: company.id, period: periodId });
    });
  }

  const clearBtn = el.querySelector("#goal-clear-btn");
  if (clearBtn) {
    const confirmBox = el.querySelector("#goal-clear-confirm");
    clearBtn.addEventListener("click", () => {
      confirmBox.hidden = false;
      // 確認ボックスが見える位置までスクロールして知らせる。
      confirmBox.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
    el.querySelector("#goal-clear-confirm-btn")?.addEventListener("click", () => {
      const periodId = periodSelect.value;
      store.commit((draft) => {
        const target = draft.companies.find((c) => c.id === company.id);
        if (target) clearPeriodGoal(target, periodId);
      });
      navigate(ROUTES.GOAL, { company: company.id, period: periodId });
    });
  }

  const compareBtn = el.querySelector("#plans-compare-btn");
  if (compareBtn) {
    compareBtn.addEventListener("click", () => {
      const resultEl = el.querySelector("#plans-result");
      const periodId = periodSelect.value;
      const fresh = store.getCompany(company.id);
      const period = fresh?.annualPeriods.find((p) => p.id === periodId);
      if (!period) return;
      const profitCode = period.goal?.profitCode ?? el.querySelector("#goal-type")?.value ?? "PL025";
      const amounts = [];
      el.querySelectorAll("[data-plan-amount]").forEach((input) => {
        const parsed = parseAmountInput(input.value ?? "");
        if (parsed !== null) amounts.push(Math.round(parsed));
      });
      if (amounts.length === 0) {
        resultEl.innerHTML = `<div class="error-box">比べたい目標額を、少なくとも1つ入力してください。</div>`;
        return;
      }
      const plans = compareGoalPlans(period, profitCode, amounts);
      const rows = plans.map((plan, i) => {
        const r = plan.result;
        if (!r.ok) {
          return `<tr><td>案${i + 1}</td><td>${formatYen(plan.amount)}</td><td colspan="3">計算できません（${esc(reasonMessage(r.reason))}）</td></tr>`;
        }
        return `<tr>
          <td>案${i + 1}${period.goal && plan.amount === period.goal.amount ? "（保存中の目標）" : ""}</td>
          <td>${formatYen(plan.amount)}</td>
          <td>${formatYen(r.requiredSales)}</td>
          <td>${r.alreadyAchieved ? "届いています" : formatYen(r.additionalSales)}</td>
          <td>${formatPercent(r.achievementRate)}</td>
        </tr>`;
      }).join("");
      resultEl.innerHTML = `
        <p class="note" style="margin-top:0.8rem">目標は「${esc(fieldLabel(profitCode))}」で比べています。${plans.some((p) => p.result.ok && p.result.approximate) ? "当期純利益の目標のため、金額は概算です。" : ""}</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>案</th><th>目標額</th><th>必要な売上高</th><th>あといくら必要か</th><th>達成率</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    });
  }
}
