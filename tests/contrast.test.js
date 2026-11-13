import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 濃色ヒーローカード上の文字が実際に読める色か、WCAGのコントラスト比で担保する。
// 実機で「補足文が緑に沈む」「白カードの項目名が白文字で見えない」が起きたための回帰テスト。
const tokensCss = readFileSync(new URL("../assets/css/tokens.css", import.meta.url), "utf8");
const componentsCss = readFileSync(new URL("../assets/css/components.css", import.meta.url), "utf8");

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
function contrastRatio(rgbA, rgbB) {
  const [l1, l2] = [luminance(rgbA), luminance(rgbB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
function compositeOver(fg, alpha, bg) {
  return fg.map((v, i) => Math.round(alpha * v + (1 - alpha) * bg[i]));
}
function tokenHex(name) {
  const m = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `${name} が tokens.css にある`);
  return m[1];
}
function heroStops() {
  const line = tokensCss.match(/--gradient-hero:[^;]+;/)[0];
  return [...line.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0]);
}
function accentColor(selector) {
  const m = componentsCss.match(new RegExp(`\\.card--accent ${selector}\\s*\\{\\s*color:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `.card--accent ${selector} の文字色指定がある`);
  return m[1];
}

const WHITE = [255, 255, 255];
const MIN = 4.5; // 小さい文字でも読める目安

test("コントラスト：ヒーローのラベル（白）が全グラデーション端で4.5:1以上", () => {
  for (const stop of heroStops()) {
    const ratio = contrastRatio(WHITE, hexToRgb(stop));
    assert.ok(ratio >= MIN, `白 on ${stop} = ${ratio.toFixed(2)}`);
  }
});

test("コントラスト：ヒーローの補足文（白90%）が全グラデーション端で4.5:1以上", () => {
  for (const stop of heroStops()) {
    const bg = hexToRgb(stop);
    const ratio = contrastRatio(compositeOver(WHITE, 0.9, bg), bg);
    assert.ok(ratio >= MIN, `白90% on ${stop} = ${ratio.toFixed(2)}`);
  }
});

test("コントラスト：ヒーロー上の増減色が全グラデーション端で4.5:1以上", () => {
  const up = hexToRgb(accentColor("\\.diff-up"));
  const down = hexToRgb(accentColor("\\.diff-down"));
  for (const stop of heroStops()) {
    const bg = hexToRgb(stop);
    assert.ok(contrastRatio(up, bg) >= MIN, `diff-up on ${stop} = ${contrastRatio(up, bg).toFixed(2)}`);
    assert.ok(contrastRatio(down, bg) >= MIN, `diff-down on ${stop} = ${contrastRatio(down, bg).toFixed(2)}`);
  }
});

test("コントラスト：白い小カードの項目名（ink）と補足（muted）が4.5:1以上", () => {
  assert.ok(contrastRatio(hexToRgb(tokenHex("--color-ink")), WHITE) >= MIN);
  assert.ok(contrastRatio(hexToRgb(tokenHex("--color-muted")), WHITE) >= MIN);
});

test("濃色カード内の上書き指定がそろっている（白カードの項目名・ヒーローの補足）", () => {
  // 白い小カード内の項目名を濃い文字に戻す指定
  assert.match(componentsCss, /\.card--accent \.kpi-item \.kpi-label\s*\{\s*color:\s*var\(--color-ink\)/);
  // .kpi-big 側の淡色指定より優先される、ヒーロー補足の指定
  assert.match(componentsCss, /\.card--accent \.kpi-big \.kpi-label \.hint/);
  assert.match(componentsCss, /\.card--accent \.kpi-big \.kpi-sub/);
});
