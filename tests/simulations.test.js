import test from "node:test";
import assert from "node:assert/strict";
import {
  SIMULATIONS, SIMULATION_BY_ID,
  computeSimulation, resolveSimInitialValues, validateSimulation
} from "../assets/js/core/simulations.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord } from "../assets/js/data/schema.js";

// 計算式の正本は「共通計算エンジン_確定計算式一覧」。期待値は同資料の確定式から導く。
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
// 1. 商品・サービス価格（確定式一覧4章：方式A/B/C）
// ---------------------------------------------------------------------------

test("価格：方式Bの合計粗利益比較（数量は変更前後で共通）", () => {
  const out = compute("pricing", {
    currentPrice: 1000, changedPrice: 1200, unitCost: 500, salesQuantity: 900,
    targetGrossMarginRatePercent: null, targetGrossProfitAmount: null
  });
  assert.equal(byLabel(out, "合計粗利益（今）").value, 450_000); // (1000-500)×900
  assert.equal(byLabel(out, "合計粗利益（変更後）").value, 630_000); // (1200-500)×900
  assert.equal(byLabel(out, "合計粗利益の増減").value, 180_000);
  assert.equal(byLabel(out, "1単位の粗利益（今）").value, 500);
  assert.equal(byLabel(out, "1単位の粗利益（変更後）").value, 700);
});

test("価格：粗利益率のポイント差（確定式：変更後率−現在率）", () => {
  const out = compute("pricing", {
    currentPrice: 1000, changedPrice: 800, unitCost: 400, salesQuantity: 100,
    targetGrossMarginRatePercent: null, targetGrossProfitAmount: null
  });
  // 現在率 (1000-400)/1000=60%、変更後率 (800-400)/800=50% → -10ポイント
  approx(byLabel(out, "粗利益率のポイント差").value, -10, 1e-9);
});

test("価格：方式A（率からの価格）と方式C（額からの価格）", () => {
  const out = compute("pricing", {
    currentPrice: 900, changedPrice: 950, unitCost: 400, salesQuantity: 10,
    targetGrossMarginRatePercent: 20, targetGrossProfitAmount: 600
  });
  assert.equal(byLabel(out, "目標粗利益率からの価格（方式A）").value, 500); // 400÷(1-0.2)
  assert.equal(byLabel(out, "目標粗利益額からの価格（方式C）").value, 1000); // 400+600
});

test("価格：価格が0の場合は粗利益率のポイント差が出ない", () => {
  const out = compute("pricing", {
    currentPrice: 0, changedPrice: 800, unitCost: 400, salesQuantity: 100,
    targetGrossMarginRatePercent: null, targetGrossProfitAmount: null
  });
  assert.equal(byLabel(out, "粗利益率のポイント差").value, null);
});

// ---------------------------------------------------------------------------
// 2. 損益分岐点（確定式一覧3章）
// ---------------------------------------------------------------------------

test("損益分岐点：限界利益・分岐点・比率・安全余裕率・必要売上", () => {
  const out = compute("break-even", {
    salesAmount: 20_000_000, variableCosts: 12_000_000, fixedCosts: 6_000_000,
    targetOperatingProfit: 2_000_000
  });
  assert.equal(byLabel(out, "限界利益").value, 8_000_000);
  approx(byLabel(out, "限界利益率").value, 0.4); // 1 - 12,000,000/20,000,000
  assert.equal(byLabel(out, "損益分岐点の売上高").value, 15_000_000);
  approx(byLabel(out, "損益分岐点比率").value, 0.75); // 15,000,000÷20,000,000
  approx(byLabel(out, "安全余裕率").value, 0.25);
  assert.equal(byLabel(out, "目標に必要な売上高").value, 20_000_000);
});

test("損益分岐点：限界利益率が0以下では分岐点が出ず、理由が返る", () => {
  const out = compute("break-even", {
    salesAmount: 10_000_000, variableCosts: 12_000_000, fixedCosts: 6_000_000,
    targetOperatingProfit: null
  });
  const bep = byLabel(out, "損益分岐点の売上高");
  assert.equal(bep.value, null);
  assert.ok(bep.reason.length > 0);
});

// ---------------------------------------------------------------------------
// 3. 人件費（確定式一覧5章：方式A/B/C）
// ---------------------------------------------------------------------------

