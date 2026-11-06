import { FIXED_COST_CODES } from "../data/fields.js";
import {
  buildMonthlyAggregate,
  getAnnualFigures,
  getBSFigures,
  listFiscalKeys
} from "./calc.js";

// 試算（簡易シミュレーション）正式10種の計算エンジン。
// 計算式の正本は business-tool2-2 の formulas（12の共通計算エンジン）の考え方で、
// 業績ダイジェストの流儀（無い数字は推測で補わない、出せない結果は理由を返す）に合わせて実装し直したもの。
// 試算の入力は保存しない（その場限りの計算）。
//
// values の約束：
// - 金額（kind: "amount"）は円単位の数値
// - 割合（kind: "percent"）はパーセント値（例：15 は 15%）
// - 件数・月数（kind: "integer"）、年数など（kind: "number"）はそのままの数値
// - 選択（kind: "select"）は文字列
// - 未入力は null

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function roundYen(value) {
  return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
}

function ratio(numerator, denominator) {
  return numerator / denominator;
}

// 結果1件。value が null のときは reason を添えて「―」表示にする。
function result(label, hint, format, value, reason = null, unit = "") {
  return { label, hint, format, value: isNum(value) ? value : null, reason, unit };
}

function missingReason(labels) {
  return `${labels.join("・")}を入力すると表示されます`;
}

// ---------------------------------------------------------------------------
// 価格（pricing エンジン）
// 売上総利益 ＝（価格 − 1単位原価）× 販売数量
// ---------------------------------------------------------------------------

function computePricing(v) {
  const cuc = isNum(v.changedUnitCost) ? v.changedUnitCost : v.unitCost;
  const eqty = isNum(v.expectedQuantityAfterPriceChange) ? v.expectedQuantityAfterPriceChange : v.salesQuantity;
  const currentGP = (v.currentPrice - v.unitCost) * v.salesQuantity;
  const afterGP = (v.changedPrice - cuc) * eqty;

  const results = [
    result("今の売上総利益", "（今の価格 − 原価）× 販売数量", "yen", roundYen(currentGP)),
    result("変更後の売上総利益", "（変更後の価格 − 原価）× 想定の販売数量", "yen", roundYen(afterGP)),
    result("売上総利益の増減", "変更後 − 今", "diff", roundYen(afterGP - currentGP))
  ];

  const denom = v.changedPrice - v.unitCost;
  if (currentGP <= 0) {
    results.push(result("今の粗利益を保つのに必要な販売数量", "価格を変えたあと、今と同じ粗利益を得るために必要な個数", "count", null,
      "今の売上総利益が0以下のため、維持に必要な数量は計算できません", "個"));
  } else if (denom <= 0) {
    results.push(result("今の粗利益を保つのに必要な販売数量", "価格を変えたあと、今と同じ粗利益を得るために必要な個数", "count", null,
      "変更後価格が原価以下のため、数量を増やしても今の粗利益には届きません", "個"));
  } else {
    results.push(result("今の粗利益を保つのに必要な販売数量", "価格を変えたあと、今と同じ粗利益を得るために必要な個数", "count",
      Math.ceil(ratio(currentGP, denom)), null, "個"));
  }

  if (isNum(v.changedUnitCost)) {
    results.push(result("原価の上昇分を反映した価格", "1単位の粗利益の額を今と同じに保つ価格", "yen",
      roundYen(v.changedUnitCost + (v.currentPrice - v.unitCost))));
  } else {
    results.push(result("原価の上昇分を反映した価格", "1単位の粗利益の額を今と同じに保つ価格", "yen", null,
      missingReason(["変更後の1単位原価"])));
  }

  if (isNum(v.targetGrossMarginRatePercent)) {
    results.push(result("目標の粗利益率になる価格", "原価に対して、目標の粗利益率を確保できる価格", "yen",
      roundYen(ratio(v.unitCost, 1 - v.targetGrossMarginRatePercent / 100))));
  } else {
    results.push(result("目標の粗利益率になる価格", "原価に対して、目標の粗利益率を確保できる価格", "yen", null,
      missingReason(["目標粗利益率"])));
  }

  const detailKeys = ["fixedCostsExcludingLabor", "laborCosts", "otherVariableCosts", "targetOperatingProfit"];
  const detailLabels = { fixedCostsExcludingLabor: "人件費を除く固定費", laborCosts: "人件費", otherVariableCosts: "その他変動費", targetOperatingProfit: "目標営業利益" };
  const missingDetail = detailKeys.filter((k) => !isNum(v[k]));
  if (missingDetail.length === 0) {
    const price = ratio(
      v.unitCost * v.salesQuantity + v.fixedCostsExcludingLabor + v.laborCosts + v.otherVariableCosts + v.targetOperatingProfit,
      v.salesQuantity
    );
    results.push(result("目標営業利益に必要な価格", "予定の数量を売って目標の営業利益に届く価格", "yen", roundYen(price)));
  } else {
    results.push(result("目標営業利益に必要な価格", "予定の数量を売って目標の営業利益に届く価格", "yen", null,
      missingReason(missingDetail.map((k) => detailLabels[k]))));
  }

  return {
    results,
    tables: [],
    basis: [
      "売上総利益 ＝（価格 − 1単位原価）× 販売数量",
      "必要な販売数量 ＝ 今の売上総利益 ÷（変更後価格 − 1単位原価）を切り上げ",
      "原価の上昇分を反映した価格 ＝ 変更後の原価 ＋（今の価格 − 今の原価）",
      "目標の粗利益率になる価格 ＝ 1単位原価 ÷（1 − 目標粗利益率）",
      "目標営業利益に必要な価格 ＝（原価 × 数量 ＋ 人件費を除く固定費 ＋ 人件費 ＋ その他変動費 ＋ 目標営業利益）÷ 数量"
    ],
    notes: isNum(v.changedUnitCost) ? [] : ["変更後の1単位原価が未入力の項目は、今の原価のままで計算しています。"]
  };
}

// ---------------------------------------------------------------------------
// 損益分岐点（break-even エンジン）
// 限界利益率 ＝（売上高 − 変動費）÷ 売上高、損益分岐点売上高 ＝ 固定費 ÷ 限界利益率
// ---------------------------------------------------------------------------

function marginalRate(sales, variableCosts) {
  if (!isNum(sales) || sales <= 0) return null;
  return ratio(sales - variableCosts, sales);
}

