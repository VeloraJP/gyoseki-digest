import { esc } from "../components/dom.js";
import { ROUTES } from "../navigation/router.js";
import {
  DataImportError,
  exportPersistentData,
  importPersistentData,
  parseImportedData
} from "../storage/import-export.js";

export function renderData({ link }) {
  return `
    <div class="page-head">
      <p class="crumb"><a href="${link(ROUTES.START)}">会社選択</a></p>
      <h1>データ管理</h1>
    </div>
    <div class="note-box">
      データはこの端末の中にだけ保存されています。サーバーへ送信されることはありません。<br>
      端末を替えるときや、万一に備えるときは、JSONファイルで書き出して保管してください。
    </div>

    <div class="card">
      <h2 style="margin-top:0">バックアップ（書き出し）</h2>
      <p>会社・設定・年次登録・月次登録・貸借対照表の任意登録を、1つのJSONファイルに書き出します。</p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" id="export-btn">JSONを書き出す</button>
      </div>
      <div id="export-message"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">復元（読み込み）</h2>
      <p>業績ダイジェストで書き出したJSONファイルを読み込みます。読み込むと、<strong>現在のデータはファイルの内容に置き換わります</strong>（部分的に合体させることはできません）。ほかのツールのJSONは読み込めません。</p>
      <div class="field">
        <label for="import-file">JSONファイルを選ぶ</label>
        <input type="file" id="import-file" accept=".json,application/json">
      </div>
      <div id="import-area"></div>
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
}