test("人件費：方式A（現状の労働分配率）", () => {
  const out = compute("labor", {
    currentLaborCosts: 20_000_000, grossProfit: 40_000_000, employeeCount: 10,
    targetLaborShareRatePercent: null, changedLaborCosts: null
  });
  approx(byLabel(out, "労働分配率（方式A）").value, 0.5); // 20,000,000÷40,000,000
  assert.equal(byLabel(out, "人件費控除後金額（方式A）").value, 20_000_000);
  assert.equal(byLabel(out, "一人当たり人件費（方式A）").value, 2_000_000);
});

test("人件費：方式B（目標人件費）", () => {
  const out = compute("labor", {
    currentLaborCosts: 20_000_000, grossProfit: 40_000_000, employeeCount: 10,
    targetLaborShareRatePercent: 45, changedLaborCosts: null
  });
  assert.equal(byLabel(out, "目標人件費（方式B）").value, 18_000_000); // 40,000,000×45%
  assert.equal(byLabel(out, "目標人件費控除後金額（方式B）").value, 22_000_000);
  assert.equal(byLabel(out, "目標人件費差額（方式B）").value, -2_000_000);
  assert.equal(byLabel(out, "一人当たり目標人件費（方式B）").value, 1_800_000);
});

test("人件費：方式C（変更比較）", () => {
  const out = compute("labor", {
    currentLaborCosts: 20_000_000, grossProfit: 40_000_000, employeeCount: 10,
    targetLaborShareRatePercent: null, changedLaborCosts: 22_000_000
  });
  approx(byLabel(out, "変更後労働分配率（方式C）").value, 0.55);
  assert.equal(byLabel(out, "人件費差額（方式C）").value, 2_000_000);
  assert.equal(byLabel(out, "控除後金額差額（方式C）").value, -2_000_000); // 現在−変更後
  approx(byLabel(out, "労働分配率のポイント差（方式C）").value, 5, 1e-9); // (0.55-0.50)×100
});

test("人件費：粗利益0では方式Aの分配率は出ないが、方式Bは計算できる", () => {
  const out = compute("labor", {
    currentLaborCosts: 1_000_000, grossProfit: 0, employeeCount: null,
    targetLaborShareRatePercent: 50, changedLaborCosts: null
  });
  assert.equal(byLabel(out, "労働分配率（方式A）").value, null);
  assert.equal(byLabel(out, "目標人件費（方式B）").value, 0); // 粗利益0×50%
});

test("人件費：従業員数0では一人当たりだけが出ない", () => {
  const out = compute("labor", {
    currentLaborCosts: 20_000_000, grossProfit: 40_000_000, employeeCount: 0,
    targetLaborShareRatePercent: null, changedLaborCosts: null
  });
  approx(byLabel(out, "労働分配率（方式A）").value, 0.5);
  assert.equal(byLabel(out, "一人当たり人件費（方式A）").value, null);
});

// ---------------------------------------------------------------------------
// 4. 借入返済（確定式一覧7章）
// ---------------------------------------------------------------------------

const loanBase = {
  prepaymentMonth: null, prepaymentAmount: null, prepaymentType: "", annualCashFlow: null
};

test("借入返済：金利0では元金均等割になり、最終残高は0", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT"
  });
  assert.equal(byLabel(out, "毎月の返済額（初回）").value, 100_000);
  assert.equal(byLabel(out, "年間返済額").value, 1_200_000);
  assert.equal(byLabel(out, "利息の総額").value, 0);
  assert.equal(out.tables[0].rows.length, 12);
  assert.equal(out.tables[0].rows[11][4], 0);
});

test("借入返済：金利ありの元利均等の初回返済額", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 1_000_000, interestRatePercent: 12, repaymentMonths: 10,
    repaymentMethod: "EQUAL_PAYMENT"
  });
  assert.equal(byLabel(out, "毎月の返済額（初回）").value, 105_582);
});

test("借入返済：DSCR（確定式：年間キャッシュフロー÷年間返済額）", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 2_000_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT", annualCashFlow: 3_000_000
  });
  approx(byLabel(out, "債務返済余裕倍率（DSCR）").value, 1.5);
});