function computeBreakEven(v) {
  const marginalProfit = v.salesAmount - v.variableCosts;
  const rate = marginalRate(v.salesAmount, v.variableCosts);
  const bep = rate !== null && rate > 0 ? ratio(v.fixedCosts, rate) : null;

  const results = [
    result("限界利益", "売上から変動費を引いた、固定費の回収と利益のもとになる金額", "yen", roundYen(marginalProfit)),
    result("限界利益率", "売上のうち、固定費の回収と利益に回せる割合", "percent", rate,
      rate === null ? "売上高が0のため、割合は計算できません" : null)
  ];

  if (bep !== null) {
    results.push(result("損益分岐点の売上高", "営業利益がちょうど0になる売上（赤字にならない最低限の売上）", "yen", roundYen(bep)));
    results.push(result("安全余裕率", "売上が損益分岐点からどれだけ離れているか", "percent",
      ratio(v.salesAmount - bep, v.salesAmount)));
  } else {
    const reason = "限界利益率が0以下のため計算できません。変動費が売上以上になっている状態です";
    results.push(result("損益分岐点の売上高", "営業利益がちょうど0になる売上（赤字にならない最低限の売上）", "yen", null, reason));
    results.push(result("安全余裕率", "売上が損益分岐点からどれだけ離れているか", "percent", null, reason));
  }

  if (isNum(v.targetOperatingProfit)) {
    if (bep !== null) {
      const required = ratio(v.fixedCosts + v.targetOperatingProfit, rate);
      results.push(result("目標に必要な売上高", "目標の営業利益に届くために必要な売上", "yen", roundYen(required)));
      results.push(result("あといくら必要か", "必要な売上高と、今の売上との差", "diff", roundYen(required - v.salesAmount)));
    } else {
      const reason = "限界利益率が0以下のため計算できません";
      results.push(result("目標に必要な売上高", "目標の営業利益に届くために必要な売上", "yen", null, reason));
      results.push(result("あといくら必要か", "必要な売上高と、今の売上との差", "diff", null, reason));
    }
  } else {
    results.push(result("目標に必要な売上高", "目標の営業利益に届くために必要な売上", "yen", null, missingReason(["目標営業利益"])));
    results.push(result("あといくら必要か", "必要な売上高と、今の売上との差", "diff", null, missingReason(["目標営業利益"])));
  }

  return {
    results,
    tables: [],
    basis: [
      "限界利益 ＝ 売上高 − 変動費",
      "限界利益率 ＝ 限界利益 ÷ 売上高",
      "損益分岐点の売上高 ＝ 固定費 ÷ 限界利益率",
      "安全余裕率 ＝（売上高 − 損益分岐点の売上高）÷ 売上高",
      "目標に必要な売上高 ＝（固定費 ＋ 目標営業利益）÷ 限界利益率"
    ],
    notes: ["この試算は、その場で入力した数字だけで計算します。「目標と進捗」画面の損益分岐点（登録した決算の数字から自動で計算する表示）とは別物です。"]
  };
}

// ---------------------------------------------------------------------------
// 人件費（labor-cost エンジン）
// ---------------------------------------------------------------------------

function computeLabor(v) {
  const additionalSalary = v.expectedSalaryPerPerson * v.plannedHireCount;
  const insurance = additionalSalary * (v.socialInsuranceRatePercent / 100);
  const additionalLabor = additionalSalary + insurance;

  const results = [
    result("追加の給与（年間）", "1人当たりの想定給与 × 採用予定人数", "yen", roundYen(additionalSalary)),
    result("社会保険料の概算（年間）", "追加の給与 × 社会保険料率（会社負担分の目安）", "yen", roundYen(insurance)),
    result("年間追加人件費", "追加の給与と社会保険料の合計", "yen", roundYen(additionalLabor))
  ];

  if (isNum(v.currentLaborCosts)) {
    results.push(result("採用後の人件費（年間）", "今の人件費 ＋ 年間追加人件費", "yen", roundYen(v.currentLaborCosts + additionalLabor)));
  } else {
    results.push(result("採用後の人件費（年間）", "今の人件費 ＋ 年間追加人件費", "yen", null, missingReason(["今の人件費"])));
  }

  const rate = isNum(v.marginalProfitRatePercent) ? v.marginalProfitRatePercent / 100 : null;
  if (rate !== null && rate > 0) {
    results.push(result("追加人件費をまかなうのに必要な追加売上", "年間追加人件費 ÷ 限界利益率", "yen",
      roundYen(ratio(additionalLabor, rate))));
  } else {
    results.push(result("追加人件費をまかなうのに必要な追加売上", "年間追加人件費 ÷ 限界利益率", "yen", null,
      isNum(v.marginalProfitRatePercent) ? "限界利益率が0のため計算できません" : missingReason(["限界利益率"])));
  }

  const needForProfit = [
    ["currentOperatingProfit", "今の営業利益"],
    ["expectedAdditionalSales", "採用後に見込む年間追加売上"],
    ["marginalProfitRatePercent", "限界利益率"]
  ];
  const missingProfit = needForProfit.filter(([k]) => !isNum(v[k])).map(([, label]) => label);
  if (missingProfit.length === 0) {
    const after = v.currentOperatingProfit + v.expectedAdditionalSales * rate - additionalLabor;
    results.push(result("採用後の営業利益", "今の営業利益 ＋ 追加売上の限界利益 − 年間追加人件費", "yen", roundYen(after)));
  } else {
    results.push(result("採用後の営業利益", "今の営業利益 ＋ 追加売上の限界利益 − 年間追加人件費", "yen", null,
      missingReason(missingProfit)));
  }

  return {
    results,
    tables: [],
    basis: [
      "追加の給与 ＝ 1人当たりの想定給与 × 採用予定人数",
      "社会保険料の概算 ＝ 追加の給与 × 社会保険料率",
      "採用後の営業利益 ＝ 今の営業利益 ＋（追加売上 × 限界利益率）− 年間追加人件費"
    ],
    notes: ["社会保険料率は概算です。実際の料率は、加入する保険や地域によって変わります。"]
  };
}

// ---------------------------------------------------------------------------
// 借入返済（loan-repayment エンジン）
// 元利均等：毎月の返済額は一定。元金均等：毎月の元金が一定。
// ---------------------------------------------------------------------------

function equalPaymentAmount(loanAmount, annualRate, months) {
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return loanAmount / months;
  const factor = (1 + monthlyRate) ** months;
  return (loanAmount * monthlyRate * factor) / (factor - 1);
}

function buildSchedule(loanAmount, annualRate, months, method) {
  const monthlyRate = annualRate / 12;
  const regularPayment = method === "EQUAL_PAYMENT"
    ? roundYen(equalPaymentAmount(loanAmount, annualRate, months))
    : null;
  const regularPrincipal = method === "EQUAL_PRINCIPAL" ? roundYen(loanAmount / months) : null;
  const schedule = [];
  let balance = loanAmount;
  for (let month = 1; month <= months; month += 1) {
    const interest = roundYen(balance * monthlyRate);
    const isLast = month === months;
    let principal;
    if (method === "EQUAL_PAYMENT") {
      principal = isLast ? balance : Math.min(balance, Math.max(0, regularPayment - interest));
    } else {
      principal = isLast ? balance : Math.min(balance, regularPrincipal);
    }
    const payment = principal + interest;
    balance = Math.max(0, balance - principal);
    schedule.push({ month, principal, interest, payment, balance });
  }
  return schedule;
}

