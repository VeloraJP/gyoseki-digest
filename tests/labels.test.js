import test from "node:test";
import assert from "node:assert/strict";
import { buildHash } from "../assets/js/navigation/router.js";
import { renderHome } from "../assets/js/views/home.js";
import { renderAnalysis } from "../assets/js/views/analysis.js";
import { renderGoal } from "../assets/js/views/goal.js";
import { renderSummary } from "../assets/js/views/summary.js";
import { createAnnualPeriod, createCompany } from "../assets/js/data/schema.js";

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
  return company;
}

// 金額カードには「項目名の見出し＋金額＋説明」がそろっていることを、
// 実機で項目名が見えなかった画面について確認する（見出しがHTMLにあることの担保）。
test("項目名の見出し：業績を見る（ヒーローと白い小カード）", () => {
  const html = renderAnalysis({ company: sampleCompany(), link });
  assert.match(html, /<div class="kpi-label">当期純利益<span class="hint">税金などを引いたあと、最終的に残る利益<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">売上高<span class="hint">商品やサービスを売った金額の合計<\/span><\/div>/);
  // 濃色カード内の白い小カード（営業利益・経常利益）にも項目名がある
  assert.match(html, /<div class="kpi-label">営業利益<span class="note">（本業で得た利益）<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">経常利益<span class="note">（本業以外も含めた通常の利益）<\/span><\/div>/);
});

test("項目名の見出し：目標と進捗（3つの金額カード）", () => {
  const company = sampleCompany();
  const period = company.annualPeriods[1];
  period.goal = { profitCode: "PL017", amount: 16_000_000 };
  const html = renderGoal({ company, params: { period: period.id }, link });
  assert.match(html, /<div class="kpi-label">必要な売上高<\/div>/);
  assert.match(html, /<div class="kpi-label">あといくら必要か<\/div>/);
  assert.match(html, /<div class="kpi-label">達成率<\/div>/);
  // 説明文も項目名の下に添えられている
  assert.match(html, /目標の利益を出すために必要な、1年間の売上の合計/);
  assert.match(html, /現在の売上 ÷ 必要な売上高/);
});

test("項目名の見出し：1枚サマリー（ヒーローと要点カード）", () => {
  const company = sampleCompany();
  company.annualPeriods[1].goal = { profitCode: "PL017", amount: 16_000_000 };
  const html = renderSummary({ company, link });
  assert.match(html, /<div class="kpi-label">当期純利益<span class="hint">税金などを引いたあと、最終的に残る利益<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">営業利益<span class="note">（本業で得た利益）<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">経常利益<span class="note">（本業以外も含めた通常の利益）<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">必要な売上高<\/div>/);
  assert.match(html, /<div class="kpi-label">あといくら必要か<\/div>/);
});

test("項目名の見出し：ホームのヒーロー", () => {
  const html = renderHome({ company: sampleCompany(), link });
  assert.match(html, /<div class="kpi-label">2026年3月期の当期純利益<span class="hint">最終的に残る利益<\/span><\/div>/);
  assert.match(html, /<div class="kpi-label">最新月次の当期純利益<\/div>/);
});
