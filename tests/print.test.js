import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 1枚サマリーの印刷仕様（A4・余白・見出しの繰り返し・増減色の濃さ）を担保する。
// この環境では印刷PDFを実出力できないため、CSSと描画HTMLの静的検証で回帰を防ぐ。
// 実際の印刷の見え方は、受入時にiPhoneの印刷プレビューで確認する。
const printCss = readFileSync(new URL("../assets/css/print.css", import.meta.url), "utf8");
const componentsCss = readFileSync(new URL("../assets/css/components.css", import.meta.url), "utf8");
const summaryJs = readFileSync(new URL("../assets/js/views/summary.js", import.meta.url), "utf8");
const swJs = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const constantsJs = readFileSync(new URL("../assets/js/config/constants.js", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastOnWhite(hex) {
  const l = luminance(hexToRgb(hex));
  return (1.0 + 0.05) / (l + 0.05);
}
function printDiffColor(selector) {
  const m = printCss.match(new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{\\s*color:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `print.css に ${selector} の文字色指定がある`);
  return m[1];
}

test("印刷：@page でA4と余白（上20mm・下18mm・左右15mm）が指定されている", () => {
  assert.match(printCss, /@page\s*\{[^}]*size:\s*A4/);
  assert.match(printCss, /@page\s*\{[^}]*margin:\s*20mm 15mm 18mm 15mm/);
});

test("印刷：ページ番号が下部中央に出る", () => {
  assert.match(printCss, /@bottom-center\s*\{[^}]*content:\s*counter\(page\)/);
});

test("印刷：サマリーに印刷用見出し（会社名・対象期間・作成日時）が含まれる", () => {
  assert.match(summaryJs, /class="print-head print-only"/);
  assert.match(summaryJs, /class="print-title print-only"/);
  assert.match(summaryJs, /作成日時：/);
  assert.match(summaryJs, /1枚サマリー/);
});

test("印刷：印刷専用の見出しは画面では表示されない", () => {
  assert.match(componentsCss, /\.print-only\s*\{\s*display:\s*none/);
});

test("印刷：見出し帯が全ページに繰り返される（固定配置）", () => {
  assert.match(printCss, /\.print-head\s*\{[^}]*position:\s*fixed/);
});

test("印刷：表の見出し行が各ページに繰り返され、行の途中で割れない", () => {
  assert.match(printCss, /thead\s*\{\s*display:\s*table-header-group/);
  assert.match(printCss, /table\.data-table tr\s*\{\s*break-inside:\s*avoid/);
  assert.match(printCss, /\.table-wrap\s*\{[^}]*overflow:\s*visible/);
});

test("印刷：増減の色が白地でもコントラスト4.5:1以上で判別できる", () => {
  for (const selector of [".diff-up", ".diff-down", ".card--accent .diff-up", ".card--accent .diff-down"]) {
    const hex = printDiffColor(selector);
    const ratio = contrastOnWhite(hex);
    assert.ok(ratio >= 4.5, `${selector} ${hex} on 白 = ${ratio.toFixed(2)}`);
  }
  // 主役カードの増減色が地の色（inherit）に潰されていないこと
  assert.doesNotMatch(printCss, /\.card--accent \.diff-(up|down)\s*\{\s*color:\s*inherit/);
});

test("印刷：版数とService Workerのキャッシュ名が更新されている", () => {
  const appVersion = constantsJs.match(/APP_VERSION = "([^"]+)"/)[1];
  assert.equal(pkg.version, appVersion);
  assert.match(swJs, /const CACHE_NAME = 'gyoseki-digest-v11'/);
});