function computeLoan(v) {
  const annualRate = v.interestRatePercent / 100;
  const schedule = buildSchedule(v.loanAmount, annualRate, v.repaymentMonths, v.repaymentMethod);
  const annualPayment = schedule.slice(0, 12).reduce((s, row) => s + row.payment, 0);
  const totalPayment = schedule.reduce((s, row) => s + row.payment, 0);
  const totalInterest = schedule.reduce((s, row) => s + row.interest, 0);

  const results = [
    result("毎月の返済額（初回）", v.repaymentMethod === "EQUAL_PAYMENT" ? "元利均等では、毎月ほぼ同じ額です" : "元金均等では、初回が最も大きく、少しずつ減ります", "yen", schedule[0]?.payment ?? null),
    result("年間返済額", "最初の12か月分の返済額の合計", "yen", annualPayment),
    result("返済総額", "返済期間全体の返済額の合計", "yen", totalPayment),
    result("利息の総額", "返済総額のうち、利息の部分", "yen", totalInterest)
  ];

  if (isNum(v.annualPreDebtServiceCashFlow)) {
    if (annualPayment > 0) {
      results.push(result("年間返済額に対するキャッシュ倍率", "返済に使える年間のお金が、年間返済額の何倍あるか", "times",
        ratio(v.annualPreDebtServiceCashFlow, annualPayment)));
    } else {
      results.push(result("年間返済額に対するキャッシュ倍率", "返済に使える年間のお金が、年間返済額の何倍あるか", "times", null,
        "年間返済額が0のため計算できません"));
    }
  } else {
    results.push(result("年間返済額に対するキャッシュ倍率", "返済に使える年間のお金が、年間返済額の何倍あるか", "times", null,
      missingReason(["年間返済前キャッシュフロー"])));
  }

  const debtKeys = [
    ["shortTermBorrowings", "短期借入金"],
    ["longTermBorrowings", "長期借入金"],
    ["operatingProfit", "営業利益"],
    ["depreciation", "減価償却費"]
  ];
  const missingDebt = debtKeys.filter(([k]) => !isNum(v[k])).map(([, label]) => label);
  if (missingDebt.length === 0) {
    const totalDebt = v.shortTermBorrowings + v.longTermBorrowings;
    const repaymentCash = v.operatingProfit + v.depreciation;
    if (repaymentCash > 0) {
      results.push(result("簡易債務償還年数", "今の利益と減価償却費で、借入金を返すのにかかる年数の目安", "years",
        ratio(totalDebt, repaymentCash)));
    } else {
      results.push(result("簡易債務償還年数", "今の利益と減価償却費で、借入金を返すのにかかる年数の目安", "years", null,
        "営業利益と減価償却費の合計が0以下のため計算できません"));
    }
  } else {
    results.push(result("簡易債務償還年数", "今の利益と減価償却費で、借入金を返すのにかかる年数の目安", "years", null,
      missingReason(missingDebt)));
  }

  const rows = schedule.slice(0, 12).map((row) => [row.month, row.principal, row.interest, row.payment, row.balance]);
  return {
    results,
    tables: [{
      title: v.repaymentMonths > 12 ? "返済表（最初の12か月）" : "返済表",
      columns: [
        { label: "月", format: "month" },
        { label: "元金", format: "yen" },
        { label: "利息", format: "yen" },
        { label: "返済額", format: "yen" },
        { label: "残高", format: "yen" }
      ],
      rows
    }],
    basis: [
      "元利均等：毎月の返済額を一定にする方式。利息は、その月の残高 ×（年利 ÷ 12）",
      "元金均等：毎月の元金を一定にする方式。利息は、その月の残高 ×（年利 ÷ 12）",
      "キャッシュ倍率 ＝ 年間返済前キャッシュフロー ÷ 年間返済額",
      "簡易債務償還年数 ＝（短期借入金 ＋ 長期借入金）÷（営業利益 ＋ 減価償却費）"
    ],
    notes: ["利息は月割りで計算した概算です。実際の返済額は、金融機関の計算（日割りなど）と少し違う場合があります。"]
  };
}

// ---------------------------------------------------------------------------
// 投資回収・利回り（investment-return エンジン）
// ---------------------------------------------------------------------------

function computeInvestment(v) {
  const running = isNum(v.annualRunningCost) ? v.annualRunningCost : 0;
  const results = [];

  if (isNum(v.annualIncrementalCashFlow)) {
    if (v.annualIncrementalCashFlow > 0) {
      results.push(result("回収年数", "投資額 ÷ 年間増分キャッシュフロー", "years",
        ratio(v.investmentAmount, v.annualIncrementalCashFlow)));
    } else {
      results.push(result("回収年数", "投資額 ÷ 年間増分キャッシュフロー", "years", null,
        "年間増分キャッシュフローが0のため、回収年数は計算できません"));
    }
  } else {
    results.push(result("回収年数", "投資額 ÷ 年間増分キャッシュフロー", "years", null,
      missingReason(["年間増分キャッシュフロー"])));
  }

  const hasBeforeAfter = isNum(v.annualOperatingProfitBeforeInvestment) && isNum(v.annualOperatingProfitAfterInvestment);
  let incrementalProfit = null;
  if (hasBeforeAfter) {
    incrementalProfit = v.annualOperatingProfitAfterInvestment - v.annualOperatingProfitBeforeInvestment - running;
    results.push(result("増分営業利益（年間）", "投資後の営業利益 − 投資前の営業利益 − ランニングコスト", "yen", roundYen(incrementalProfit)));
  } else {
    results.push(result("増分営業利益（年間）", "投資後の営業利益 − 投資前の営業利益 − ランニングコスト", "yen", null,
      missingReason([
        ...(!isNum(v.annualOperatingProfitBeforeInvestment) ? ["投資前の年間営業利益"] : []),
        ...(!isNum(v.annualOperatingProfitAfterInvestment) ? ["投資後の年間営業利益"] : [])
      ])));
  }

  if (incrementalProfit !== null) {
    if (v.investmentAmount > 0) {
      results.push(result("利回り（年間増分営業利益率）", "増分営業利益 ÷ 投資額", "percent",
        ratio(incrementalProfit, v.investmentAmount)));
    } else {
      results.push(result("利回り（年間増分営業利益率）", "増分営業利益 ÷ 投資額", "percent", null,
        "投資額が0のため計算できません"));
    }
  } else {
    results.push(result("利回り（年間増分営業利益率）", "増分営業利益 ÷ 投資額", "percent", null,
      "増分営業利益が計算できると表示されます"));
  }

  if (isNum(v.targetPaybackYears)) {
    results.push(result("目標年数で回収するために必要な年間営業利益", "投資額 ÷ 目標回収年数", "yen",
      roundYen(ratio(v.investmentAmount, v.targetPaybackYears))));
  } else {
    results.push(result("目標年数で回収するために必要な年間営業利益", "投資額 ÷ 目標回収年数", "yen", null,
      missingReason(["目標回収年数"])));
  }

  return {
    results,
    tables: [],
    basis: [
      "回収年数 ＝ 投資額 ÷ 年間増分キャッシュフロー",
      "増分営業利益 ＝ 投資後の年間営業利益 − 投資前の年間営業利益 − 年間ランニングコスト",
      "利回り ＝ 増分営業利益 ÷ 投資額"
    ],
    notes: ["増分キャッシュフローと増分営業利益は別の数字です。回収年数はお金の増え方、利回りは利益の増え方で見ます。"]
  };
}

