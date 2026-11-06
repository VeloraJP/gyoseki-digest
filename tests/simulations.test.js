import test from "node:test";
import assert from "node:assert/strict";
import {
  SIMULATIONS, SIMULATION_BY_ID,
  computeSimulation, elapsedYearsActAct, resolveSimInitialValues, validateSimulation
} from "../assets/js/core/simulations.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord } from "../assets/js/data/schema.js";

// 結果配列からラベルで1件を取り出す
function byLabel(output, label) {
  const found = output.results.find((r) => r.label === label);
  assert.ok(found, `結果に「${label}」があること`);
  return found;
}

function compute(id, values) {
  const sim = SIMULATION_BY_ID[id];
  assert.deepEqual(validateSimulation(sim, values), [], `${id} の入力が検証を通ること`);
  return computeSimulation(sim, values);
}

const approx = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≒ ${expected}`);

// ---------------------------------------------------------------------------
// 構成（総整理の正式10種：名称・順序・件数を維持）
// ---------------------------------------------------------------------------

test("正式10シミュレーションの構成（名称・順序）が総整理どおり", () => {
  assert.equal(SIMULATIONS.length, 10);
  assert.deepEqual(SIMULATIONS.map((s) => s.title), [
    "商品・サービス価格", "損益分岐点", "人件費", "借入返済", "投資回収・利回り",
    "資金繰り", "財務健全性", "収益性比率", "成長率", "給与・雇用コスト"
  ]);
  assert.deepEqual(SIMULATIONS.map((s) => s.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// ---------------------------------------------------------------------------
// 1. 商品・サービス価格（期待値は business-tool2-2 の pricing / SIM-10 と一致）
// ---------------------------------------------------------------------------

test("価格：変更後の売上総利益（2-2 pricing の期待値）", () => {
  const out = compute("pricing", {
    currentPrice: 1000, changedPrice: 1200, unitCost: 500, changedUnitCost: null,
    salesQuantity: 900, expectedQuantityAfterPriceChange: null,
    targetGrossMarginRatePercent: null, fixedCostsExcludingLabor: null,
    laborCosts: null, otherVariableCosts: null, targetOperatingProfit: null
  });
  assert.equal(byLabel(out, "今の売上総利益").value, 450_000);
  assert.equal(byLabel(out, "変更後の売上総利益").value, 630_000); // (1200-500)×900
  assert.equal(byLabel(out, "売上総利益の増減").value, 180_000);
});

test("価格：必要な販売数量・維持価格・率からの価格・SIM-10の価格（2-2 の期待値）", () => {
  const qty = compute("pricing", {
    currentPrice: 1000, changedPrice: 800, unitCost: 400, changedUnitCost: null,
    salesQuantity: 100, expectedQuantityAfterPriceChange: null,
    targetGrossMarginRatePercent: null, fixedCostsExcludingLabor: null,
    laborCosts: null, otherVariableCosts: null, targetOperatingProfit: null
  });
  assert.equal(byLabel(qty, "今の粗利益を保つのに必要な販売数量").value, 150); // 60,000÷(800-400)

  const keep = compute("pricing", {
    currentPrice: 1000, changedPrice: 1100, unitCost: 400, changedUnitCost: 500,
    salesQuantity: 100, expectedQuantityAfterPriceChange: null,
    targetGrossMarginRatePercent: 20, fixedCostsExcludingLabor: null,
    laborCosts: null, otherVariableCosts: null, targetOperatingProfit: null
  });
  assert.equal(byLabel(keep, "原価の上昇分を反映した価格").value, 1100); // 500+(1000-400)
  assert.equal(byLabel(keep, "目標の粗利益率になる価格").value, 500); // 400÷(1-0.2)

  const sim10 = compute("pricing", {
    currentPrice: 1200, changedPrice: 1300, unitCost: 500, changedUnitCost: null,
    salesQuantity: 1000, expectedQuantityAfterPriceChange: null,
    targetGrossMarginRatePercent: null, fixedCostsExcludingLabor: 300_000,
    laborCosts: 200_000, otherVariableCosts: 50_000, targetOperatingProfit: 450_000
  });
  assert.equal(byLabel(sim10, "目標営業利益に必要な価格").value, 1500); // (500×1000+300k+200k+50k+450k)÷1000
});

test("価格：変更後価格が原価以下の場合は必要数量が出せず、理由が返る", () => {
  const out = compute("pricing", {
    currentPrice: 1000, changedPrice: 400, unitCost: 400, changedUnitCost: null,
    salesQuantity: 100, expectedQuantityAfterPriceChange: null,
    targetGrossMarginRatePercent: null, fixedCostsExcludingLabor: null,
    laborCosts: null, otherVariableCosts: null, targetOperatingProfit: null
  });
  const r = byLabel(out, "今の粗利益を保つのに必要な販売数量");
  assert.equal(r.value, null);
  assert.ok(r.reason.includes("原価以下"));
});

// ---------------------------------------------------------------------------
// 2. 損益分岐点
// ---------------------------------------------------------------------------

test("損益分岐点：限界利益・分岐点・安全余裕率・必要売上", () => {
  const out = compute("break-even", {
    salesAmount: 20_000_000, variableCosts: 12_000_000, fixedCosts: 6_000_000,
    targetOperatingProfit: 2_000_000
  });
  assert.equal(byLabel(out, "限界利益").value, 8_000_000);
  approx(byLabel(out, "限界利益率").value, 0.4);
  assert.equal(byLabel(out, "損益分岐点の売上高").value, 15_000_000);
  approx(byLabel(out, "安全余裕率").value, 0.25);
  assert.equal(byLabel(out, "目標に必要な売上高").value, 20_000_000);
  assert.equal(byLabel(out, "あといくら必要か").value, 0);
});

test("損益分岐点：限界利益率が0以下では分岐点が出せず、理由が返る", () => {
  const out = compute("break-even", {
    salesAmount: 10_000_000, variableCosts: 12_000_000, fixedCosts: 6_000_000,
    targetOperatingProfit: null
  });
  const bep = byLabel(out, "損益分岐点の売上高");
  assert.equal(bep.value, null);
  assert.ok(bep.reason.length > 0);
});

// ---------------------------------------------------------------------------
// 3. 人件費（採用後の営業利益は 2-2 SIM-12 の期待値）
// ---------------------------------------------------------------------------

test("人件費：追加人件費と採用後の営業利益", () => {
  const out = compute("labor", {
    plannedHireCount: 1, expectedSalaryPerPerson: 1_500_000, socialInsuranceRatePercent: 0,
    currentLaborCosts: 20_000_000, currentOperatingProfit: 2_000_000,
    expectedAdditionalSales: 5_000_000, marginalProfitRatePercent: 40
  });
  assert.equal(byLabel(out, "年間追加人件費").value, 1_500_000);
  assert.equal(byLabel(out, "採用後の人件費（年間）").value, 21_500_000);
  assert.equal(byLabel(out, "追加人件費をまかなうのに必要な追加売上").value, 3_750_000); // 1,500,000÷0.4
  assert.equal(byLabel(out, "採用後の営業利益").value, 2_500_000); // 2,000,000+5,000,000×0.4-1,500,000
});

test("人件費：社会保険料の概算が給与に率を掛けた額になる", () => {
  const out = compute("labor", {
    plannedHireCount: 2, expectedSalaryPerPerson: 4_800_000, socialInsuranceRatePercent: 15,
    currentLaborCosts: null, currentOperatingProfit: null,
    expectedAdditionalSales: null, marginalProfitRatePercent: null
  });
  assert.equal(byLabel(out, "追加の給与（年間）").value, 9_600_000);
  assert.equal(byLabel(out, "社会保険料の概算（年間）").value, 1_440_000);
  assert.equal(byLabel(out, "年間追加人件費").value, 11_040_000);
  assert.equal(byLabel(out, "採用後の人件費（年間）").value, null); // 今の人件費が未入力
});

// ---------------------------------------------------------------------------
// 4. 借入返済（2-2 loan / SIM-14 / SIM-15 の期待値）
// ---------------------------------------------------------------------------

test("借入返済：金利0では元金均等割になる", () => {
  const out = compute("loan", {
    loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT", annualPreDebtServiceCashFlow: null,
    shortTermBorrowings: null, longTermBorrowings: null, operatingProfit: null, depreciation: null
  });
  assert.equal(byLabel(out, "毎月の返済額（初回）").value, 100_000);
  assert.equal(byLabel(out, "年間返済額").value, 1_200_000);
  assert.equal(byLabel(out, "利息の総額").value, 0);
  assert.equal(out.tables[0].rows.length, 12);
  assert.equal(out.tables[0].rows[11][4], 0); // 最終月の残高は0
});

test("借入返済：金利ありの元利均等の初回返済額（2-2 の期待値）", () => {
  const out = compute("loan", {
    loanAmount: 1_000_000, interestRatePercent: 12, repaymentMonths: 10,
    repaymentMethod: "EQUAL_PAYMENT", annualPreDebtServiceCashFlow: null,
    shortTermBorrowings: null, longTermBorrowings: null, operatingProfit: null, depreciation: null
  });
  assert.equal(byLabel(out, "毎月の返済額（初回）").value, 105_582);
});

test("借入返済：キャッシュ倍率（SIM-14）と債務償還年数（SIM-15）", () => {
  const out = compute("loan", {
    loanAmount: 2_000_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT", annualPreDebtServiceCashFlow: 3_000_000,
    shortTermBorrowings: 2_000_000, longTermBorrowings: 8_000_000,
    operatingProfit: 1_500_000, depreciation: 500_000
  });
  approx(byLabel(out, "年間返済額に対するキャッシュ倍率").value, 1.5); // 3,000,000÷2,000,000
  approx(byLabel(out, "簡易債務償還年数").value, 5); // 10,000,000÷2,000,000
});

test("借入返済：元金均等では元金が一定で残高が減っていく", () => {
  const out = compute("loan", {
    loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PRINCIPAL", annualPreDebtServiceCashFlow: null,
    shortTermBorrowings: null, longTermBorrowings: null, operatingProfit: null, depreciation: null
  });
  assert.ok(out.tables[0].rows.every((row) => row[1] === 100_000));
  assert.equal(out.tables[0].rows[0][4], 1_100_000);
});

// ---------------------------------------------------------------------------
// 5. 投資回収・利回り（2-2 SIM-17 / SIM-18 の期待値）
// ---------------------------------------------------------------------------

test("投資：回収年数・増分営業利益・利回り", () => {
  const out = compute("investment", {
    investmentAmount: 10_000_000, annualIncrementalCashFlow: 2_000_000,
    annualOperatingProfitBeforeInvestment: 2_000_000, annualOperatingProfitAfterInvestment: 5_000_000,
    annualRunningCost: 500_000, targetPaybackYears: 4
  });
  approx(byLabel(out, "回収年数").value, 5); // 10,000,000÷2,000,000
  assert.equal(byLabel(out, "増分営業利益（年間）").value, 2_500_000); // 5,000,000-2,000,000-500,000
  approx(byLabel(out, "利回り（年間増分営業利益率）").value, 0.25);
  assert.equal(byLabel(out, "目標年数で回収するために必要な年間営業利益").value, 2_500_000); // 10,000,000÷4
});

// ---------------------------------------------------------------------------
// 6. 資金繰り
// ---------------------------------------------------------------------------

test("資金繰り：純減額・資金余命・残高推移（目安）", () => {
  const out = compute("cashflow", {
    cashBalance: 3_000_000, monthlyCashIn: 5_000_000, monthlyCashOut: 5_500_000,
    monthlyLoanPayment: 100_000, projectionMonths: 3
  });
  assert.equal(byLabel(out, "1か月の純減額（目安）").value, 600_000);
  approx(byLabel(out, "資金余命（目安）").value, 5);
  assert.equal(out.tables[0].rows[2][1], 1_200_000); // 3か月後の残高
  assert.ok(out.notes.some((n) => n.includes("目安")));
});

test("資金繰り：収支が減らない場合は余命を出さず理由が返る", () => {
  const out = compute("cashflow", {
    cashBalance: 3_000_000, monthlyCashIn: 6_000_000, monthlyCashOut: 5_500_000,
    monthlyLoanPayment: null, projectionMonths: null
  });
  const r = byLabel(out, "資金余命（目安）");
  assert.equal(r.value, null);
  assert.ok(r.reason.includes("減らない"));
});

// ---------------------------------------------------------------------------
// 7. 財務健全性 / 8. 収益性比率
// ---------------------------------------------------------------------------

test("財務健全性：各比率と運転資本", () => {
  const out = compute("soundness", {
    currentAssets: 8_000_000, fixedAssets: 12_000_000, totalAssets: 20_000_000,
    currentLiabilities: 5_000_000, totalLiabilities: 12_000_000, netAssets: 8_000_000
  });
  approx(byLabel(out, "自己資本比率").value, 0.4);
  approx(byLabel(out, "流動比率").value, 1.6);
  approx(byLabel(out, "固定比率").value, 1.5);
  approx(byLabel(out, "負債比率").value, 1.5);
  assert.equal(byLabel(out, "運転資本").value, 3_000_000);
});

test("財務健全性：入力が無い項目は理由つきで出ない（推測で補わない）", () => {
  const out = compute("soundness", {
    currentAssets: null, fixedAssets: null, totalAssets: null,
    currentLiabilities: null, totalLiabilities: null, netAssets: null
  });
  assert.ok(out.results.every((r) => r.value === null && r.reason));
});

test("収益性比率：利益率・ROA・ROE・回転率", () => {
  const out = compute("profitability", {
    salesAmount: 100_000_000, operatingProfit: 5_000_000, ordinaryProfit: 4_500_000,
    netProfit: 3_000_000, totalAssets: 60_000_000, netAssets: 30_000_000
  });
  approx(byLabel(out, "売上高営業利益率").value, 0.05);
  approx(byLabel(out, "売上高経常利益率").value, 0.045);
  approx(byLabel(out, "売上高当期純利益率").value, 0.03);
  approx(byLabel(out, "総資産当期純利益率（ROA）").value, 0.05);
  approx(byLabel(out, "自己資本当期純利益率（ROE）").value, 0.1);
  approx(byLabel(out, "総資産回転率").value, 100 / 60, 1e-9);
});

// ---------------------------------------------------------------------------
// 9. 成長率（2-2 growth の期待値、ACT/ACT の年数）
// ---------------------------------------------------------------------------

test("成長率：増減額・成長率・年平均成長率", () => {
  const out = compute("growth", {
    previousValue: 100_000_000, currentValue: 121_000_000,
    initialValue: 100, finalValue: 121, years: 2
  });
  assert.equal(byLabel(out, "増減額").value, 21_000_000);
  approx(byLabel(out, "成長率").value, 0.21);
  approx(byLabel(out, "年平均成長率").value, 0.1, 1e-9); // (121/100)^(1/2)-1
});

test("成長率：期末日の経過年数（ACT/ACT、うるう年）", () => {
  approx(elapsedYearsActAct("2024-02-29", "2025-02-28"), 1, 1e-9);
  approx(elapsedYearsActAct("2025-03-31", "2026-03-31"), 1, 1e-9);
  approx(elapsedYearsActAct("2024-03-31", "2026-03-31"), 2, 1e-9);
});

// ---------------------------------------------------------------------------
// 10. 給与・雇用コスト
// ---------------------------------------------------------------------------

test("給与・雇用コスト：総額・1人当たり・月額換算", () => {
  const out = compute("payroll", {
    employeeCount: 5, annualSalaryPerPerson: 4_800_000,
    socialInsuranceRatePercent: 15, otherCostPerPerson: 120_000
  });
  assert.equal(byLabel(out, "年間給与総額").value, 24_000_000);
  assert.equal(byLabel(out, "社会保険料の概算（年間）").value, 3_600_000);
  assert.equal(byLabel(out, "その他の経費の合計（年間）").value, 600_000);
  assert.equal(byLabel(out, "年間雇用コスト合計").value, 28_200_000);
  assert.equal(byLabel(out, "1人当たりの年間雇用コスト").value, 5_640_000);
  assert.equal(byLabel(out, "月額換算（会社全体）").value, 2_350_000);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("Validation：必須不足・範囲外・整数でない値を弾く", () => {
  const pricing = SIMULATION_BY_ID.pricing;
  const missing = validateSimulation(pricing, {
    currentPrice: null, changedPrice: 100, unitCost: 50, salesQuantity: 10
  });
  assert.ok(missing.some((e) => e.field === "currentPrice"));

  const badPercent = validateSimulation(SIMULATION_BY_ID.labor, {
    plannedHireCount: 1, expectedSalaryPerPerson: 3_000_000, socialInsuranceRatePercent: 120
  });
  assert.ok(badPercent.some((e) => e.field === "socialInsuranceRatePercent"));

  const badMonths = validateSimulation(SIMULATION_BY_ID.loan, {
    loanAmount: 1_000_000, interestRatePercent: 2, repaymentMonths: 601, repaymentMethod: "EQUAL_PAYMENT"
  });
  assert.ok(badMonths.some((e) => e.field === "repaymentMonths"));

  const fraction = validateSimulation(SIMULATION_BY_ID.payroll, {
    employeeCount: 2.5, annualSalaryPerPerson: 4_000_000, socialInsuranceRatePercent: 15
  });
  assert.ok(fraction.some((e) => e.field === "employeeCount"));

  const margin100 = validateSimulation(pricing, {
    currentPrice: 1000, changedPrice: 1100, unitCost: 500, salesQuantity: 10,
    targetGrossMarginRatePercent: 100
  });
  assert.ok(margin100.some((e) => e.field === "targetGrossMarginRatePercent"));

  const noMethod = validateSimulation(SIMULATION_BY_ID.loan, {
    loanAmount: 1_000_000, interestRatePercent: 2, repaymentMonths: 36, repaymentMethod: null
  });
  assert.ok(noMethod.some((e) => e.field === "repaymentMethod"));
});

// ---------------------------------------------------------------------------
// 会社情報からの初期値（総整理6章：年次優先→月次集計→補わない）
// ---------------------------------------------------------------------------

const STANDARD_VALUES = {
  PL001: 20_000_000, PL002: 11_000_000,
  PL004: 1_000_000, PL005: 2_000_000, PL006: 500_000,
  PL008: 1_000_000, PL010: 300_000, PL011: 200_000, PL012: 100_000,
  PL013: 400_000, PL014: 500_000, PL015: 1_000_000,
  PL018: 0, PL019: 100_000, PL021: 0, PL022: 0, PL024: 300_000
};
// 固定費 = PL004+PL005+PL006+PL008+PL010+PL011+PL012+PL013+PL014 = 6,000,000
// 変動費 = PL002+PL015 = 12,000,000 / 人件費合計 PL007 = 3,500,000
// 営業利益 PL017 = (20,000,000-11,000,000) - (6,000,000+1,000,000) = 2,000,000

test("初期値：年次標準登録から損益分岐点・人件費の初期値が入る", () => {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD_VALUES }
  }));

  const be = resolveSimInitialValues(company, "break-even");
  assert.equal(be.values.salesAmount, 20_000_000);
  assert.equal(be.values.variableCosts, 12_000_000);
  assert.equal(be.values.fixedCosts, 6_000_000);
  assert.ok(be.sourceNote.includes("年次登録"));

  const labor = resolveSimInitialValues(company, "labor");
  assert.equal(labor.values.currentLaborCosts, 3_500_000);
  assert.equal(labor.values.currentOperatingProfit, 2_000_000);
  assert.equal(labor.values.marginalProfitRatePercent, 40); // (20,000,000-12,000,000)/20,000,000
});

test("初期値：B/S登録から健全性・収益性の初期値が入る", () => {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD_VALUES },
    bsValues: {
      BS001: 5_000_000, BS002: 2_000_000, BS003: 1_000_000, BS004: 0,
      BS006: 10_000_000, BS007: 2_000_000, BS008: 0, BS009: 0, BS010: 0,
      BS013: 2_000_000, BS014: 1_000_000, BS015: 1_000_000, BS016: 1_000_000, BS017: 0,
      BS019: 8_000_000, BS020: 0, BS023: 3_000_000, BS024: 4_000_000, BS025: 0
    }
  }));
  const sound = resolveSimInitialValues(company, "soundness");
  assert.equal(sound.values.currentAssets, 8_000_000);
  assert.equal(sound.values.fixedAssets, 12_000_000);
  assert.equal(sound.values.totalAssets, 20_000_000);
  assert.equal(sound.values.currentLiabilities, 5_000_000);
  assert.equal(sound.values.totalLiabilities, 13_000_000);
  assert.equal(sound.values.netAssets, 7_000_000);

  const loan = resolveSimInitialValues(company, "loan");
  assert.equal(loan.values.shortTermBorrowings, 1_000_000);
  assert.equal(loan.values.longTermBorrowings, 8_000_000);
  assert.equal(loan.values.depreciation, 400_000);

  const cash = resolveSimInitialValues(company, "cashflow");
  assert.equal(cash.values.cashBalance, 5_000_000);
});

test("初期値：年次がなければ月次12か月の集計から入る", () => {
  const company = createCompany({ closingMonth: 3 });
  const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
    "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
  for (const ym of months) {
    company.monthlyRecords.push(createMonthlyRecord({
      yearMonth: ym,
      values: { M001: 1_000_000, M002: 600_000, M003: 200_000, M004: 50_000, M005: 50_000, M006: 100_000, M007: 10_000 }
    }));
  }
  const be = resolveSimInitialValues(company, "break-even");
  assert.equal(be.values.salesAmount, 12_000_000);
  assert.equal(be.values.variableCosts, 8_400_000); // (600,000+100,000)×12
  assert.equal(be.values.fixedCosts, 3_600_000); // (200,000+50,000+50,000)×12
  assert.ok(be.sourceNote.includes("月次12か月分"));
});

test("初期値：月次が12か月そろわなければ補わない", () => {
  const company = createCompany({ closingMonth: 3 });
  for (const ym of ["2026-01", "2026-02", "2026-03"]) {
    company.monthlyRecords.push(createMonthlyRecord({
      yearMonth: ym,
      values: { M001: 1_000_000, M002: 600_000, M003: 200_000, M004: 50_000, M005: 50_000, M006: 100_000, M007: 10_000 }
    }));
  }
  const be = resolveSimInitialValues(company, "break-even");
  assert.deepEqual(be.values, {});
  assert.equal(be.sourceNote, null);
});

test("初期値：簡易登録では分かる項目だけが入り、残りは空欄（推測で補わない）", () => {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 50_000_000, PL025: 3_000_000 }
  }));
  const profit = resolveSimInitialValues(company, "profitability");
  assert.equal(profit.values.salesAmount, 50_000_000);
  assert.equal(profit.values.netProfit, 3_000_000);
  assert.equal(profit.values.operatingProfit, undefined);
  assert.equal(profit.values.totalAssets, undefined);
});

test("初期値：成長率は2期分の売上高から入る", () => {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "SIMPLE", values: { PL001: 100_000_000, PL025: 5_000_000 }
  }));
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 121_000_000, PL025: 6_000_000 }
  }));
  const growth = resolveSimInitialValues(company, "growth");
  assert.equal(growth.values.previousValue, 100_000_000);
  assert.equal(growth.values.currentValue, 121_000_000);
  assert.equal(growth.values.initialValue, 100_000_000);
  assert.equal(growth.values.finalValue, 121_000_000);
  assert.equal(growth.values.years, 1);

  // 初期値のまま計算すると、成長率21%になる
  const out = computeSimulation(SIMULATION_BY_ID.growth, { ...growth.values });
  approx(byLabel(out, "成長率").value, 0.21);
});

test("初期値：会社が無ければ空（手入力のみ）", () => {
  const empty = resolveSimInitialValues(null, "break-even");
  assert.deepEqual(empty.values, {});
  assert.equal(empty.sourceNote, null);
});
