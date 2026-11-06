import test from "node:test";
import assert from "node:assert/strict";
import { buildHash } from "../assets/js/navigation/router.js";
import { renderStart } from "../assets/js/views/start.js";
import { renderHome } from "../assets/js/views/home.js";
import { renderAnnual } from "../assets/js/views/annual.js";
import { renderMonthly } from "../assets/js/views/monthly.js";
import { renderAnalysis } from "../assets/js/views/analysis.js";
import { renderReview } from "../assets/js/views/review.js";
import { renderData } from "../assets/js/views/data.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord, createPersistentData } from "../assets/js/data/schema.js";

const link = (route, params) => buildHash(route, params);

const STANDARD = {
  PL001: 110_000_000, PL002: 66_000_000, PL004: 6_000_000, PL005: 13_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_400_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 0, PL024: 1_800_000
};
const STANDARD_PREV = {
  PL001: 100_000_000, PL002: 60_000_000, PL004: 6_000_000, PL005: 12_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_000_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 200_000, PL024: 1_500_000
};

function sampleCompany() {
  const company = createCompany({ name: "サンプル商事", closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "STANDARD", values: { ...STANDARD_PREV }
  }));
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }
  }));
  const mv = { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 };
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-09", values: { ...mv, M007: 700_000 } }));
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-10", values: { ...mv } }));
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2025-10", values: { ...mv, M001: 9_000_000, M007: 500_000 } }));
  return company;
}

test("スタート画面に会社一覧が出る", () => {
  const data = createPersistentData();
  data.companies.push(sampleCompany());
  const html = renderStart({ data, link });
  assert.match(html, /サンプル商事/);
  assert.match(html, /会社を追加する/);
});

test("ホームに最新年次・最新月次の当期純利益が出る", () => {
  const company = sampleCompany();
  const html = renderHome({ company, link });
  // 標準登録の当期純利益： 税引前 = 経常( (110M-66M) - (21M+3.6M+0.6M+0.4M+0.3M+0.8M+0.5M+4.4M=31.6M → 営業12.4M) +0.1M-0.7M=11.8M ) → 純利益 11.8M-1.8M=10M
  assert.match(html, /10,000,000円/);
  assert.match(html, /800,000円/);
});

test("年次登録画面（新規）に簡易・標準の両セクションとB/S任意セクションがある", () => {
  const company = sampleCompany();
  const html = renderAnnual({ company, period: null, link });
  assert.match(html, /簡易登録/);
  assert.match(html, /標準登録/);
  assert.match(html, /貸借対照表（B\/S）を登録する（任意）/);
});

test("月次登録画面に7項目の入力欄がある（B/S欄はない）", () => {
  const company = sampleCompany();
  const record = company.monthlyRecords.find((r) => r.yearMonth === "2026-10");
  const html = renderMonthly({ company, yearMonth: "2026-10", record, link });
  for (const code of ["M001", "M002", "M003", "M004", "M005", "M006", "M007"]) {
    assert.match(html, new RegExp(`data-amount="${code}"`));
  }
  assert.ok(!html.includes("BS001"));
});

test("自動業績分析：標準登録同士では当期純利益の主表示と要因リストが出る", () => {
  const company = sampleCompany();
  const html = renderAnalysis({ company, link });
  assert.match(html, /当期純利益/);
  assert.match(html, /10,000,000円/);
  assert.match(html, /増減の大きい項目/);
  assert.match(html, /売上高/);
});

test("自動業績分析：簡易登録同士では要因リストが出ない", () => {
  const company = createCompany({ name: "簡易のみ", closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "SIMPLE", values: { PL001: 80_000_000, PL025: 3_000_000 }
  }));
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 90_000_000, PL025: 4_000_000 }
  }));
  const html = renderAnalysis({ company, link });
  assert.match(html, /4,000,000円/);
  assert.ok(!html.includes("増減の大きい項目"));
});

test("自動業績分析：登録がなければ登録への案内が出る", () => {
  const company = createCompany({ name: "空の会社", closingMonth: 3 });
  const html = renderAnalysis({ company, link });
  assert.match(html, /まだ表示できる登録がありません/);
});

test("年度レビュー：標準登録では全項目、前年度比較が出る", () => {
  const company = sampleCompany();
  const target = company.annualPeriods[1];
  const html = renderReview({ company, params: { tab: "annual", period: target.id }, link });
  assert.match(html, /経常利益/);
  assert.match(html, /前年度（2025年3月期）/);
});

test("月次レビュー：前月・前年同月比較と累計、未登録月の注記が出る", () => {
  const company = sampleCompany();
  const html = renderReview({ company, params: { tab: "monthly", ym: "2026-10" }, link });
  assert.match(html, /前月/);
  assert.match(html, /前年同月/);
  assert.match(html, /当年度累計/);
  // 2026-04〜2026-10 のうち登録は2026-09,10のみ → 未登録月の注記
  assert.match(html, /未登録の月/);
});

test("データ管理画面に書き出し・読み込みがある", () => {
  const html = renderData({ link });
  assert.match(html, /JSONを書き出す/);
  assert.match(html, /復元（読み込み）/);
});