// ---------------------------------------------------------------------------
// 資金繰り（cash-flow エンジン、簡易の目安）
// ---------------------------------------------------------------------------

function computeCashFlow(v) {
  const loanPayment = isNum(v.monthlyLoanPayment) ? v.monthlyLoanPayment : 0;
  const netOutflow = v.monthlyCashOut + loanPayment - v.monthlyCashIn;
  const months = isNum(v.projectionMonths) ? v.projectionMonths : 6;

  const results = [
    result("1か月の純減額（目安）", "キャッシュアウト ＋ 返済支出 − キャッシュイン", "yen", roundYen(netOutflow))
  ];
  if (netOutflow > 0) {
    results.push(result("資金余命（目安）", "今の現預金 ÷ 1か月の純減額。今の収支が続いた場合に、何か月で現預金が尽きるか", "months",
      ratio(v.cashBalance, netOutflow)));
  } else {
    results.push(result("資金余命（目安）", "今の現預金 ÷ 1か月の純減額", "months", null,
      "今の収支では現預金は減らない計算のため、余命は表示されません"));
  }

  const rows = [];
  for (let m = 1; m <= months; m += 1) {
    rows.push([m, roundYen(v.cashBalance - netOutflow * m)]);
  }

  return {
    results,
    tables: [{
      title: `現預金の残高の推移（目安、${months}か月）`,
      columns: [
        { label: "経過月", format: "month" },
        { label: "残高（目安）", format: "yen" }
      ],
      rows
    }],
    basis: [
      "1か月の純減額 ＝ 月間キャッシュアウト ＋ 月間返済支出 − 月間キャッシュイン",
      "資金余命 ＝ 現在の現預金 ÷ 1か月の純減額",
      "残高（目安）＝ 現在の現預金 − 1か月の純減額 × 経過月"
    ],
    notes: ["入力した月の収支が、そのまま続くという仮定の目安です。実際の入出金の時期によって変わります。将来の予測ではなく、目安として見てください。"]
  };
}

// ---------------------------------------------------------------------------
// 財務健全性・収益性比率（financial-analysis エンジン）
// ---------------------------------------------------------------------------

function computeSoundness(v) {
  const results = [
    result("自己資本比率", "資産合計のうち、返さなくてよいお金（純資産）の割合", "percent",
      isNum(v.netAssets) && isNum(v.totalAssets) && v.totalAssets !== 0 ? ratio(v.netAssets, v.totalAssets) : null,
      !isNum(v.netAssets) || !isNum(v.totalAssets) ? missingReason([
        ...(!isNum(v.netAssets) ? ["純資産"] : []), ...(!isNum(v.totalAssets) ? ["資産合計"] : [])
      ]) : "資産合計が0のため計算できません"),
    result("流動比率", "1年以内の負債に対して、1年以内の資産がどれだけあるか", "percent",
      isNum(v.currentAssets) && isNum(v.currentLiabilities) && v.currentLiabilities !== 0 ? ratio(v.currentAssets, v.currentLiabilities) : null,
      !isNum(v.currentAssets) || !isNum(v.currentLiabilities) ? missingReason([
        ...(!isNum(v.currentAssets) ? ["流動資産"] : []), ...(!isNum(v.currentLiabilities) ? ["流動負債"] : [])
      ]) : "流動負債が0のため計算できません"),
    result("固定比率", "固定資産が純資産の何倍あるか", "percent",
      isNum(v.fixedAssets) && isNum(v.netAssets) && v.netAssets !== 0 ? ratio(v.fixedAssets, v.netAssets) : null,
      !isNum(v.fixedAssets) || !isNum(v.netAssets) ? missingReason([
        ...(!isNum(v.fixedAssets) ? ["固定資産"] : []), ...(!isNum(v.netAssets) ? ["純資産"] : [])
      ]) : "純資産が0のため計算できません"),
    result("負債比率", "負債合計が純資産の何倍あるか", "percent",
      isNum(v.totalLiabilities) && isNum(v.netAssets) && v.netAssets !== 0 ? ratio(v.totalLiabilities, v.netAssets) : null,
      !isNum(v.totalLiabilities) || !isNum(v.netAssets) ? missingReason([
        ...(!isNum(v.totalLiabilities) ? ["負債合計"] : []), ...(!isNum(v.netAssets) ? ["純資産"] : [])
      ]) : "純資産が0のため計算できません"),
    result("運転資本", "流動資産 − 流動負債。日々の運転に回せるお金の目安", "yen",
      isNum(v.currentAssets) && isNum(v.currentLiabilities) ? roundYen(v.currentAssets - v.currentLiabilities) : null,
      missingReason([
        ...(!isNum(v.currentAssets) ? ["流動資産"] : []), ...(!isNum(v.currentLiabilities) ? ["流動負債"] : [])
      ]))
  ];
  return {
    results,
    tables: [],
    basis: [
      "自己資本比率 ＝ 純資産 ÷ 資産合計",
      "流動比率 ＝ 流動資産 ÷ 流動負債",
      "固定比率 ＝ 固定資産 ÷ 純資産",
      "負債比率 ＝ 負債合計 ÷ 純資産",
      "運転資本 ＝ 流動資産 − 流動負債"
    ],
    notes: ["割合の目安は業種によって大きく違います。ここでは数字だけを示し、良い・悪いの判定はしません。"]
  };
}

