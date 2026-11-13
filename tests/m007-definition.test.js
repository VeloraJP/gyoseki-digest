import test from "node:test";
import assert from "node:assert/strict";
import { buildHash } from "../assets/js/navigation/router.js";
import { renderHome } from "../assets/js/views/home.js";
import { renderMonthly } from "../assets/js/views/monthly.js";
import { renderAnalysis } from "../assets/js/views/analysis.js";
import { renderReview } from "../assets/js/views/review.js";
import { renderGoal } from "../assets/js/views/goal.js";
import { renderSummary } from "../assets/js/views/summary.js";
import { fieldHint } from "../assets/js/data/fields.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord } from "../assets/js/data/schema.js";

const link = (route, params) => buildHash(route, params);

// M007の定義確定（2026-11-08）：月次試算表の当期純利益をそのまま登録し、法人税等は見込み計上しない。
// 画面では「暫定」表記をやめ、税金計算前の金額である旨の注記を出す。
const TAX_NOTE = /月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます/;

const MV = { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 };

const STANDARD = {
  PL001: 110_000_000, PL002: 66_000_000, PL004: 6_000_000, PL005: 13_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_400_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 0, PL024: 1_800_000
};

test("M007定義：登録画面の説明文が確定した定義に合っている", () => {
  assert.match(fieldHint("M007"), /月次試算表の当期純利益をそのまま/);
  assert.match(fieldHint("M007"), /法人税等は見込み計上しません/);
  const company = createCompany({ name: "定義確認", closingMonth: 3 });
  const html = renderMonthly({ company, yearMonth: "2026-04", record: null, link });
  assert.match(html, /法人税等は見込み計上しません/);
  assert.doesNotMatch(html, /暫定/);
});

test("M007定義：月次レビューに税金計算前の注記が出て、「暫定」は出ない", () => {
  const company = createCompany({ name: "レビュー確認", closingMonth: 3 });
  for (const ym of ["2026-04", "2026-05", "2026-06"]) {
    company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...MV } }));
  }
  const html = renderReview({ company, params: { tab: "monthly", ym: "2026-06" }, link });
  assert.match(html, /月次の当期純利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます/);
  assert.match(html, TAX_NOTE);
  assert.doesNotMatch(html, /暫定/);
});

test("M007定義：目標と進捗の当期純利益の累計に税金計算前の注記が出る", () => {
  const company = createCompany({ name: "進捗確認", closingMonth: 3 });
  const period = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }, goal: { profitCode: "PL025", amount: 10_000_000 }
  });
  company.annualPeriods.push(period);
  for (const ym of ["2026-04", "2026-05", "2026-06"]) {
    company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...MV } }));
  }
  const html = renderGoal({ company, params: { period: period.id }, link });
  assert.match(html, /当期純利益の累計/);
  assert.match(html, TAX_NOTE);
  assert.doesNotMatch(html, /暫定/);
});

test("M007定義：月次集計の分析・サマリー・ホームに税金計算前の注記が出る", () => {
  const company = createCompany({ name: "月次集計のみ", closingMonth: 3 });
  const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  for (const ym of months) {
    company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...MV } }));
  }
  const analysisHtml = renderAnalysis({ company, link });
  assert.match(analysisHtml, /当期純利益は月次12か月分の合計です。月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます/);
  assert.doesNotMatch(analysisHtml, /暫定/);

  const summaryHtml = renderSummary({ company, link });
  assert.match(summaryHtml, /当期純利益は月次12か月分の合計です。月次の利益は税金計算前の金額で、年次の確定値とは税金の分だけ差が出ます/);
  assert.doesNotMatch(summaryHtml, /暫定/);

  const homeHtml = renderHome({ company, link });
  assert.match(homeHtml, TAX_NOTE);
  assert.doesNotMatch(homeHtml, /暫定/);
});

test("M007定義：年次登録だけの会社では月次向けの注記は出ない", () => {
  const company = createCompany({ name: "年次だけ", closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }
  }));
  const summaryHtml = renderSummary({ company, link });
  assert.doesNotMatch(summaryHtml, /税金の分だけ差が出ます/);
  const analysisHtml = renderAnalysis({ company, link });
  assert.doesNotMatch(analysisHtml, /税金の分だけ差が出ます/);
});
