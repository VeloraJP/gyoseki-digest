import {
  AMOUNT_INPUT_UNIT_LABELS,
  REGISTRATION_STAGES,
  TAX_ACCOUNTING_BASIS_LABELS
} from "../config/constants.js";
import { backButtonHtml, esc } from "../components/dom.js";
import { icon, pageIcon } from "../components/icons.js";
import { ROUTES, buildHash } from "../navigation/router.js";
import {
  DataImportError,
  exportPersistentData,
  importPersistentData,
  parseImportedData
} from "../storage/import-export.js";
import {
  convertLegacyToolData,
  parseLegacyToolData
} from "../storage/migration.js";

export function renderData({ link }) {
  return `
    <div class="page-head">
      ${backButtonHtml({ topHref: link(ROUTES.START), topLabel: "会社選択へ", topIcon: "building" })}
      <p class="crumb"><a href="${link(ROUTES.START)}">会社選択</a></p>
      <h1>${pageIcon("database")}データ管理</h1>
    </div>
    <div class="note-box">
      データはこの端末の中にだけ保存されています。サーバーへ送信されることはありません。<br>
      端末を替えるときや、万一に備えるときは、JSONファイルで書き出して保管してください。
    </div>

    <div class="card">
      <h2 style="margin-top:0">${icon("download")} バックアップ（書き出し）</h2>
      <p>会社・設定・年次登録・月次登録・貸借対照表の任意登録を、1つのJSONファイルに書き出します。</p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" id="export-btn">JSONを書き出す</button>
      </div>
      <div id="export-message"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">${icon("upload")} 復元（読み込み）</h2>
      <p>業績ダイジェストで書き出したJSONファイルを読み込みます。読み込むと、<strong>現在のデータはファイルの内容に置き換わります</strong>（部分的に合体させることはできません）。ほかのツールのJSONは読み込めません。</p>
      <div class="field">
        <label for="import-file">JSONファイルを選ぶ</label>
        <input type="file" id="import-file" accept=".json,application/json">
      </div>
      <div id="import-area"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">${icon("swap")} ほかのツールからの移行（business-tool2-2）</h2>
      <p>business-tool2-2で書き出したJSONから、年次登録（決算の数字）を読み取り、<strong>新しい会社として追加</strong>します。現在のデータは置き換わりません。変換の内容を確認してから取り込みます。本ツールのバックアップJSONは、上の「復元（読み込み）」で読み込んでください。</p>
      <div class="field">
        <label for="migration-file">business-tool2-2のJSONファイルを選ぶ</label>
        <input type="file" id="migration-file" accept=".json,application/json">
      </div>
      <div id="migration-area"></div>
    </div>`;
}