function computeProfitability(v) {
  const margin = (label, hint, profitKey, profitLabel) => result(label, hint, "percent",
    isNum(v[profitKey]) && isNum(v.salesAmount) && v.salesAmount !== 0 ? ratio(v[profitKey], v.salesAmount) : null,
    !isNum(v[profitKey]) || !isNum(v.salesAmount) ? missingReason([
      ...(!isNum(v[profitKey]) ? [profitLabel] : []), ...(!isNum(v.salesAmount) ? ["売上高"] : [])
    ]) : "売上高が0のため計算できません");

  const results = [
    margin("売上高営業利益率", "売上に対して、本業の利益がどれだけ残るか", "operatingProfit", "営業利益"),
    margin("売上高経常利益率", "売上に対して、通常の活動全体の利益がどれだけ残るか", "ordinaryProfit", "経常利益"),
    margin("売上高当期純利益率", "売上に対して、最終利益がどれだけ残るか", "netProfit", "当期純利益"),
    result("総資産当期純利益率（ROA）", "資産合計に対して、最終利益がどれだけ生まれたか", "percent",
      isNum(v.netProfit) && isNum(v.totalAssets) && v.totalAssets !== 0 ? ratio(v.netProfit, v.totalAssets) : null,
      !isNum(v.netProfit) || !isNum(v.totalAssets) ? missingReason([
        ...(!isNum(v.netProfit) ? ["当期純利益"] : []), ...(!isNum(v.totalAssets) ? ["資産合計"] : [])
      ]) : "資産合計が0のため計算できません"),
    result("自己資本当期純利益率（ROE）", "純資産に対して、最終利益がどれだけ生まれたか", "percent",
      isNum(v.netProfit) && isNum(v.netAssets) && v.netAssets !== 0 ? ratio(v.netProfit, v.netAssets) : null,
      !isNum(v.netProfit) || !isNum(v.netAssets) ? missingReason([
        ...(!isNum(v.netProfit) ? ["当期純利益"] : []), ...(!isNum(v.netAssets) ? ["純資産"] : [])
      ]) : "純資産が0のため計算できません"),
    result("総資産回転率", "資産合計に対して、売上が何倍あるか（資産の使い方の目安）", "times",
      isNum(v.salesAmount) && isNum(v.totalAssets) && v.totalAssets !== 0 ? ratio(v.salesAmount, v.totalAssets) : null,
      !isNum(v.salesAmount) || !isNum(v.totalAssets) ? missingReason([
        ...(!isNum(v.salesAmount) ? ["売上高"] : []), ...(!isNum(v.totalAssets) ? ["資産合計"] : [])
      ]) : "資産合計が0のため計算できません")
  ];
  return {
    results,
    tables: [],
    basis: [
      "売上高○○利益率 ＝ 各利益 ÷ 売上高",
      "総資産当期純利益率 ＝ 当期純利益 ÷ 資産合計",
      "自己資本当期純利益率 ＝ 当期純利益 ÷ 純資産",
      "総資産回転率 ＝ 売上高 ÷ 資産合計"
    ],
    notes: ["割合の目安は業種によって大きく違います。ここでは数字だけを示し、良い・悪いの判定はしません。"]
  };
}

// ---------------------------------------------------------------------------
// 成長率（growth エンジン、比較を含む）
// 年平均成長率の年数は、期末日の実日数（ACT/ACT）で数える。
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function anniversary(source, yearOffset) {
  const year = source.getUTCFullYear() + yearOffset;
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay)));
}

export function elapsedYearsActAct(sourcePeriodEnd, targetPeriodEnd) {
  const source = utcDate(sourcePeriodEnd);
  const target = utcDate(targetPeriodEnd);
  let fullYears = target.getUTCFullYear() - source.getUTCFullYear();
  if (anniversary(source, fullYears) > target) fullYears -= 1;
  const currentAnniversary = anniversary(source, fullYears);
  const nextAnniversary = anniversary(source, fullYears + 1);
  const remainingDays = (target - currentAnniversary) / DAY_MS;
  const intervalDays = (nextAnniversary - currentAnniversary) / DAY_MS;
  return fullYears + remainingDays / intervalDays;
}

function computeGrowth(v) {
  const results = [
    result("増減額", "今期の金額 − 前期の金額", "diff", roundYen(v.currentValue - v.previousValue)),
    result("成長率", "増減額 ÷ 前期の金額", "percent",
      v.previousValue !== 0 ? ratio(v.currentValue - v.previousValue, v.previousValue) : null,
      "前期の金額が0のため、成長率は計算できません")
  ];

  const cagrKeys = [["initialValue", "最初の金額"], ["finalValue", "最後の金額"], ["years", "年数"]];
  const missingCagr = cagrKeys.filter(([k]) => !isNum(v[k])).map(([, label]) => label);
  if (missingCagr.length === 0) {
    if (v.initialValue > 0 && v.finalValue >= 0 && v.years > 0) {
      results.push(result("年平均成長率", "複数年の変化を、1年あたりの平均の伸びに直した割合", "percent",
        (v.finalValue / v.initialValue) ** (1 / v.years) - 1));
    } else {
      results.push(result("年平均成長率", "複数年の変化を、1年あたりの平均の伸びに直した割合", "percent", null,
        "最初の金額が0以下、または年数が0以下のため計算できません"));
    }
  } else {
    results.push(result("年平均成長率", "複数年の変化を、1年あたりの平均の伸びに直した割合", "percent", null,
      missingReason(missingCagr)));
  }

  return {
    results,
    tables: [],
    basis: [
      "増減額 ＝ 今期の金額 − 前期の金額",
      "成長率 ＝ 増減額 ÷ 前期の金額",
      "年平均成長率 ＝（最後の金額 ÷ 最初の金額）^（1 ÷ 年数）− 1"
    ],
    notes: ["金額は、売上高でも利益でも、比べたい数字をそのまま入れられます。登録データがある会社では、初期値に売上高が入ります。"]
  };
}

// ---------------------------------------------------------------------------
// 給与・雇用コスト（labor-cost エンジン）
// ---------------------------------------------------------------------------

function computePayroll(v) {
  const salaryTotal = v.annualSalaryPerPerson * v.employeeCount;
  const insurance = salaryTotal * (v.socialInsuranceRatePercent / 100);
  const otherTotal = (isNum(v.otherCostPerPerson) ? v.otherCostPerPerson : 0) * v.employeeCount;
  const total = salaryTotal + insurance + otherTotal;

  return {
    results: [
      result("年間給与総額", "1人当たりの年間給与 × 従業員数", "yen", roundYen(salaryTotal)),
      result("社会保険料の概算（年間）", "年間給与総額 × 社会保険料率（会社負担分の目安）", "yen", roundYen(insurance)),
      result("その他の経費の合計（年間）", "1人当たりのその他の経費 × 従業員数", "yen", roundYen(otherTotal)),
      result("年間雇用コスト合計", "給与総額 ＋ 社会保険料 ＋ その他の経費", "yen", roundYen(total)),
      result("1人当たりの年間雇用コスト", "年間雇用コスト合計 ÷ 従業員数", "yen", roundYen(ratio(total, v.employeeCount))),
      result("月額換算（会社全体）", "年間雇用コスト合計 ÷ 12", "yen", roundYen(ratio(total, 12)))
    ],
    tables: [],
    basis: [
      "年間給与総額 ＝ 1人当たりの年間給与 × 従業員数",
      "社会保険料の概算 ＝ 年間給与総額 × 社会保険料率",
      "年間雇用コスト合計 ＝ 年間給与総額 ＋ 社会保険料の概算 ＋ その他の経費"
    ],
    notes: ["社会保険料率は概算です。実際の料率は、加入する保険や地域、年齢などによって変わります。賞与は、1人当たりの年間給与に含めて入力してください。"]
  };
}

