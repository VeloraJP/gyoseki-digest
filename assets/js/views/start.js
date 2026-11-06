import { TAX_ACCOUNTING_BASIS_LABELS } from "../config/constants.js";
import { esc } from "../components/dom.js";
import { ROUTES } from "../navigation/router.js";

export function renderStart({ data, link }) {
  const companies = data.companies ?? [];
  const cards = companies.map((company) => `
    <div class="card company-card">
      <div>
        <div class="company-name">${esc(company.name)}</div>
        <div class="company-meta">${company.closingMonth}月決算 ／ ${esc(TAX_ACCOUNTING_BASIS_LABELS[company.taxAccountingBasis] ?? "")} ／ 年次 ${company.annualPeriods.length}件 ・ 月次 ${company.monthlyRecords.length}件</div>
      </div>
      <div class="btn-row">
        <a class="btn btn--primary" href="${link(ROUTES.HOME, { company: company.id })}">開く</a>
        <a class="btn" href="${link(ROUTES.SETUP, { company: company.id })}">設定</a>
      </div>
    </div>`).join("");

  return `
    <div class="page-head">
      <h1>会社を選んでください</h1>
      <p class="note">登録した決算と月次の数字から、「結局いくら儲かるのか」と「前と比べてどう変わったか」を自動でまとめます。</p>
    </div>
    ${companies.length === 0
      ? `<div class="card">
           <p>まだ会社が登録されていません。まず会社を追加してください。業績の数字は、次の画面では求めません。</p>
         </div>`
      : `<div class="company-list">${cards}</div>`}
    <div class="btn-row">
      <a class="btn btn--primary" href="${link(ROUTES.SETUP)}">会社を追加する</a>
      <a class="btn" href="${link(ROUTES.DATA)}">データ管理（バックアップ・復元）</a>
    </div>
    <div class="note-box">
      データはこの端末の中にだけ保存されます。サーバーへ送信されることはありません。
    </div>`;
}