test("借入返済：繰上返済（期間短縮型）は別行で計算され、期間が短くなる", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT",
    prepaymentMonth: 3, prepaymentAmount: 300_000, prepaymentType: "PERIOD_SHORTEN"
  });
  assert.equal(byLabel(out, "実際の返済回数").value, 9); // 12回→9回
  assert.equal(byLabel(out, "返済総額").value, 1_200_000);
  assert.equal(byLabel(out, "年間返済額").value, 1_200_000); // 繰上分を含む先頭12回分
  const prepayRow = out.tables[0].rows.find((r) => typeof r[0] === "string");
  assert.ok(prepayRow, "繰上返済が別行で表示される");
  assert.equal(prepayRow[1], 300_000);
});

test("借入返済：繰上返済（返済額軽減型）は期間を変えず返済額が下がる", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PAYMENT",
    prepaymentMonth: 3, prepaymentAmount: 300_000, prepaymentType: "PAYMENT_REDUCE"
  });
  const count = byLabel(out, "実際の返済回数");
  assert.equal(count.value, 12); // 期間は変わらない
  assert.equal(byLabel(out, "返済総額").value, 1_200_000);
  // 4か月目の返済額は (1,200,000-300,000-300,000)÷9 ≒ 66,667 に下がる
  const month4 = out.tables[0].rows.find((r) => r[0] === 4);
  assert.ok(Math.round(month4[3]) === 66_667, `4か月目の返済額 ${month4[3]} ≒ 66,667`);
});

test("借入返済：元金均等では元金が一定で残高が減っていく", () => {
  const out = compute("loan", {
    ...loanBase, loanAmount: 1_200_000, interestRatePercent: 0, repaymentMonths: 12,
    repaymentMethod: "EQUAL_PRINCIPAL"
  });
  assert.ok(out.tables[0].rows.every((row) => Math.round(row[1]) === 100_000));
  assert.equal(out.tables[0].rows[0][4], 1_100_000);
});

// ---------------------------------------------------------------------------
// 5. 投資回収・利回り（確定式一覧8章B：年間利益ベース）
// ---------------------------------------------------------------------------

test("投資：年間利益・回収年数・回収月数・利回り", () => {
  const out = compute("investment", {
    investmentAmount: 10_000_000, annualRevenue: 3_000_000, annualExpense: 500_000
  });
  assert.equal(byLabel(out, "年間利益").value, 2_500_000); // 3,000,000-500,000
  approx(byLabel(out, "投資回収年数").value, 4); // 10,000,000÷2,500,000
  assert.equal(byLabel(out, "投資回収月数").value, 48); // round(4×12)
  approx(byLabel(out, "年間利回り").value, 0.25);
});

test("投資：年間経費が未入力の場合は0円として扱う", () => {
  const out = compute("investment", {
    investmentAmount: 10_000_000, annualRevenue: 2_000_000, annualExpense: null
  });
  assert.equal(byLabel(out, "年間利益").value, 2_000_000);
  approx(byLabel(out, "投資回収年数").value, 5);
});

test("投資：年間利益が0以下では回収期間を表示しない", () => {
  const out = compute("investment", {
    investmentAmount: 10_000_000, annualRevenue: 400_000, annualExpense: 500_000
  });
  assert.equal(byLabel(out, "年間利益").value, -100_000);
  assert.equal(byLabel(out, "投資回収年数").value, null);
  assert.equal(byLabel(out, "投資回収月数").value, null);
  approx(byLabel(out, "年間利回り").value, -0.01); // 利回りは表示する
});

// ---------------------------------------------------------------------------
// 6. 資金繰り（確定式一覧6章B：日別資金繰り）
// ---------------------------------------------------------------------------

test("資金繰り：日別残高・最低残高・最初の不足日・不足日数", () => {
  const out = compute("cashflow", {
    cashBalance: 100_000, periodDays: 5, dailyCashIn: 10_000, dailyCashOut: 30_000,
    specialInDay1: null, specialInAmount1: null, specialInDay2: null, specialInAmount2: null,
    specialOutDay1: 3, specialOutAmount1: 50_000, specialOutDay2: null, specialOutAmount2: null,
    minimumCashBalance: 0
  });
  // 残高: 80,000 → 60,000 → -10,000 → -30,000 → -50,000
  assert.equal(byLabel(out, "期間末残高").value, -50_000);
  assert.equal(byLabel(out, "期間中の最低残高").value, -50_000);
  assert.equal(byLabel(out, "最初の残高不足日").value, 3);
  assert.equal(byLabel(out, "残高がマイナスになる日数").value, 3);
  assert.equal(byLabel(out, "期間の収支").value, -150_000);
  assert.equal(byLabel(out, "最低維持資金との差額").value, -50_000);
  assert.equal(out.tables[0].rows.length, 5);
  assert.equal(out.tables[0].rows[2][3], -10_000); // 3日目の残高（同日の通常支出と特定支出を合算）
});