// ---------------------------------------------------------------------------
// 正式10種の定義（総整理 4章の正式構成。名称・順序・件数を維持する）
// ---------------------------------------------------------------------------

const amount = (id, label, hint, options = {}) => ({ id, label, hint, kind: "amount", ...options });
const integer = (id, label, hint, options = {}) => ({ id, label, hint, kind: "integer", ...options });
const number = (id, label, hint, options = {}) => ({ id, label, hint, kind: "number", ...options });
const percent = (id, label, hint, options = {}) => ({ id, label, hint, kind: "percent", ...options });

export const SIMULATIONS = Object.freeze([
  {
    id: "pricing",
    no: 1,
    title: "商品・サービス価格",
    question: "価格を変えると、粗利益はどうなる？",
    description: "価格変更や原価上昇の影響、目標の利益に必要な価格を試算します。",
    fields: [
      amount("currentPrice", "今の価格", "1単位の今の販売価格", { required: true }),
      amount("changedPrice", "変更後の価格", "値上げ・値下げ後の価格", { required: true }),
      amount("unitCost", "1単位原価（今）", "1単位にかかる原価", { required: true }),
      amount("changedUnitCost", "1単位原価（変更後）", "原価が変わる場合だけ入力します"),
      integer("salesQuantity", "販売数量（今）", "今の販売数量", { required: true, positive: true }),
      integer("expectedQuantityAfterPriceChange", "変更後の想定販売数量", "空欄の場合は今の販売数量で計算します", { positive: true }),
      percent("targetGrossMarginRatePercent", "目標粗利益率", "価格の目安にしたい粗利益率（%）"),
      amount("fixedCostsExcludingLabor", "人件費を除く固定費", "目標営業利益に必要な価格の計算に使います"),
      amount("laborCosts", "人件費", "目標営業利益に必要な価格の計算に使います"),
      amount("otherVariableCosts", "その他変動費", "目標営業利益に必要な価格の計算に使います"),
      amount("targetOperatingProfit", "目標営業利益", "目標営業利益に必要な価格の計算に使います", { allowNegative: true })
    ],
    compute: computePricing
  },
  {
    id: "break-even",
    no: 2,
    title: "損益分岐点",
    question: "赤字にならない最低限の売上は？",
    description: "損益分岐点の売上高と、目標の利益に必要な売上を試算します。",
    fields: [
      amount("salesAmount", "売上高", "今の売上高", { required: true }),
      amount("variableCosts", "変動費", "売上に連動して変わる費用の合計", { required: true }),
      amount("fixedCosts", "固定費", "売上に関係なくかかる費用の合計", { required: true }),
      amount("targetOperatingProfit", "目標営業利益", "入力すると、目標に必要な売上も表示します", { allowNegative: true })
    ],
    compute: computeBreakEven
  },
  {
    id: "labor",
    no: 3,
    title: "人件費",
    question: "人を雇うと、人件費と利益はどうなる？",
    description: "採用による追加人件費と、営業利益への影響を試算します。",
    fields: [
      integer("plannedHireCount", "採用予定人数", "これから雇う人数", { required: true }),
      amount("expectedSalaryPerPerson", "1人当たりの想定給与（年間）", "賞与を含めた年額の目安", { required: true }),
      percent("socialInsuranceRatePercent", "社会保険料率（概算）", "会社負担分の目安（%）", { required: true }),
      amount("currentLaborCosts", "今の人件費（年間）", "採用後の人件費の計算に使います"),
      amount("currentOperatingProfit", "今の営業利益", "採用後の営業利益の計算に使います", { allowNegative: true }),
      amount("expectedAdditionalSales", "採用後に見込む年間追加売上", "採用後の営業利益の計算に使います"),
      percent("marginalProfitRatePercent", "限界利益率", "売上のうち固定費の回収と利益に回せる割合（%）")
    ],
    compute: computeLabor
  },
  {
    id: "loan",
    no: 4,
    title: "借入返済",
    question: "毎月の返済額と、返済の目安は？",
    description: "借入の返済額・利息の総額と、返済の負担の目安を試算します。",
    fields: [
      amount("loanAmount", "借入金額", "借りる金額", { required: true }),
      percent("interestRatePercent", "年利", "年あたりの利率（%）", { required: true }),
      integer("repaymentMonths", "返済月数", "返済にかける月数", { required: true, positive: true, max: 600 }),
      {
        id: "repaymentMethod", label: "返済方法", hint: "元利均等は毎月の返済額が一定、元金均等は毎月の元金が一定", kind: "select", required: true,
        options: [
          { value: "EQUAL_PAYMENT", label: "元利均等（毎月の返済額が一定）" },
          { value: "EQUAL_PRINCIPAL", label: "元金均等（毎月の元金が一定）" }
        ]
      },
      amount("annualPreDebtServiceCashFlow", "年間返済前キャッシュフロー", "返済に回せる年間のお金。キャッシュ倍率の計算に使います"),
      amount("shortTermBorrowings", "短期借入金", "債務償還年数の計算に使います"),
      amount("longTermBorrowings", "長期借入金", "債務償還年数の計算に使います"),
      amount("operatingProfit", "営業利益", "債務償還年数の計算に使います", { allowNegative: true }),
      amount("depreciation", "減価償却費", "債務償還年数の計算に使います")
    ],
    compute: computeLoan
  },
  {
    id: "investment",
    no: 5,
    title: "投資回収・利回り",
    question: "投資は、何年で回収できる？",
    description: "設備投資などの回収年数と、利回りを試算します。",
    fields: [
      amount("investmentAmount", "投資額", "投資にかける金額", { required: true }),
      amount("annualIncrementalCashFlow", "年間増分キャッシュフロー", "投資によって1年で増えるお金。回収年数の計算に使います"),
      amount("annualOperatingProfitBeforeInvestment", "投資前の年間営業利益", "利回りの計算に使います", { allowNegative: true }),
      amount("annualOperatingProfitAfterInvestment", "投資後の年間営業利益", "利回りの計算に使います", { allowNegative: true }),
      amount("annualRunningCost", "年間ランニングコスト", "投資後に毎年かかる費用"),
      number("targetPaybackYears", "目標回収年数", "何年で回収したいか（年）", { positive: true })
    ],
    compute: computeInvestment
  },
  {
    id: "cashflow",
    no: 6,
    title: "資金繰り",
    question: "今の収支で、現預金は何か月持つ？",
    description: "月の収支から、現預金の余命と残高の推移の目安を試算します。",
    fields: [
      amount("cashBalance", "現在の現預金", "今の現金と預金の合計", { required: true }),
      amount("monthlyCashIn", "月間キャッシュイン", "1か月に入ってくるお金の目安", { required: true }),
      amount("monthlyCashOut", "月間キャッシュアウト", "1か月に出ていくお金（返済を除く）の目安", { required: true }),
      amount("monthlyLoanPayment", "月間返済支出", "1か月の借入返済額"),
      integer("projectionMonths", "残高表示月数", "残高の推移を何か月分表示するか（空欄の場合は6か月）", { positive: true, max: 24 })
    ],
    compute: computeCashFlow
  },
  {
    id: "soundness",
    no: 7,
    title: "財務健全性",
    question: "会社の財務の構成はどうなっている？",
    description: "貸借対照表の数字から、財務の構成の割合を試算します。",
    fields: [
      amount("currentAssets", "流動資産", "1年以内に現金化できる資産"),
      amount("fixedAssets", "固定資産", "建物・土地・機械など、長く使う資産"),
      amount("totalAssets", "資産合計", "資産の全部の合計"),
      amount("currentLiabilities", "流動負債", "1年以内に支払う負債"),
      amount("totalLiabilities", "負債合計", "負債の全部の合計"),
      amount("netAssets", "純資産", "資産から負債を引いた、返さなくてよいお金", { allowNegative: true })
    ],
    compute: computeSoundness
  },
  {
    id: "profitability",
    no: 8,
    title: "収益性比率",
    question: "売上や資産に対して、利益はどれだけ？",
    description: "利益率と、資産の使い方の割合を試算します。",
    fields: [
      amount("salesAmount", "売上高", ""),
      amount("operatingProfit", "営業利益", "本業で得た利益", { allowNegative: true }),
      amount("ordinaryProfit", "経常利益", "通常の活動全体での利益", { allowNegative: true }),
      amount("netProfit", "当期純利益", "税金などを引いたあと、最終的に残る利益", { allowNegative: true }),
      amount("totalAssets", "資産合計", "資産の全部の合計"),
      amount("netAssets", "純資産", "資産から負債を引いた、返さなくてよいお金", { allowNegative: true })
    ],
    compute: computeProfitability
  },
  {
    id: "growth",
    no: 9,
    title: "成長率",
    question: "前期と比べて、どれだけ伸びた？",
    description: "金額の増減と成長率、複数年の年平均成長率を試算します。",
    fields: [
      amount("previousValue", "前期の金額", "比べる金額（売上高など）", { required: true, allowNegative: true }),
      amount("currentValue", "今期の金額", "比べる金額（売上高など）", { required: true, allowNegative: true }),
      amount("initialValue", "最初の金額", "年平均成長率の計算に使います"),
      amount("finalValue", "最後の金額", "年平均成長率の計算に使います"),
      number("years", "年数", "最初の金額から最後の金額までの年数", { positive: true })
    ],
    compute: computeGrowth
  },
  {
    id: "payroll",
    no: 10,
    title: "給与・雇用コスト",
    question: "人を雇い続けるのに、年間いくらかかる？",
    description: "給与と社会保険料など、雇用にかかる年間の総額を試算します。",
    fields: [
      integer("employeeCount", "従業員数", "役員を除く従業員の人数", { required: true, positive: true }),
      amount("annualSalaryPerPerson", "1人当たりの年間給与", "賞与を含めた年額の目安", { required: true }),
      percent("socialInsuranceRatePercent", "社会保険料率（概算）", "会社負担分の目安（%）", { required: true }),
      amount("otherCostPerPerson", "1人当たりの年間その他の経費", "交通費・研修費など、給与と社会保険以外の経費")
    ],
    compute: computePayroll
  }
]);

