import { AMOUNT_INPUT_UNIT_LABELS } from "../config/constants.js";
import {
  MONTHLY_AUTO_CODES,
  MONTHLY_FIELDS,
  MONTHLY_INPUT_CODES,
  fieldHint,
  fieldLabel
} from "../data/fields.js";
import { createMonthlyRecord } from "../data/schema.js";
import { removeMonthlyRecord } from "../core/manage.js";
import { findMonthlyRecord, fiscalPeriodKey, getMonthlyFigures } from "../core/calc.js";
import { validateMonthlyRegistration } from "../core/validate.js";
import { esc, formatYen, formatYearMonth, fromYen, parseAmountInput, toYen } from "../components/dom.js";
import { ROUTES, buildHash } from "../navigation/router.js";

export function renderMonthly({ company, yearMonth, record, link }) {
  const unit = company.amountInputUnit;
  const unitLabel = AMOUNT_INPUT_UNIT_LABELS[unit];
  const values = record?.values ?? {};
  const fields = MONTHLY_FIELDS.map((f) => `
    <div class="field" data-code="${f.id}">
      <label for="in-${f.id}">${esc(f.label)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</label>
      <input type="number" inputmode="decimal" id="in-${f.id}" data-amount="${f.id}"
             value="${esc(fromYen(values[f.id] ?? null, unit))}">
    </div>`).join("");

  return `
    <div class="page-head">
      <p class="crumb"><a href="${link(ROUTES.HOME, { company: company.id })}">${esc(company.name)}</a></p>
      <h1>月次登録${record ? "（登録済みの月）" : ""}</h1>
      <p class="note">月の締めが終わったあと、月1回の登録を基本とします。登録は1か月分ずつ行います。金額の入力単位は「${unitLabel}」です。</p>
    </div>
    <form id="monthly-form" class="card" novalidate>
      <div class="field" data-code="yearMonth">
        <label for="f-ym">対象年月</label>
        <input type="month" id="f-ym" value="${esc(yearMonth ?? "")}">
        ${yearMonth ? `<p class="note">この月は「${esc(fiscalPeriodKey(yearMonth, company.closingMonth))}」の期に含まれます。</p>` : ""}
      </div>
      ${fields}
      <h3>自動計算（入力すると自動で計算されます）</h3>
      <div class="auto-calc-box" id="monthly-auto"></div>
      <div id="monthly-errors"></div>
      <div class="btn-row">
        <button type="submit" class="btn btn--primary">保存する</button>
        <a class="btn" href="${link(ROUTES.HOME, { company: company.id })}">戻る</a>
      </div>
    </form>
    ${record ? `
    <div class="card danger-zone">
      <h3 style="margin-top:0">この月の記録を削除する</h3>
      <p class="note">${formatYearMonth(record.yearMonth)}の月次記録を削除します。削除すると元に戻せません（JSONのバックアップがある場合だけ、読み込みで戻せます）。</p>
      <div class="btn-row">
        <button type="button" class="btn" id="delete-monthly-btn">この月を削除する</button>
      </div>
      <div id="delete-monthly-confirm" hidden>
        <div class="error-box">
          本当に削除しますか。
          <div class="btn-row" style="margin-top:0.5rem">
            <button type="button" class="btn btn--danger" id="delete-monthly-confirm-btn">削除する</button>
          </div>
        </div>
      </div>
    </div>` : ""}`;
}

export function mountMonthly(el, { store, company, navigate }) {
  const unit = company.amountInputUnit;
  const form = el.querySelector("#monthly-form");
  const ymInput = el.querySelector("#f-ym");

  function readValues() {
    const out = {};
    for (const code of MONTHLY_INPUT_CODES) {
      const input = form.querySelector(`[data-amount="${code}"]`);
      const parsed = parseAmountInput(input?.value ?? "");
      out[code] = parsed === null ? null : toYen(parsed, unit);
    }
    return out;
  }

  function refreshAuto() {
    const figures = getMonthlyFigures({ values: readValues() });
    el.querySelector("#monthly-auto").innerHTML = MONTHLY_AUTO_CODES.map((code) => `
      <div class="row">
        <span class="name">${esc(fieldLabel(code))}${fieldHint(code) ? `<span class="hint">${esc(fieldHint(code))}</span>` : ""}</span>
        <span>${formatYen(figures[code])}</span>
      </div>`).join("");
  }

  ymInput.addEventListener("change", () => {
    const ym = ymInput.value;
    if (!ym) return;
    // 既存の月を選んだ場合は、その月の編集として開き直す
    const existing = findMonthlyRecord(store.getCompany(company.id), ym);
    const currentYm = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("ym");
    if (existing && currentYm !== ym) {
      window.location.hash = buildHash(ROUTES.MONTHLY, { company: company.id, ym });
    } else {
      navigate(ROUTES.MONTHLY, { company: company.id, ym });
    }
  });

  const deleteMonthlyBtn = el.querySelector("#delete-monthly-btn");
  if (deleteMonthlyBtn) {
    const confirmBox = el.querySelector("#delete-monthly-confirm");
    deleteMonthlyBtn.addEventListener("click", () => { confirmBox.hidden = false; });
    el.querySelector("#delete-monthly-confirm-btn")?.addEventListener("click", () => {
      const ym = ymInput.value;
      const snapshot = store.getCompany(company.id);
      const existing = ym ? findMonthlyRecord(snapshot, ym) : null;
      if (!existing) return;
      store.commit((draft) => {
        const target = draft.companies.find((c) => c.id === company.id);
        if (target) removeMonthlyRecord(target, existing.id);
      });
      navigate(ROUTES.HOME, { company: company.id });
    });
  }

  form.addEventListener("input", refreshAuto);
  refreshAuto();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ym = ymInput.value;
    const snapshot = store.getCompany(company.id);
    const existing = ym ? findMonthlyRecord(snapshot, ym) : null;
    const candidate = createMonthlyRecord({
      id: existing?.id ?? undefined,
      yearMonth: ym,
      values: readValues()
    });
    if (existing?.id) candidate.id = existing.id;

    const errors = validateMonthlyRegistration(snapshot, candidate, { excludeRecordId: existing?.id ?? null });
    const errorsEl = el.querySelector("#monthly-errors");
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
      const idx = target.monthlyRecords.findIndex((r) => r.id === candidate.id);
      if (idx >= 0) target.monthlyRecords[idx] = candidate;
      else target.monthlyRecords.push(candidate);
    });
    navigate(ROUTES.HOME, { company: company.id });
  });
}