test("資金繰り：残高0円の日は不足日に含めない", () => {
  const out = compute("cashflow", {
    cashBalance: 20_000, periodDays: 2, dailyCashIn: 0, dailyCashOut: 10_000,
    specialInDay1: null, specialInAmount1: null, specialInDay2: null, specialInAmount2: null,
    specialOutDay1: null, specialOutAmount1: null, specialOutDay2: null, specialOutAmount2: null,
    minimumCashBalance: null
  });
  const shortage = byLabel(out, "最初の残高不足日");
  assert.equal(shortage.value, null);
  assert.ok(shortage.reason.includes("マイナスになる日はありません"));
  assert.equal(byLabel(out, "残高がマイナスになる日数").value, 0);
});

// ---------------------------------------------------------------------------
// 7. 財務健全性（7指標）/ 8. 収益性比率
// ---------------------------------------------------------------------------

test("財務健全性：7指標と運転資本", () => {
  const out = compute("soundness", {
    currentAssets: 8_000_000, quickAssets: 6_000_000, fixedAssets: 12_000_000, totalAssets: 20_000_000,
    currentLiabilities: 5_000_000, fixedLiabilities: 8_000_000, totalLiabilities: 13_000_000, netAssets: 8_000_000
  });
  approx(byLabel(out, "自己資本比率").value, 0.4); // 確定式：純資産÷資産合計
  approx(byLabel(out, "流動比率").value, 1.6);
  approx(byLabel(out, "当座比率").value, 1.2); // 6,000,000÷5,000,000
  approx(byLabel(out, "固定比率").value, 1.5);
  approx(byLabel(out, "固定長期適合率").value, 0.75); // 12,000,000÷(8,000,000+8,000,000)
  approx(byLabel(out, "負債比率").value, 13 / 8);
  assert.equal(byLabel(out, "運転資本").value, 3_000_000);
});

test("財務健全性：入力が無い項目は理由つきで出ない（推測で補わない）", () => {
  const out = compute("soundness", {
    currentAssets: null, quickAssets: null, fixedAssets: null, totalAssets: null,
    currentLiabilities: null, fixedLiabilities: null, totalLiabilities: null, netAssets: null
  });
  assert.ok(out.results.every((r) => r.value === null && r.reason));
});

test("収益性比率：4利益率・ROA（経常利益ベース）・必要利益", () => {
  const out = compute("profitability", {
    salesAmount: 100_000_000, grossProfit: 40_000_000, operatingProfit: 5_000_000,
    ordinaryProfit: 4_500_000, netProfit: 3_000_000, totalAssets: 60_000_000,
    targetOrdinaryMarginRatePercent: 6
  });
  approx(byLabel(out, "売上高総利益率").value, 0.4);
  approx(byLabel(out, "売上高営業利益率").value, 0.05);
  approx(byLabel(out, "売上高経常利益率").value, 0.045);
  approx(byLabel(out, "売上高当期純利益率").value, 0.03);
  approx(byLabel(out, "総資産経常利益率（ROA）").value, 0.075); // 確定式：経常利益÷総資産
  assert.equal(byLabel(out, "目標の経常利益率に必要な経常利益").value, 6_000_000); // 100,000,000×6%
  assert.equal(byLabel(out, "追加で必要な経常利益").value, 1_500_000); // max(0, 6,000,000-4,500,000)
});

// ---------------------------------------------------------------------------
// 9. 成長率（確定式一覧11章：基本式と条件）
// ---------------------------------------------------------------------------

test("成長率：売上高と経常利益の増減額・成長率", () => {
  const out = compute("growth", {
    previousSalesAmount: 100_000_000, currentSalesAmount: 121_000_000,
    previousOrdinaryProfit: 5_000_000, currentOrdinaryProfit: 6_000_000
  });
  assert.equal(byLabel(out, "売上高の増減額").value, 21_000_000);
  approx(byLabel(out, "売上高成長率").value, 0.21);
  assert.equal(byLabel(out, "経常利益の増減額").value, 1_000_000);
  approx(byLabel(out, "経常利益成長率").value, 0.2);
});