export const SIMULATION_BY_ID = Object.freeze(
  Object.fromEntries(SIMULATIONS.map((s) => [s.id, s]))
);

// ---------------------------------------------------------------------------
// Validation（総整理 5章：計算不能・入力不足・不正値はValidationで判定する）
// ---------------------------------------------------------------------------

export function validateSimulation(sim, values) {
  const errors = [];
  for (const field of sim.fields) {
    const v = values[field.id];
    const label = field.label;
    if (field.kind === "select") {
      if (v === null || v === undefined || v === "") {
        if (field.required) errors.push({ field: field.id, message: `${label}を選んでください` });
      } else if (!field.options.some((o) => o.value === v)) {
        errors.push({ field: field.id, message: `${label}の選択が正しくありません` });
      }
      continue;
    }
    if (!isNum(v)) {
      if (field.required) errors.push({ field: field.id, message: `${label}を入力してください` });
      continue;
    }
    if (field.kind === "integer" && !Number.isInteger(v)) {
      errors.push({ field: field.id, message: `${label}は整数で入力してください` });
      continue;
    }
    if (field.kind === "percent") {
      if (v < 0 || v > 100) {
        errors.push({ field: field.id, message: `${label}は0〜100の間で入力してください` });
        continue;
      }
    } else if (!field.allowNegative && v < 0) {
      errors.push({ field: field.id, message: `${label}は0以上で入力してください` });
      continue;
    }
    if (field.positive && v <= 0) {
      errors.push({ field: field.id, message: `${label}は0より大きい値で入力してください` });
      continue;
    }
    if (field.max && v > field.max) {
      errors.push({ field: field.id, message: `${label}は${field.max}以下で入力してください` });
      continue;
    }
  }
  if (sim.id === "pricing" && isNum(values.targetGrossMarginRatePercent) && values.targetGrossMarginRatePercent >= 100) {
    errors.push({ field: "targetGrossMarginRatePercent", message: "目標粗利益率は100%未満で入力してください" });
  }
  return errors;
}

export function computeSimulation(sim, values) {
  return sim.compute(values);
}

// ---------------------------------------------------------------------------
// 会社情報からの初期値の解決（総整理 6章の優先ルール）
// 1. 年次データがあれば年次を優先する
// 2. 年次がなく（または項目が欠け）月次12か月がそろっていれば、月次集計で補う
// 3. そろわない項目は推測で補わず、空欄のままにする
// ---------------------------------------------------------------------------

