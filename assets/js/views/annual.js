import {
  AMOUNT_INPUT_UNIT_LABELS,
  REGISTRATION_STAGES
} from "../config/constants.js";
import {
  ANNUAL_AUTO_CODES,
  BS_FIELDS,
  PL_FIELDS,
  SIMPLE_INPUT_CODES,
  STANDARD_INPUT_CODES,
  STANDARD_OPTIONAL_CODES,
  fieldHint,
  fieldLabel
} from "../data/fields.js";
import { createAnnualPeriod, defaultPeriodDisplayName } from "../data/schema.js";
import { removeAnnualPeriod } from "../core/manage.js";
import { buildMonthlyAggregate, fiscalPeriodMonths, getAnnualFigures, getBSFigures, listFiscalKeys } from "../core/calc.js";
import { validateAnnualRegistration } from "../core/validate.js";
import { backButtonHtml, esc, formatYen, fromYen, parseAmountInput, toYen } from "../components/dom.js";
import { pageIcon } from "../components/icons.js";
import { ROUTES } from "../navigation/router.js";

function amountField(code, values, unit) {
  const hint = fieldHint(code);
  return `
    <div class="field" data-code="${code}">
      <label for="in-${code}">${esc(fieldLabel(code))}${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>
      <input type="number" inputmode="decimal" id="in-${code}" data-amount="${code}"
             value="${esc(fromYen(values?.[code] ?? null, unit))}">
    </div>`;
}

export function renderAnnual({ company, period, link }) {
  const unit = company.amountInputUnit;
  const unitLabel = AMOUNT_INPUT_UNIT_LABELS[unit];
  const isNew = !period;
  const stage = period?.stage ?? REGISTRATION_STAGES.STANDARD;
  const values = period?.values ?? {};
  const bsValues = period?.bsValues ?? {};

  const simpleFields = SIMPLE_INPUT_CODES.map((c) => amountField(c, values, unit)).join("");
  const standardFields = STANDARD_INPUT_CODES.map((c) => amountField(c, values, unit)).join("");
  const optionalFields = STANDARD_OPTIONAL_CODES.map((c) => amountField(c, values, unit)).join("");
  const bsInputFields = BS_FIELDS.filter((f) => !f.auto).map((f) => amountField(f.id, bsValues, unit)).join("");

  return `
    <div class="page-head">
      ${backButtonHtml({ topHref: link(ROUTES.HOME, { company: company.id }) })}
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>${pageIcon("book")}年次登録${isNew ? "" : "（登録済みの期）"}</h1>
      <p class="note">決算が確定したあと、年1回の登録を基本とします。金額の入力単位は「${unitLabel}」です。</p>
    </div>
    <form id="annual-form" class="card" novalidate>
      <div class="field" data-code="startDate">
        <label for="f-start">期の開始日</label>
        <input type="date" id="f-start" value="${esc(period?.startDate ?? "")}">
      </div>
      <div class="field" data-code="endDate">
        <label for="f-end">期の終了日</label>
        <input type="date" id="f-end" value="${esc(period?.endDate ?? "")}">
      </div>
      <div class="field">
        <label for="f-display">表示名<span class="hint">空欄の場合は終了日から自動で付けます（例：2026年3月期）。</span></label>
        <input type="text" id="f-display" value="${esc(period?.displayName ?? "")}" autocomplete="off">
      </div>
      <div class="field">
        <label for="f-stage">登録の仕方</label>
        <select id="f-stage">
          <option value="SIMPLE" ${stage === "SIMPLE" ? "selected" : ""}>簡易登録（売上高と当期純利益の2項目だけ）</option>
          <option value="STANDARD" ${stage === "STANDARD" ? "selected" : ""}>標準登録（17項目・要因の分析ができます）</option>
        </select>
      </div>

      <div id="stage-simple" ${stage === "SIMPLE" ? "" : "hidden"}>
        <div id="aggregate-candidate"></div>
        ${simpleFields}
        <p class="note">簡易登録では、売上高と当期純利益の推移・比較だけが表示されます。内訳や要因は表示されません。</p>
      </div>

      <div id="stage-standard" ${stage === "STANDARD" ? "" : "hidden"}>
        ${standardFields}
        ${optionalFields}
        <h3>自動計算（入力すると自動で計算されます）</h3>
        <div class="auto-calc-box" id="annual-auto"></div>
      </div>

      <details class="optional-section">
        <summary>貸借対照表（B/S）を登録する（任意）</summary>
        <p class="note">登録しなくても、年次登録・業績の表示・レビューは使えます。初版ではB/Sを使った分析表示は行いません。金額の単位は「${unitLabel}」です。</p>
        ${bsInputFields}
        <h3>自動計算</h3>
        <div class="auto-calc-box" id="bs-auto"></div>
      </details>

      <details class="optional-section">
        <summary>借入の年間返済額を登録する（任意）</summary>
        <p class="note">その期の1年間に返す元金と利息の合計です。金融機関の返済予定表や、通帳の返済実績の金額を入れてください。登録すると、自動業績分析に「借入返済の見通し」が表示されます。登録しなくても、年次登録は保存できます。金額の単位は「${unitLabel}」です。</p>
        <div class="field" data-code="annualRepayment">
          <label for="in-repayment">年間返済額<span class="hint">借入が複数ある場合は、すべての借入の合計額</span></label>
          <input type="number" inputmode="decimal" id="in-repayment"
                 value="${esc(fromYen(period?.annualRepayment ?? null, unit))}">
        </div>
      </details>

      <div id="annual-errors"></div>
      <div class="btn-row">
        <button type="submit" class="btn btn--primary">保存する</button>
        <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">戻る</a>
      </div>
    </form>
    ${isNew ? "" : `
    <div class="card danger-zone">
      <h3 style="margin-top:0">この期の登録を削除する</h3>
      <p class="note">「${esc(period.displayName)}」の年次登録を削除します。${period.goal ? "この期の目標設定も一緒に消えます。" : ""}削除すると元に戻せません（JSONのバックアップがある場合だけ、読み込みで戻せます）。</p>
      <div class="btn-row">
        <button type="button" class="btn" id="delete-period-btn">この期を削除する</button>
      </div>
      <div id="delete-period-confirm" hidden>
        <div class="error-box">
          本当に削除しますか。
          <div class="btn-row" style="margin-top:0.5rem">
            <button type="button" class="btn btn--danger" id="delete-period-confirm-btn">削除する</button>
          </div>
        </div>
      </div>
    </div>`}`;
}