test("成長率：前期売上高が0の場合は売上高成長率を算出しない", () => {
  const out = compute("growth", {
    previousSalesAmount: 0, currentSalesAmount: 10_000_000,
    previousOrdinaryProfit: null, currentOrdinaryProfit: null
  });
  assert.equal(byLabel(out, "売上高の増減額").value, 10_000_000);
  assert.equal(byLabel(out, "売上高成長率").value, null);
});

test("成長率：経常利益が赤字を含む場合は成長率を出さず、増減額で見る", () => {
  const out = compute("growth", {
    previousSalesAmount: 100_000_000, currentSalesAmount: 110_000_000,
    previousOrdinaryProfit: -1_000_000, currentOrdinaryProfit: 2_000_000
  });
  assert.equal(byLabel(out, "経常利益の増減額").value, 3_000_000);
  const rate = byLabel(out, "経常利益成長率");
  assert.equal(rate.value, null);
  assert.ok(rate.reason.includes("黒字"));
});

// ---------------------------------------------------------------------------
// 10. 給与・雇用コスト（入力の単純集計）
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

  const margin100 = validateSimulation(pricing, {
    currentPrice: 1000, changedPrice: 1100, unitCost: 500, salesQuantity: 10,
    targetGrossMarginRatePercent: 100
  });
  assert.ok(margin100.some((e) => e.field === "targetGrossMarginRatePercent"));

  const badPercent = validateSimulation(SIMULATION_BY_ID.payroll, {
    employeeCount: 5, annualSalaryPerPerson: 4_000_000, socialInsuranceRatePercent: 120
  });
  assert.ok(badPercent.some((e) => e.field === "socialInsuranceRatePercent"));

  const fraction = validateSimulation(SIMULATION_BY_ID.payroll, {
    employeeCount: 2.5, annualSalaryPerPerson: 4_000_000, socialInsuranceRatePercent: 15
  });
  assert.ok(fraction.some((e) => e.field === "employeeCount"));

  const zeroInvestment = validateSimulation(SIMULATION_BY_ID.investment, {
    investmentAmount: 0, annualRevenue: 1_000_000
  });
  assert.ok(zeroInvestment.some((e) => e.field === "investmentAmount"));
});

test("Validation：繰上返済は月・金額・方式がそろわないとエラー", () => {
  const loan = SIMULATION_BY_ID.loan;
  const partial = validateSimulation(loan, {
    loanAmount: 1_000_000, interestRatePercent: 2, repaymentMonths: 36,
    repaymentMethod: "EQUAL_PAYMENT", prepaymentMonth: 10, prepaymentAmount: null, prepaymentType: ""
  });
  assert.ok(partial.some((e) => e.field === "prepaymentAmount"));
  assert.ok(partial.some((e) => e.field === "prepaymentType"));

  const badMonth = validateSimulation(loan, {
    loanAmount: 1_000_000, interestRatePercent: 2, repaymentMonths: 36,
    repaymentMethod: "EQUAL_PAYMENT", prepaymentMonth: 36, prepaymentAmount: 100_000, prepaymentType: "PERIOD_SHORTEN"
  });
  assert.ok(badMonth.some((e) => e.field === "prepaymentMonth"));
});

test("Validation：資金繰りの特定日予定は日と金額のペアが必須", () => {
  const cf = SIMULATION_BY_ID.cashflow;
  const errors = validateSimulation(cf, {
    cashBalance: 100_000, periodDays: 10, dailyCashIn: 0, dailyCashOut: 0,
    specialInDay1: 5, specialInAmount1: null
  });
  assert.ok(errors.some((e) => e.field === "specialInAmount1"));

  const over = validateSimulation(cf, {
    cashBalance: 100_000, periodDays: 10, dailyCashIn: 0, dailyCashOut: 0,
    specialOutDay1: 20, specialOutAmount1: 50_000
  });
  assert.ok(over.some((e) => e.field === "specialOutDay1"));
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
// 固定費 = 6,000,000 / 変動費 = 12,000,000 / 人件費合計 PL007 = 3,500,000
// 売上総利益 PL003 = 9,000,000 / 営業利益 PL017 = 2,000,000 / 経常利益 PL020 = 1,900,000

const BS_VALUES = {
  BS001: 5_000_000, BS002: 2_000_000, BS003: 1_000_000, BS004: 0,
  BS006: 10_000_000, BS007: 2_000_000, BS008: 0, BS009: 0, BS010: 0,
  BS013: 2_000_000, BS014: 1_000_000, BS015: 1_000_000, BS016: 1_000_000, BS017: 0,
  BS019: 8_000_000, BS020: 0, BS023: 3_000_000, BS024: 4_000_000, BS025: 0
};
// 流動資産 8,000,000 / 固定資産 12,000,000 / 資産合計 20,000,000
// 流動負債 5,000,000 / 固定負債 8,000,000 / 負債合計 13,000,000 / 純資産 7,000,000
// 当座資産（初期値）= BS001+BS002+BS003 = 8,000,000

function standardCompany() {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD_VALUES }, bsValues: { ...BS_VALUES }
  }));
  return company;
}

