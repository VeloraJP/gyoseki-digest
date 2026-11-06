import test from "node:test";
import assert from "node:assert/strict";
import {
  compareGoalPlans,
  computeGoalProgress,
  computeGoalSummary,
  computeRequiredSales,
  convertGoalToOperatingProfit,
  getCostStructure
} from "../assets/js/core/goal.js";
import {
  createAnnualPeriod,
  createCompany,
  createMonthlyRecord
} from "../assets/js/data/schema.js";

// 標準登録のサンプル。自動計算：営業利益 12,400,000／経常利益 11,800,000／当期純利益 10,000,000
// 変動費 70,400,000（原価66,000,000＋その他変動費4,400,000）、固定費 27,200,000、限界利益率 0.36
const STANDARD = {
  PL001: 110_000_000, PL002: 66_000_000, PL004: 6_000_000, PL005: 13_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_400_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 0, PL024: 1_800_000
};

function standardPeriod(overrides = {}) {
  return createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }, ...overrides
  });
}

test("費用構造：変動費・固定費・限界利益率が標準分類で計算される", () => {
  const structure = getCostStructure(standardPeriod());
  assert.equal(structure.sales, 110_000_000);
  assert.equal(structure.variableCosts, 70_400_000);
  assert.equal(structure.fixedCosts, 27_200_000);
  assert.ok(Math.abs(structure.marginalProfitRate - 0.36) < 1e-12);
});

test("費用構造：簡易登録では null", () => {
  const simple = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 90_000_000, PL025: 4_000_000 }
  });
  assert.equal(getCostStructure(simple), null);
  assert.equal(computeRequiredSales(simple, { profitCode: "PL025", amount: 5_000_000 }).reason, "NOT_STANDARD");
});

test("換算：営業利益目標はそのまま、経常・当期純利益は実績構造で換算される", () => {
  const period = standardPeriod();
  assert.deepEqual(convertGoalToOperatingProfit(period, "PL017", 12_400_000), {
    operatingProfitTarget: 12_400_000, approximate: false
  });
  // 経常 11,800,000 −（営業外収益100,000 − 営業外費用700,000）＝ 営業 12,400,000
  assert.deepEqual(convertGoalToOperatingProfit(period, "PL020", 11_800_000), {
    operatingProfitTarget: 12_400_000, approximate: false
  });
  // 当期純利益 10,000,000 ＋ 法人税等1,800,000 − 営業外損益(−600,000) − 特別損益0 ＝ 営業 12,400,000（概算）
  assert.deepEqual(convertGoalToOperatingProfit(period, "PL025", 10_000_000), {
    operatingProfitTarget: 12_400_000, approximate: true
  });
});

test("必要売上：実績と同じ営業利益目標なら必要売上＝現在売上、差額0・達成率100%", () => {
  const result = computeRequiredSales(standardPeriod(), { profitCode: "PL017", amount: 12_400_000 });
  assert.equal(result.ok, true);
  assert.equal(result.requiredSales, 110_000_000);
  assert.equal(result.additionalSales, 0);
  assert.equal(result.alreadyAchieved, true);
  assert.equal(result.achievementRate, 100);
});

test("必要売上：営業利益目標 16,000,000 なら必要売上 120,000,000、差額 10,000,000", () => {
  const result = computeRequiredSales(standardPeriod(), { profitCode: "PL017", amount: 16_000_000 });
  assert.equal(result.requiredSales, 120_000_000);
  assert.equal(result.additionalSales, 10_000_000);
  assert.ok(Math.abs(result.achievementRate - (110_000_000 / 120_000_000) * 100) < 1e-9);
});

test("必要売上：当期純利益ベースは概算フラグが立つ", () => {
  const result = computeRequiredSales(standardPeriod(), { profitCode: "PL025", amount: 13_600_000 });
  assert.equal(result.ok, true);
  assert.equal(result.approximate, true);
  // 換算後の営業利益目標 16,000,000 → 必要売上 120,000,000
  assert.equal(result.operatingProfitTarget, 16_000_000);
  assert.equal(result.requiredSales, 120_000_000);
});

