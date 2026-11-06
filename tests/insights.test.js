import test from "node:test";
import assert from "node:assert/strict";
import { computeBreakEven } from "../assets/js/core/goal.js";
import { computeCashGap, selectCashGapPair } from "../assets/js/core/cashflow.js";
import { buildAnnualTrend, buildMonthlyTrend } from "../assets/js/core/trend.js";
import { buildHash } from "../assets/js/navigation/router.js";
import { renderAnalysis } from "../assets/js/views/analysis.js";
import { renderGoal } from "../assets/js/views/goal.js";
import { renderReview } from "../assets/js/views/review.js";
import { renderSummary } from "../assets/js/views/summary.js";
import {
  createAnnualPeriod,
  createCompany,
  createMonthlyRecord
} from "../assets/js/data/schema.js";

const link = (route, params) => buildHash(route, params);

// 標準登録のサンプル（goal.test.js と同じ）。営業利益 12,400,000／当期純利益 10,000,000
// 変動費 70,400,000、固定費 27,200,000、限界利益率 0.36、減価償却費 800,000
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
// 現預金 +3,000,000、売掛金 +2,000,000、在庫 −1,000,000、買掛金 +1,000,000、借入金 −3,000,000 になる組み合わせ
const BS_CUR = { BS001: 8_000_000, BS002: 12_000_000, BS003: 5_000_000, BS013: 4_000_000, BS014: 3_000_000, BS019: 10_000_000 };
const BS_PREV = { BS001: 5_000_000, BS002: 10_000_000, BS003: 6_000_000, BS013: 3_000_000, BS014: 4_000_000, BS019: 12_000_000 };

function standardPeriod(overrides = {}) {
  return createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }, ...overrides
  });
}
function prevPeriod(overrides = {}) {
  return createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "STANDARD", values: { ...STANDARD_PREV }, ...overrides
  });
}
function bsCompany() {
  const company = createCompany({ name: "B/Sあり", closingMonth: 3 });
  company.annualPeriods.push(prevPeriod({ bsValues: { ...BS_PREV } }));
  company.annualPeriods.push(standardPeriod({ bsValues: { ...BS_CUR } }));
  return company;
}
function plainCompany() {
  const company = createCompany({ name: "B/Sなし", closingMonth: 3 });
  company.annualPeriods.push(prevPeriod());
  company.annualPeriods.push(standardPeriod());
  return company;
}

test("損益分岐点：固定費 ÷ 限界利益率 で計算され、現在売上との差が出る", () => {
  const result = computeBreakEven(standardPeriod());
  assert.equal(result.ok, true);
  // 27,200,000 ÷ 0.36 = 75,555,555.55… → 75,555,556
  assert.equal(result.breakEvenSales, 75_555_556);
  assert.equal(result.difference, 110_000_000 - 75_555_556);
  assert.ok(Math.abs(result.cushionRate - (34_444_444 / 110_000_000) * 100) < 1e-9);
});

test("損益分岐点：簡易登録・売上0・限界利益率0以下では計算できない", () => {
  const simple = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 90_000_000, PL025: 4_000_000 }
  });
  assert.equal(computeBreakEven(simple).reason, "NOT_STANDARD");

  const zeroSales = { ...STANDARD, PL001: 0, PL002: 0, PL015: 0 };
  assert.equal(computeBreakEven(standardPeriod({ values: zeroSales })).reason, "NO_SALES");

  const badRate = { ...STANDARD, PL001: 10_000_000, PL002: 12_000_000, PL015: 0 };
  assert.equal(computeBreakEven(standardPeriod({ values: badRate })).reason, "RATE_NOT_POSITIVE");
});

test("お金のズレ：主な項目の影響の合計が現預金の増減と一致する", () => {
  const result = computeCashGap(standardPeriod({ bsValues: { ...BS_CUR } }), prevPeriod({ bsValues: { ...BS_PREV } }));
  assert.equal(result.ok, true);
  assert.equal(result.cashPrevious, 5_000_000);
  assert.equal(result.cashCurrent, 8_000_000);
  assert.equal(result.cashChange, 3_000_000);
  const byCode = Object.fromEntries(result.items.map((i) => [i.code, i]));
  assert.equal(byCode.NET_INCOME.effect, 10_000_000);
  assert.equal(byCode.DEPRECIATION.effect, 800_000);
  assert.equal(byCode.RECEIVABLES.amount, 2_000_000);
  assert.equal(byCode.RECEIVABLES.effect, -2_000_000);
  assert.equal(byCode.INVENTORY.amount, -1_000_000);
  assert.equal(byCode.INVENTORY.effect, 1_000_000);
  assert.equal(byCode.PAYABLES.effect, 1_000_000);
  assert.equal(byCode.DEBT.amount, -3_000_000);
  assert.equal(byCode.DEBT.effect, -3_000_000);
  // その他 ＝ 3,000,000 −（10,000,000＋800,000−2,000,000＋1,000,000＋1,000,000−3,000,000）
  assert.equal(byCode.OTHER.effect, -4_800_000);
  const total = result.items.reduce((s, i) => s + i.effect, 0);
  assert.equal(total, result.cashChange);
});

test("お金のズレ：前提がそろわない場合は理由コードを返す", () => {
  const cur = standardPeriod({ bsValues: { ...BS_CUR } });
  assert.equal(computeCashGap(cur, null).reason, "NO_PREVIOUS");
  assert.equal(computeCashGap(cur, prevPeriod()).reason, "NO_BS");
  const missing = { ...BS_PREV };
  delete missing.BS019;
  assert.equal(computeCashGap(cur, prevPeriod({ bsValues: missing })).reason, "MISSING_ITEMS");
  const simpleCur = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 90_000_000, PL025: 4_000_000 }, bsValues: { ...BS_CUR }
  });
  assert.equal(computeCashGap(simpleCur, prevPeriod({ bsValues: { ...BS_PREV } })).reason, "NOT_STANDARD");
});