function sortedPeriods(company) {
  return [...(company.annualPeriods ?? [])].sort((a, b) => a.endDate.localeCompare(b.endDate));
}

function completeAggregates(company) {
  return listFiscalKeys(company)
    .map((key) => buildMonthlyAggregate(company, key))
    .filter((a) => a !== null)
    .sort((a, b) => a.fiscalKey.localeCompare(b.fiscalKey));
}

function lastDayOfYearMonth(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

// 会社情報から、試算の初期値に使える数字を集める。
function collectCompanyFigures(company) {
  const periods = sortedPeriods(company);
  const aggregates = completeAggregates(company);
  const latest = periods[periods.length - 1] ?? null;

  const pl = {};
  const sources = [];
  let monthly = null;

  if (latest) {
    const figures = getAnnualFigures(latest);
    for (const [code, value] of Object.entries(figures)) pl[code] = value;
    sources.push(`${latest.displayName}の年次登録`);
    // 最新の年次期と同じ決算期の月次集計があれば、欠けた項目だけを補う
    const agg = aggregates.find((a) => a.fiscalKey === latest.endDate.slice(0, 7));
    if (agg) {
      monthly = agg.figures;
      const fill = { PL001: "M001", PL002: "M002", PL015: "M006", PL007: "M003", PL017: "M103", PL025: "M007" };
      let filled = false;
      for (const [plCode, mCode] of Object.entries(fill)) {
        if (!isNum(pl[plCode]) && isNum(monthly[mCode])) {
          pl[plCode] = monthly[mCode];
          filled = true;
        }
      }
      if (filled) sources.push("月次12か月分の集計");
    }
  } else if (aggregates.length > 0) {
    const agg = aggregates[aggregates.length - 1];
    monthly = agg.figures;
    pl.PL001 = monthly.M001;
    pl.PL002 = monthly.M002;
    pl.PL015 = monthly.M006;
    pl.PL007 = monthly.M003;
    pl.PL017 = monthly.M103;
    pl.PL025 = monthly.M007;
    sources.push("月次12か月分の集計");
  }

  // B/Sは、登録がある最新の期から取る
  let bs = null;
  for (let i = periods.length - 1; i >= 0; i -= 1) {
    if (periods[i].bsValues) {
      bs = getBSFigures(periods[i].bsValues);
      if (periods[i] !== latest) sources.push(`${periods[i].displayName}の貸借対照表`);
      break;
    }
  }

  // 成長率用：売上高の系列（年次優先、年次がない期は月次集計）
  const annualKeys = new Set(periods.map((p) => p.endDate.slice(0, 7)));
  const series = [];
  for (const p of periods) {
    const figures = getAnnualFigures(p);
    if (isNum(figures.PL001)) series.push({ endDate: p.endDate, sales: figures.PL001 });
  }
  for (const agg of aggregates) {
    if (!annualKeys.has(agg.fiscalKey) && isNum(agg.figures.M001)) {
      series.push({ endDate: lastDayOfYearMonth(agg.fiscalKey), sales: agg.figures.M001 });
    }
  }
  series.sort((a, b) => a.endDate.localeCompare(b.endDate));

  return { pl, bs, monthly, series, sources };
}

function costStructure(pl, monthly) {
  let variableCosts = null;
  if (isNum(pl.PL002) && isNum(pl.PL015)) variableCosts = pl.PL002 + pl.PL015;
  else if (monthly && isNum(monthly.M002) && isNum(monthly.M006)) variableCosts = monthly.M002 + monthly.M006;

  let fixedCosts = null;
  const fixedParts = FIXED_COST_CODES.map((code) => pl[code]);
  if (fixedParts.every(isNum)) fixedCosts = fixedParts.reduce((s, x) => s + x, 0);
  else if (monthly && isNum(monthly.M003) && isNum(monthly.M004) && isNum(monthly.M005)) {
    fixedCosts = monthly.M003 + monthly.M004 + monthly.M005;
  }
  return { variableCosts, fixedCosts };
}

export function resolveSimInitialValues(company, simId) {
  if (!company) return { values: {}, sourceNote: null };
  const { pl, bs, monthly, series, sources } = collectCompanyFigures(company);
  const values = {};
  const put = (key, value) => { if (isNum(value)) values[key] = value; };

  switch (simId) {
    case "break-even": {
      const { variableCosts, fixedCosts } = costStructure(pl, monthly);
      put("salesAmount", pl.PL001);
      put("variableCosts", variableCosts);
      put("fixedCosts", fixedCosts);
      break;
    }
    case "labor": {
      put("currentLaborCosts", isNum(pl.PL007) ? pl.PL007 : monthly?.M003);
      put("currentOperatingProfit", pl.PL017);
      const { variableCosts } = costStructure(pl, monthly);
      if (isNum(pl.PL001) && pl.PL001 > 0 && isNum(variableCosts)) {
        const ratePercent = ((pl.PL001 - variableCosts) / pl.PL001) * 100;
        values.marginalProfitRatePercent = Math.round(ratePercent * 10) / 10;
      }
      break;
    }
    case "loan": {
      put("shortTermBorrowings", bs?.BS014);
      put("longTermBorrowings", bs?.BS019);
      put("operatingProfit", pl.PL017);
      put("depreciation", pl.PL013);
      break;
    }
    case "investment": {
      put("annualOperatingProfitBeforeInvestment", pl.PL017);
      break;
    }
    case "cashflow": {
      put("cashBalance", bs?.BS001);
      break;
    }
    case "soundness": {
      put("currentAssets", bs?.BS005);
      put("fixedAssets", bs?.BS011);
      put("totalAssets", bs?.BS012);
      put("currentLiabilities", bs?.BS018);
      put("totalLiabilities", bs?.BS022);
      put("netAssets", bs?.BS026);
      break;
    }
    case "profitability": {
      put("salesAmount", pl.PL001);
      put("operatingProfit", pl.PL017);
      put("ordinaryProfit", pl.PL020);
      put("netProfit", pl.PL025);
      put("totalAssets", bs?.BS012);
      put("netAssets", bs?.BS026);
      break;
    }
    case "growth": {
      if (series.length >= 2) {
        put("previousValue", series[series.length - 2].sales);
        put("currentValue", series[series.length - 1].sales);
        put("initialValue", series[0].sales);
        put("finalValue", series[series.length - 1].sales);
        const years = elapsedYearsActAct(series[0].endDate, series[series.length - 1].endDate);
        if (isNum(years) && years > 0) values.years = Math.round(years * 100) / 100;
        sources.push("売上高");
      }
      break;
    }
    default:
      break;
  }

  const hasValues = Object.keys(values).length > 0;
  return {
    values,
    sourceNote: hasValues
      ? `初期値は、${sources.join("・")}から入れています。その場で書き換えて計算できます。`
      : null
  };
}
