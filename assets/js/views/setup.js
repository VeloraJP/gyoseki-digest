import {
  AMOUNT_INPUT_UNIT_LABELS,
  AMOUNT_INPUT_UNITS,
  TAX_ACCOUNTING_BASIS,
  TAX_ACCOUNTING_BASIS_LABELS
} from "../config/constants.js";
import { esc } from "../components/dom.js";
import { ROUTES } from "../navigation/router.js";
import { createCompany } from "../data/schema.js";
import { removeCompany } from "../core/manage.js";

export function renderSetup({ params, company, link }) {
  const isNew = !company;
  const current = company ?? { name: "", closingMonth: 3, taxAccountingBasis: TAX_ACCOUNTING_BASIS.EXCLUDED, amountInputUnit: AMOUNT_INPUT_UNITS.YEN };
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}" ${m === current.closingMonth ? "selected" : ""}>${m}月</option>`).join("");
  const unitOptions = Object.entries(AMOUNT_INPUT_UNIT_LABELS)
    .map(([value, label]) => `<option value="${value}" ${value === current.amountInputUnit ? "selected" : ""}>${label}</option>`).join("");

  return `
    <div class="page-head">
      <p class="crumb"><a href="${link(ROUTES.START)}">会社選択</a></p>
      <h1>${isNew ? "会社の初回設定" : "会社の設定"}</h1>
      <p class="note">ここでは会社の基本設定だけを行います。業績の数字は求めません。</p>
    </div>
    <form id="setup-form" class="card">
      <div class="field" data-field="name">
        <label for="f-name">会社名</label>
        <input type="text" id="f-name" name="name" value="${esc(current.name)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="f-closing">決算月<span class="hint">決算を行う月です。月次の数字をどの期に含めるかの基準にもなります。</span></label>
        <select id="f-closing" name="closingMonth">${monthOptions}</select>
      </div>
      <div class="field">
        <label>税込／税抜<span class="hint">登録する金額が、消費税を含む金額かどうかの区分です。</span></label>
        <div class="radio-row">
          <label><input type="radio" name="taxBasis" value="${TAX_ACCOUNTING_BASIS.INCLUDED}" ${current.taxAccountingBasis === TAX_ACCOUNTING_BASIS.INCLUDED ? "checked" : ""}> ${TAX_ACCOUNTING_BASIS_LABELS[TAX_ACCOUNTING_BASIS.INCLUDED]}</label>
          <label><input type="radio" name="taxBasis" value="${TAX_ACCOUNTING_BASIS.EXCLUDED}" ${current.taxAccountingBasis === TAX_ACCOUNTING_BASIS.EXCLUDED ? "checked" : ""}> ${TAX_ACCOUNTING_BASIS_LABELS[TAX_ACCOUNTING_BASIS.EXCLUDED]}</label>
        </div>
      </div>
      <div class="field">
        <label for="f-unit">金額入力単位<span class="hint">金額を入力するときの単位です。保存される金額は円単位で統一されます。</span></label>
        <select id="f-unit" name="amountInputUnit">${unitOptions}</select>
      </div>
      ${isNew ? "" : `<p class="note">決算月を変更すると、月次の数字が属する期の割り当てと累計の表示は、新しい決算月で計算し直されます。月次の金額そのものは変わりません。</p>`}
      <div id="setup-errors"></div>
      <div class="btn-row">
        <button type="submit" class="btn btn--primary">保存する</button>
        <a class="btn" href="${isNew ? link(ROUTES.START) : link(ROUTES.HOME, { company: company.id })}">戻る</a>
      </div>
    </form>
    ${isNew ? "" : `
    <div class="card danger-zone">
      <h3 style="margin-top:0">この会社を削除する</h3>
      <p class="note">「${esc(current.name)}」と、その年次登録（${company.annualPeriods.length}件）・月次記録（${company.monthlyRecords.length}件）・目標設定をすべて削除します。削除すると元に戻せません（JSONのバックアップがある場合だけ、読み込みで戻せます）。</p>
      <div class="btn-row">
        <button type="button" class="btn" id="delete-company-btn">この会社を削除する</button>
      </div>
      <div id="delete-company-confirm" hidden>
        <div class="error-box">
          本当に削除しますか。
          <div class="btn-row" style="margin-top:0.5rem">
            <button type="button" class="btn btn--danger" id="delete-company-confirm-btn">削除する</button>
          </div>
        </div>
      </div>
    </div>`}`;
}

export function mountSetup(el, { store, params, navigate }) {
  const form = el.querySelector("#setup-form");
  const existingId = params.company ?? null;

  const deleteCompanyBtn = el.querySelector("#delete-company-btn");
  if (deleteCompanyBtn && existingId) {
    const confirmBox = el.querySelector("#delete-company-confirm");
    deleteCompanyBtn.addEventListener("click", () => { confirmBox.hidden = false; });
    el.querySelector("#delete-company-confirm-btn")?.addEventListener("click", () => {
      store.commit((draft) => { removeCompany(draft, existingId); });
      navigate(ROUTES.START);
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const errorsEl = el.querySelector("#setup-errors");
    if (name === "") {
      errorsEl.innerHTML = `<div class="error-box">会社名を入力してください。</div>`;
      form.querySelector('[data-field="name"]').classList.add("field--invalid");
      return;
    }
    const values = {
      name,
      closingMonth: Number(fd.get("closingMonth")),
      taxAccountingBasis: String(fd.get("taxBasis")),
      amountInputUnit: String(fd.get("amountInputUnit"))
    };
    if (existingId) {
      store.commit((draft) => {
        const target = draft.companies.find((c) => c.id === existingId);
        if (target) Object.assign(target, values);
      });
      navigate(ROUTES.HOME, { company: existingId });
    } else {
      const company = createCompany(values);
      store.commit((draft) => { draft.companies.push(company); });
      navigate(ROUTES.HOME, { company: company.id });
    }
  });
}