export function mountData(el, { store, repository }) {
  el.querySelector("#export-btn").addEventListener("click", () => {
    const message = el.querySelector("#export-message");
    try {
      const text = exportPersistentData(store.getSnapshot());
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date();
      const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `gyoseki-digest-backup-${ymd}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      message.innerHTML = `<p class="note">書き出しました。</p>`;
    } catch (error) {
      message.innerHTML = `<div class="error-box">${esc(error.message ?? "書き出しに失敗しました。")}</div>`;
    }
  });

  const fileInput = el.querySelector("#import-file");
  const area = el.querySelector("#import-area");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    area.innerHTML = "";
    if (!file) return;
    let parsed;
    try {
      const text = await file.text();
      parsed = parseImportedData(text, { byteLength: file.size });
    } catch (error) {
      const reason = error instanceof DataImportError ? error.message : "ファイルを読み込めませんでした。";
      area.innerHTML = `<div class="error-box">読み込めませんでした。${esc(reason)} 現在のデータは変更されていません。</div>`;
      return;
    }
    const companyCount = parsed.companies.length;
    const periodCount = parsed.companies.reduce((n, c) => n + c.annualPeriods.length, 0);
    const monthlyCount = parsed.companies.reduce((n, c) => n + c.monthlyRecords.length, 0);
    area.innerHTML = `
      <div class="note-box">
        読み込めるファイルです。会社 ${companyCount}件 ／ 年次 ${periodCount}件 ／ 月次 ${monthlyCount}件 が含まれています。<br>
        読み込むと現在のデータは置き換わります。よければ下のボタンを押してください。
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" id="import-confirm">現在のデータを置き換えて読み込む</button>
      </div>
      <div id="import-result"></div>`;
    area.querySelector("#import-confirm").addEventListener("click", () => {
      const result = el.querySelector("#import-result");
      try {
        const saved = importPersistentData({ text: JSON.stringify(parsed), repository });
        store.adoptSaved(saved);
        result.innerHTML = `<p class="note">読み込みました。<a href="#/start">会社選択へ戻る</a></p>`;
      } catch (error) {
        result.innerHTML = `<div class="error-box">${esc(error.message ?? "読み込みに失敗しました。")} 現在のデータは変更されていません。</div>`;
      }
    });
  });

  // business-tool2-2形式の移行。変換内容を確認し、明示操作で新しい会社として追加する。
  const migrationInput = el.querySelector("#migration-file");
  const migrationArea = el.querySelector("#migration-area");
  migrationInput.addEventListener("change", async () => {
    const file = migrationInput.files?.[0];
    migrationArea.innerHTML = "";
    if (!file) return;
    let legacy;
    let preview;
    try {
      const text = await file.text();
      legacy = parseLegacyToolData(text, { byteLength: file.size });
      preview = convertLegacyToolData(legacy, { companyName: "取り込んだ会社" });
    } catch (error) {
      const reason = error instanceof DataImportError ? error.message : "ファイルを読み込めませんでした。";
      migrationArea.innerHTML = `<div class="error-box">移行できませんでした。${esc(reason)} 現在のデータは変更されていません。</div>`;
      return;
    }
    const { summary } = preview;
    const periodRows = summary.periods.map((p) => `
      <li>
        <span>${esc(p.displayName || "（名称なし）")}（${esc(p.startDate)} 〜 ${esc(p.endDate)}）${p.hasBS ? "・貸借対照表あり" : ""}</span>
        <span>${p.imported
          ? (p.stage === REGISTRATION_STAGES.STANDARD ? "標準登録として取り込み" : "簡易登録として取り込み")
          : `取り込めません：${esc(p.reason ?? "")}`}</span>
      </li>`).join("");
    migrationArea.innerHTML = `
      <div class="note-box">
        変換の内容を確認してください。取り込むと、新しい会社として追加されます（現在のデータは置き換わりません）。
      </div>
      <div class="field" style="margin-top:0.8rem">
        <label for="migration-name">取り込む会社の名前</label>
        <input type="text" id="migration-name" value="取り込んだ会社" autocomplete="off">
      </div>
      <p class="note">会社の設定：決算月 ${summary.closingMonth}月 ／ ${esc(TAX_ACCOUNTING_BASIS_LABELS[summary.taxAccountingBasis] ?? "")} ／ 金額入力単位 ${esc(AMOUNT_INPUT_UNIT_LABELS[summary.amountInputUnit] ?? "")}（あとから設定画面で変更できます）</p>
      <h3>期の対応（${summary.periods.length}件中 ${summary.importedCount}件を取り込み）</h3>
      ${summary.periods.length ? `<ul class="list-rows">${periodRows}</ul>` : `<p class="note">元データに期がありません。</p>`}
      ${summary.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
      ${summary.importedCount > 0 ? `
      <div class="btn-row">
        <button type="button" class="btn btn--primary" id="migration-confirm">この内容で取り込む</button>
      </div>` : `<p class="note">取り込める期がないため、このファイルからは移行できません。</p>`}
      <div id="migration-result"></div>`;
    migrationArea.querySelector("#migration-confirm")?.addEventListener("click", () => {
      const result = el.querySelector("#migration-result");
      const name = migrationArea.querySelector("#migration-name").value.trim();
      if (name === "") {
        result.innerHTML = `<div class="error-box">会社の名前を入力してください。</div>`;
        return;
      }
      try {
        const { company } = convertLegacyToolData(legacy, { companyName: name });
        store.commit((draft) => { draft.companies.push(company); });
        result.innerHTML = `<p class="note">取り込みました。<a href="${buildHash(ROUTES.HOME, { company: company.id })}">取り込んだ会社を開く</a></p>`;
      } catch (error) {
        result.innerHTML = `<div class="error-box">${esc(error.message ?? "取り込みに失敗しました。")} 現在のデータは変更されていません。</div>`;
      }
    });
  });
}