test("お金のズレ：対象ペアは最新の年次登録とその直前", () => {
  const company = bsCompany();
  const { current, previous } = selectCashGapPair(company);
  assert.equal(current.displayName, "2026年3月期");
  assert.equal(previous.displayName, "2025年3月期");
});

test("推移：月次は直近12件に絞られ、系列が月順に並ぶ", () => {
  const company = createCompany({ name: "推移テスト", closingMonth: 3 });
  const mv = { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 };
  const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"];
  for (const ym of months) company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...mv } }));
  const trend = buildMonthlyTrend(company);
  assert.equal(trend.count, 12);
  assert.equal(trend.truncated, true);
  assert.equal(trend.series.M001.length, 12);
  assert.equal(trend.series.M001[0].yearMonth, "2025-05");
  assert.equal(trend.series.M103[0].value, 1_100_000);
});

test("推移：年次の営業利益系列は全期が標準登録のときだけそろう", () => {
  const company = bsCompany();
  const trend = buildAnnualTrend(company);
  assert.equal(trend.count, 2);
  assert.equal(trend.hasOperating, true);
  assert.equal(trend.points[1].PL017, 12_400_000);

  const mixed = createCompany({ name: "混在", closingMonth: 3 });
  mixed.annualPeriods.push(createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "SIMPLE", values: { PL001: 80_000_000, PL025: 3_000_000 }
  }));
  mixed.annualPeriods.push(standardPeriod());
  assert.equal(buildAnnualTrend(mixed).hasOperating, false);
});

test("目標画面：標準登録の期では目標がなくても損益分岐点が出る", () => {
  const company = plainCompany();
  const period = company.annualPeriods[1];
  const html = renderGoal({ company, params: { period: period.id }, link });
  assert.match(html, /赤字にならない最低限の売上（損益分岐点）/);
  assert.match(html, /75,555,556円/);
});

test("目標画面：売上0の期では損益分岐点の枠と理由が出る", () => {
  const company = createCompany({ name: "売上ゼロ", closingMonth: 3 });
  const zero = { ...STANDARD, PL001: 0, PL002: 0, PL015: 0 };
  const period = standardPeriod({ values: zero });
  company.annualPeriods.push(period);
  const html = renderGoal({ company, params: { period: period.id }, link });
  assert.match(html, /損益分岐点の売上高/);
  assert.match(html, /売上高が0のため、計算できません/);
});

test("分析画面：B/Sが2期分あると、お金のちがいの内訳と注意書きが出る", () => {
  const html = renderAnalysis({ company: bsCompany(), link });
  assert.match(html, /利益と手元のお金のちがい/);
  assert.match(html, /将来の予測ではなく/);
  assert.match(html, /主な項目だけを取り上げており/);
  assert.match(html, /\+3,000,000円/);
  assert.match(html, /売掛金の増減/);
  assert.match(html, /その他の動き/);
});

test("分析画面：B/Sがないと、お金のちがいの枠と理由が出る", () => {
  const html = renderAnalysis({ company: plainCompany(), link });
  assert.match(html, /利益と手元のお金のちがい/);
  assert.match(html, /貸借対照表（B\/S）の登録が/);
});

test("分析画面：月次集計が対象のときは、お金のちがいの枠自体を出さない", () => {
  const company = createCompany({ name: "月次だけ", closingMonth: 3 });
  const mv = { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 };
  const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  for (const ym of months) company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...mv } }));
  const html = renderAnalysis({ company, link });
  assert.match(html, /月次集計/);
  assert.ok(!html.includes("利益と手元のお金のちがい"));
});

test("レビュー：月次が2件以上あると推移グラフが出て、1件では理由が出る", () => {
  const company = plainCompany();
  const mv = { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 };
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-09", values: { ...mv } }));
  const oneHtml = renderReview({ company, params: { tab: "monthly", ym: "2026-09" }, link });
  assert.match(oneHtml, /推移グラフは、2か月分以上の月次登録があると表示されます/);

  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-10", values: { ...mv } }));
  const twoHtml = renderReview({ company, params: { tab: "monthly", ym: "2026-10" }, link });
  assert.match(twoHtml, /推移グラフ/);
  assert.match(twoHtml, /chart-svg/);
  assert.match(twoHtml, /売上高の推移/);
});

test("レビュー：年度タブに推移グラフ（営業利益を含む）が出る", () => {
  const html = renderReview({ company: plainCompany(), params: { tab: "annual" }, link });
  assert.match(html, /推移グラフ/);
  assert.match(html, /営業利益の推移/);
  assert.match(html, /chart-svg/);
});

test("1枚サマリー：業績・目標・損益分岐点・お金の要点と印刷ボタンがまとまる", () => {
  const company = bsCompany();
  company.annualPeriods[1].goal = { profitCode: "PL017", amount: 16_000_000 };
  const html = renderSummary({ company, link });
  assert.match(html, /1枚サマリー/);
  assert.match(html, /id="summary-print"/);
  assert.match(html, /10,000,000円/); // 当期純利益
  assert.match(html, /120,000,000円/); // 必要な売上高
  assert.match(html, /75,555,556円/); // 損益分岐点
  assert.match(html, /\+3,000,000円/); // 現預金の増減
});

test("1枚サマリー：登録がなければ案内が出る", () => {
  const company = createCompany({ name: "空の会社", closingMonth: 3 });
  const html = renderSummary({ company, link });
  assert.match(html, /まだ表示できる登録がありません/);
});
