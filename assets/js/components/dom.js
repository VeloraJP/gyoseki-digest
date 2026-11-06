import { AMOUNT_INPUT_UNIT_FACTORS } from "../config/constants.js";

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 金額（円）の表示。null は「—」。
export function formatYen(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  return `${sign}${Math.abs(Math.round(value)).toLocaleString("ja-JP")}円`;
}

// 増減額の表示（符号つき）
export function formatDiff(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "±0円";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(value)).toLocaleString("ja-JP")}円`;
}

// 割合の表示（達成率・進捗率用、符号なし）。rate はパーセント値。null は「—」。
export function formatPercent(rate) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 10) / 10;
  return `${rounded.toLocaleString("ja-JP")}%`;
}

// 増減率の表示。rate はパーセント値（例：20 → 20%）。null は「—」。
export function formatRate(rate) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("ja-JP")}%`;
}

export function diffClass(amount) {
  if (typeof amount !== "number" || amount === 0) return "diff-flat";
  return amount > 0 ? "diff-up" : "diff-down";
}

// 入力単位 → 円への換算
export function toYen(inputValue, unit) {
  const factor = AMOUNT_INPUT_UNIT_FACTORS[unit] ?? 1;
  return Math.round(inputValue * factor);
}

// 円 → 入力単位での表示値
export function fromYen(yen, unit) {
  if (typeof yen !== "number") return "";
  const factor = AMOUNT_INPUT_UNIT_FACTORS[unit] ?? 1;
  const v = yen / factor;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

// 入力文字列を数値として解釈する。空欄は null（未入力と0を区別する）。
export function parseAmountInput(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[,\s、]/g, "").replace(/−/g, "-");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 各画面共通の「前のページへ戻る」ボタン。
// 実際の遷移（直前の画面／履歴がない場合は定位置）は app.js が data-back を拾って行う。
export function backButtonHtml() {
  return `<div class="btn-row" style="margin-top:0"><button type="button" class="btn" data-back>← 前のページへ戻る</button></div>`;
}

export function formatYearMonth(yearMonth) {
  if (!yearMonth) return "";
  const [y, m] = yearMonth.split("-");
  return `${y}年${Number(m)}月`;
}