test("必要売上：売上0の期は計算できない（NO_SALES）", () => {
  const zero = { ...STANDARD, PL001: 0, PL002: 0, PL015: 0 };
  const result = computeRequiredSales(standardPeriod({ values: zero }), { profitCode: "PL017", amount: 1_000_000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NO_SALES");
});

test("必要売上：変動費が売上を超える期は計算できない（RATE_NOT_POSITIVE）", () => {
  const values = { ...STANDARD, PL001: 10_000_000, PL002: 12_000_000, PL015: 0 };
  const result = computeRequiredSales(standardPeriod({ values }), { profitCode: "PL017", amount: 1_000_000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "RATE_NOT_POSITIVE");
});

test("複数案比較：目標額だけを変えて並べられる", () => {
  const plans = compareGoalPlans(standardPeriod(), "PL017", [12_400_000, 16_000_000]);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].result.requiredSales, 110_000_000);
  assert.equal(plans[1].result.requiredSales, 120_000_000);
  assert.equal(plans[1].result.additionalSales, 10_000_000);
});

function companyWithMonthly(months) {
  const company = createCompany({ name: "進捗テスト", closingMonth: 3 });
  const period = standardPeriod({ goal: { profitCode: "PL025", amount: 10_000_000 } });
  company.annualPeriods.push(period);
  for (const ym of months) {
    company.monthlyRecords.push(createMonthlyRecord({
      yearMonth: ym,
      values: { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 }
    }));
  }
  return { company, period };
}

test("進捗：月次累計と目標を比べ、残り月数と月平均の必要額が出る", () => {
  const { company, period } = companyWithMonthly(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  const required = computeRequiredSales(period, period.goal);
  const progress = computeGoalProgress(company, period, required);
  assert.equal(progress.cumulativeSales, 60_000_000);
  assert.equal(progress.remainingSales, 50_000_000);
  assert.equal(progress.remainingMonthCount, 6);
  assert.equal(progress.requiredMonthlyAverage, 8_333_333);
  assert.equal(progress.actualMonthlyAverage, 10_000_000);
  assert.ok(Math.abs(progress.salesProgressRate - (60_000_000 / 110_000_000) * 100) < 1e-9);
  // 当期純利益の進捗：累計 800,000×6 ／ 目標 10,000,000 ＝ 48%
  assert.equal(progress.profitProgress.actual, 4_800_000);
  assert.equal(progress.profitProgress.rate, 48);
});

test("進捗：途中に未登録月があると、欠けとして数え、累計は登録分だけになる", () => {
  const { company, period } = companyWithMonthly(["2026-04", "2026-05", "2026-07", "2026-08", "2026-09"]);
  const required = computeRequiredSales(period, period.goal);
  const progress = computeGoalProgress(company, period, required);
  assert.deepEqual(progress.missingMonths, ["2026-06"]);
  assert.equal(progress.registeredCount, 5);
  assert.equal(progress.cumulativeSales, 50_000_000);
  assert.equal(progress.actualMonthlyAverage, 10_000_000);
});

test("進捗：目標期そのものの月次は進捗に使わない（翌期の月次だけが対象）", () => {
  const { company, period } = companyWithMonthly(["2025-04", "2025-05", "2025-06"]);
  const required = computeRequiredSales(period, period.goal);
  assert.equal(computeGoalProgress(company, period, required), null);
});

test("進捗：月次が無い場合は null（表示自体を出さない）", () => {
  const { company, period } = companyWithMonthly([]);
  const required = computeRequiredSales(period, period.goal);
  assert.equal(computeGoalProgress(company, period, required), null);
});

test("進捗：経常利益目標では利益そのものの進捗は出さない（月次に直接対応する項目がないため）", () => {
  const { company, period } = companyWithMonthly(["2026-04"]);
  period.goal = { profitCode: "PL020", amount: 11_800_000 };
  const required = computeRequiredSales(period, period.goal);
  const progress = computeGoalProgress(company, period, required);
  assert.equal(progress.profitProgress, null);
  assert.equal(progress.cumulativeSales, 10_000_000);
});

test("ホーム要約：目標がある会社だけ、残りの必要売上が返る", () => {
  const { company } = companyWithMonthly(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  const summary = computeGoalSummary(company);
  assert.equal(summary.result.requiredSales, 110_000_000);
  // 月次進捗がある場合は、年次の差額ではなく月次累計ベースの残りを使う
  assert.equal(summary.remainingSales, 50_000_000);

  const noGoal = createCompany({ name: "目標なし", closingMonth: 3 });
  noGoal.annualPeriods.push(standardPeriod());
  assert.equal(computeGoalSummary(noGoal), null);
});