test("初期値：年次標準登録から損益分岐点・人件費・収益性の初期値が入る", () => {
  const company = standardCompany();

  const be = resolveSimInitialValues(company, "break-even");
  assert.equal(be.values.salesAmount, 20_000_000);
  assert.equal(be.values.variableCosts, 12_000_000);
  assert.equal(be.values.fixedCosts, 6_000_000);
  assert.ok(be.sourceNote.includes("年次登録"));

  const labor = resolveSimInitialValues(company, "labor");
  assert.equal(labor.values.currentLaborCosts, 3_500_000);
  assert.equal(labor.values.grossProfit, 9_000_000);

  const profit = resolveSimInitialValues(company, "profitability");
  assert.equal(profit.values.grossProfit, 9_000_000);
  assert.equal(profit.values.operatingProfit, 2_000_000);
  assert.equal(profit.values.ordinaryProfit, 1_900_000);
  assert.equal(profit.values.totalAssets, 20_000_000);
});

test("初期値：B/S登録から健全性・資金繰りの初期値が入る", () => {
  const company = standardCompany();
  const sound = resolveSimInitialValues(company, "soundness");
  assert.equal(sound.values.currentAssets, 8_000_000);
  assert.equal(sound.values.quickAssets, 8_000_000);
  assert.equal(sound.values.fixedLiabilities, 8_000_000);
  assert.equal(sound.values.totalLiabilities, 13_000_000);
  assert.equal(sound.values.netAssets, 7_000_000);

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
  assert.equal(be.values.variableCosts, 8_400_000);
  assert.equal(be.values.fixedCosts, 3_600_000);
  assert.ok(be.sourceNote.includes("月次12か月分"));

  const labor = resolveSimInitialValues(company, "labor");
  assert.equal(labor.values.currentLaborCosts, 2_400_000); // M003×12
  assert.equal(labor.values.grossProfit, 4_800_000); // M101×12
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
  assert.equal(profit.values.grossProfit, undefined);
  assert.equal(profit.values.totalAssets, undefined);
});

test("初期値：成長率は2期分の売上高と経常利益から入る", () => {
  const company = createCompany({ closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2024-04-01", endDate: "2025-03-31", displayName: "2025年3月期",
    stage: "STANDARD", values: { ...STANDARD_VALUES, PL001: 18_000_000 }
  }));
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD_VALUES }
  }));
  const growth = resolveSimInitialValues(company, "growth");
  assert.equal(growth.values.previousSalesAmount, 18_000_000);
  assert.equal(growth.values.currentSalesAmount, 20_000_000);
  // 経常利益：前期は PL017(=18,000,000-11,000,000-7,000,000=0)+0-100,000 = -100,000、今期は 1,900,000
  assert.equal(growth.values.previousOrdinaryProfit, -100_000);
  assert.equal(growth.values.currentOrdinaryProfit, 1_900_000);

  // 初期値のまま計算すると、売上高成長率が出て、経常利益成長率は赤字のため出ない
  const out = computeSimulation(SIMULATION_BY_ID.growth, { ...growth.values });
  approx(byLabel(out, "売上高成長率").value, 2 / 18, 1e-9);
  assert.equal(byLabel(out, "経常利益成長率").value, null);
});

test("初期値：会社が無ければ空（手入力のみ）", () => {
  const empty = resolveSimInitialValues(null, "break-even");
  assert.deepEqual(empty.values, {});
  assert.equal(empty.sourceNote, null);
});