function readAmounts(container, codes, unit) {
  const out = {};
  for (const code of codes) {
    const input = container.querySelector(`[data-amount="${code}"]`);
    const parsed = parseAmountInput(input?.value ?? "");
    out[code] = parsed === null ? null : toYen(parsed, unit);
  }
  return out;
}

function renderAutoBox(el, codes, figures) {
  if (!el) return;
  el.innerHTML = codes.map((code) => `
    <div class="row">
      <span class="name">${esc(fieldLabel(code))}${fieldHint(code) ? `<span class="hint">${esc(fieldHint(code))}</span>` : ""}</span>
      <span>${formatYen(figures[code])}</span>
    </div>`).join("");
}

export function mountAnnual(el, { store, company, period, navigate }) {
  const unit = company.amountInputUnit;
  const form = el.querySelector("#annual-form");
  const stageSelect = el.querySelector("#f-stage");
  const simpleSection = el.querySelector("#stage-simple");
  const standardSection = el.querySelector("#stage-standard");
  const startInput = el.querySelector("#f-start");
  const endInput = el.querySelector("#f-end");

  const currentStage = () => stageSelect.value;

  function refreshAuto() {
    const values = readAmounts(standardSection, [...STANDARD_INPUT_CODES, ...STANDARD_OPTIONAL_CODES], unit);
    const figures = getAnnualFigures({ stage: "STANDARD", values });
    renderAutoBox(el.querySelector("#annual-auto"), ANNUAL_AUTO_CODES, figures);
    const bsCodes = BS_FIELDS.filter((f) => !f.auto).map((f) => f.id);
    const bsValues = readAmounts(form, bsCodes, unit);
    const bsFigures = getBSFigures(bsValues);
    renderAutoBox(el.querySelector("#bs-auto"), BS_FIELDS.filter((f) => f.auto).map((f) => f.id), bsFigures);
  }

  // 月次12か月が対象期間内にそろっている場合の、簡易年次候補（仕様書 5.2）
  function refreshCandidate() {
    const box = el.querySelector("#aggregate-candidate");
    if (!box) return;
    box.innerHTML = "";
    if (currentStage() !== "SIMPLE" || !startInput.value || !endInput.value) return;
    const startYm = startInput.value.slice(0, 7);
    const endYm = endInput.value.slice(0, 7);
    for (const key of listFiscalKeys(company)) {
      const months = fiscalPeriodMonths(key, company.closingMonth);
      if (!months.every((ym) => ym >= startYm && ym <= endYm)) continue;
      const agg = buildMonthlyAggregate(company, key);
      if (!agg) continue;
      box.innerHTML = `
        <div class="note-box">
          この期間には月次が12か月そろっています。月次の合計を簡易登録の候補として使えます。<br>
          売上高：${formatYen(agg.sales)} ／ 当期純利益：${formatYen(agg.netIncome)}<br>
          <button type="button" class="btn btn--small" id="adopt-aggregate" style="margin-top:0.4rem">この金額を取り込む</button>
        </div>`;
      box.querySelector("#adopt-aggregate").addEventListener("click", () => {
        simpleSection.querySelector('[data-amount="PL001"]').value = fromYen(agg.sales, unit);
        simpleSection.querySelector('[data-amount="PL025"]').value = fromYen(agg.netIncome, unit);
      });
      break;
    }
  }

  function refreshStage() {
    simpleSection.hidden = currentStage() !== "SIMPLE";
    standardSection.hidden = currentStage() !== "STANDARD";
    refreshCandidate();
  }

  const deletePeriodBtn = el.querySelector("#delete-period-btn");
  if (deletePeriodBtn && period) {
    const confirmBox = el.querySelector("#delete-period-confirm");
    deletePeriodBtn.addEventListener("click", () => {
      confirmBox.hidden = false;
      // 確認ボックスはページ最下部に開くため、見える位置までスクロールして知らせる。
      confirmBox.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });
    el.querySelector("#delete-period-confirm-btn")?.addEventListener("click", () => {
      store.commit((draft) => {
        const target = draft.companies.find((c) => c.id === company.id);
        if (target) removeAnnualPeriod(target, period.id);
      });
      navigate(ROUTES.HOME, { company: company.id });
    });
  }

  form.addEventListener("input", () => { refreshAuto(); });
  stageSelect.addEventListener("change", refreshStage);
  startInput.addEventListener("change", refreshCandidate);
  endInput.addEventListener("change", refreshCandidate);
  refreshAuto();
  refreshStage();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const stage = currentStage();
    const values = stage === "SIMPLE"
      ? readAmounts(simpleSection, SIMPLE_INPUT_CODES, unit)
      : readAmounts(standardSection, [...STANDARD_INPUT_CODES, ...STANDARD_OPTIONAL_CODES], unit);
    if (stage === "STANDARD" && values.PL009 === null) delete values.PL009;

    const bsCodes = BS_FIELDS.filter((f) => !f.auto).map((f) => f.id);
    const bsRead = readAmounts(form, bsCodes, unit);
    const bsValues = Object.values(bsRead).every((v) => v === null) ? null : bsRead;

    const repaymentParsed = parseAmountInput(el.querySelector("#in-repayment")?.value ?? "");
    const annualRepayment = repaymentParsed === null ? null : toYen(repaymentParsed, unit);

    const candidate = createAnnualPeriod({
      id: period?.id ?? undefined,
      startDate: startInput.value,
      endDate: endInput.value,
      displayName: el.querySelector("#f-display").value.trim() || defaultPeriodDisplayName(endInput.value),
      stage,
      values,
      bsValues,
      annualRepayment,
      // 編集保存で期を作り直すため、設定済みの目標は引き継ぐ（引き継がないと目標が消える）。
      goal: period?.goal ?? null
    });
    // 新規作成時は schema 側でIDが採番される。編集時は既存IDを維持する。
    if (period?.id) candidate.id = period.id;

    const errors = validateAnnualRegistration(company, candidate, { excludePeriodId: period?.id ?? null });
    const errorsEl = el.querySelector("#annual-errors");
    form.querySelectorAll(".field--invalid").forEach((n) => n.classList.remove("field--invalid"));
    if (errors.length) {
      errorsEl.innerHTML = `<div class="error-box"><strong>保存できませんでした。</strong><ul>${errors.map((e) => `<li>${esc(e.message)}</li>`).join("")}</ul></div>`;
      for (const e of errors) {
        form.querySelectorAll(`[data-code="${e.field}"]`).forEach((n) => n.classList.add("field--invalid"));
      }
      errorsEl.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    store.commit((draft) => {
      const target = draft.companies.find((c) => c.id === company.id);
      const idx = target.annualPeriods.findIndex((p) => p.id === candidate.id);
      if (idx >= 0) target.annualPeriods[idx] = candidate;
      else target.annualPeriods.push(candidate);
    });
    navigate(ROUTES.HOME, { company: company.id });
  });
}
