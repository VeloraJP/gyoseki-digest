import { FIXED_COST_CODES } from "../data/fields.js";
import {
  buildMonthlyAggregate,
  getAnnualFigures,
  getBSFigures,
  listFiscalKeys
} from "./calc.js";

// 試算（簡易シミュレーション）正式10種の計算エンジン。
// 計算式の正本は「共通計算エンジン_確定計算式一覧」（仕様設計書・個別計算定義書・
// 実装報告を照合した確定式）であり、他の参照資料より優先する。
// 確定式を確認できないものは、確定式として実装しない（報告の確認事項に挙げる）。
// 共通原則（確定式一覧14章）：途中計算で丸めない／0と未入力を区別する／
// 分母0の計算は実行しない／計算不能時に数値を補完しない。
// 試算の入力は保存しない（その場限りの計算）。
//
// values の約束：
// - 金額（kind: "amount"）は円単位の数値
// - 割合（kind: "percent"）はパーセント値（例：15 は 15%）
// - 件数・月数・日数（kind: "integer"）、年数・人数など（kind: "number"）はそのままの数値
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
// 1. 価格（確定式一覧4章：方式A/B/C）
// 共通の原価 C ＝ 商品・材料原価 ＋ 付随費用 ＋ その他変動費
// 方式A：P ＝ C ÷ (1 − r)／方式B：価格変更の粗利益比較（数量は変更前後で共通）
// 方式C：P ＝ C ＋ 目標粗利益額
// ---------------------------------------------------------------------------

function computePricing(v) {
  const c = v.unitCost;
  const q = v.salesQuantity;
  const currentUnitGP = v.currentPrice - c;
  const afterUnitGP = v.changedPrice - c;
  const currentTotalGP = currentUnitGP * q;
  const afterTotalGP = afterUnitGP * q;

  const results = [
    result("合計粗利益（今）", "（今の価格 − 原価）× 販売数量", "yen", roundYen(currentTotalGP)),
    result("合計粗利益（変更後）", "（変更後の価格 − 原価）× 販売数量", "yen", roundYen(afterTotalGP)),
    result("合計粗利益の増減", "変更後 − 今", "diff", roundYen(afterTotalGP - currentTotalGP)),
    result("1単位の粗利益（今）", "今の価格 − 原価", "yen", roundYen(currentUnitGP)),
    result("1単位の粗利益（変更後）", "変更後の価格 − 原価", "yen", roundYen(afterUnitGP))
  ];

  if (v.currentPrice !== 0 && v.changedPrice !== 0) {
    const points = (ratio(afterUnitGP, v.changedPrice) - ratio(currentUnitGP, v.currentPrice)) * 100;
    results.push(result("粗利益率のポイント差", "変更後の粗利益率 − 今の粗利益率", "points", points));
  } else {
    results.push(result("粗利益率のポイント差", "変更後の粗利益率 − 今の粗利益率", "points", null,
      "価格が0の場合は、粗利益率を計算できません"));
  }

  if (isNum(v.targetGrossMarginRatePercent)) {
    results.push(result("目標粗利益率からの価格（方式A）", "原価に対して、目標の粗利益率を確保できる価格", "yen",
      roundYen(ratio(c, 1 - v.targetGrossMarginRatePercent / 100))));
  } else {
    results.push(result("目標粗利益率からの価格（方式A）", "原価に対して、目標の粗利益率を確保できる価格", "yen", null,
      missingReason(["目標粗利益率"])));
  }

  if (isNum(v.targetGrossProfitAmount)) {
    results.push(result("目標粗利益額からの価格（方式C）", "原価 ＋ 1単位の目標粗利益額", "yen",
      roundYen(c + v.targetGrossProfitAmount)));
  } else {
    results.push(result("目標粗利益額からの価格（方式C）", "原価 ＋ 1単位の目標粗利益額", "yen", null,
      missingReason(["目標粗利益額"])));
  }

  return {
    results,
    tables: [],
    basis: [
      "原価 C ＝ 商品・材料原価 ＋ 付随費用 ＋ その他変動費（この試算では合計を入力します）",
      "合計粗利益 ＝（価格 − 原価）× 販売数量（数量は変更前後で共通です）",
      "粗利益率 ＝（価格 − 原価）÷ 価格",
      "方式A：価格 ＝ 原価 ÷（1 − 目標粗利益率）",
      "方式C：価格 ＝ 原価 ＋ 目標粗利益額"
    ],
    notes: []
  };
}

// ---------------------------------------------------------------------------
// 2. 損益分岐点（確定式一覧3章：CVP）
// 限界利益率 m ＝ 1 − 変動費率、損益分岐点売上高 ＝ 固定費 ÷ m
// ---------------------------------------------------------------------------

function marginalRate(sales, variableCosts) {
  if (!isNum(sales) || sales <= 0) return null;
  return 1 - ratio(variableCosts, sales);
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
    results.push(result("損益分岐点比率", "損益分岐点の売上高が、今の売上の何割か", "percent",
      ratio(bep, v.salesAmount)));
    results.push(result("安全余裕率", "売上が損益分岐点からどれだけ離れているか", "percent",
      ratio(v.salesAmount - bep, v.salesAmount)));
  } else {
    const reason = "限界利益率が0以下のため計算できません。変動費が売上以上になっている状態です";
    results.push(result("損益分岐点の売上高", "営業利益がちょうど0になる売上（赤字にならない最低限の売上）", "yen", null, reason));
    results.push(result("損益分岐点比率", "損益分岐点の売上高が、今の売上の何割か", "percent", null, reason));
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
      "限界利益率 ＝ 1 −（変動費 ÷ 売上高）",
      "損益分岐点の売上高 ＝ 固定費 ÷ 限界利益率",
      "損益分岐点比率 ＝ 損益分岐点の売上高 ÷ 売上高",
      "安全余裕率 ＝（売上高 − 損益分岐点の売上高）÷ 売上高",
      "目標に必要な売上高 ＝（固定費 ＋ 目標営業利益）÷ 限界利益率"
    ],
    notes: ["この試算は、その場で入力した数字だけで計算します。「目標と進捗」画面の損益分岐点（登録した決算の数字から自動で計算する表示）とは別物です。"]
  };
}

// ---------------------------------------------------------------------------
// 3. 人件費（確定式一覧5章：労働分配率の方式A/B/C）
// 方式A：現状の労働分配率／方式B：目標人件費／方式C：人件費変更比較
// 粗利益0円では方式A・Cの分配率は算出不能。方式Bは粗利益0円でも計算できる。
// ---------------------------------------------------------------------------

function computeLabor(v) {
  const gp = v.grossProfit;
  const current = v.currentLaborCosts;
  const hasHeads = isNum(v.employeeCount) && v.employeeCount > 0;
  const shareNow = gp !== 0 ? ratio(current, gp) : null;

  const results = [
    result("労働分配率（方式A）", "粗利益のうち、人件費が占める割合", "percent", shareNow,
      gp === 0 ? "粗利益が0のため、労働分配率は計算できません" : null),
    result("人件費控除後金額（方式A）", "粗利益 − 今の人件費", "yen", roundYen(gp - current)),
    result("一人当たり人件費（方式A）", "今の人件費 ÷ 従業員数", "yen",
      hasHeads ? roundYen(ratio(current, v.employeeCount)) : null,
      isNum(v.employeeCount) ? "従業員数が0のため計算できません" : missingReason(["従業員数"]))
  ];

  if (isNum(v.targetLaborShareRatePercent)) {
    const target = gp * (v.targetLaborShareRatePercent / 100);
    results.push(result("目標人件費（方式B）", "粗利益 × 目標労働分配率", "yen", roundYen(target)));
    results.push(result("目標人件費控除後金額（方式B）", "粗利益 − 目標人件費", "yen", roundYen(gp - target)));
    results.push(result("目標人件費差額（方式B）", "目標人件費 − 今の人件費", "diff", roundYen(target - current)));
    results.push(result("一人当たり目標人件費（方式B）", "目標人件費 ÷ 従業員数", "yen",
      hasHeads ? roundYen(ratio(target, v.employeeCount)) : null,
      isNum(v.employeeCount) ? "従業員数が0のため計算できません" : missingReason(["従業員数"])));
  } else {
    for (const label of ["目標人件費（方式B）", "目標人件費控除後金額（方式B）", "目標人件費差額（方式B）", "一人当たり目標人件費（方式B）"]) {
      results.push(result(label, "", "yen", null, missingReason(["目標労働分配率"])));
    }
  }

  if (isNum(v.changedLaborCosts)) {
    const changed = v.changedLaborCosts;
    const shareAfter = gp !== 0 ? ratio(changed, gp) : null;
    results.push(result("変更後労働分配率（方式C）", "変更後の人件費 ÷ 粗利益", "percent", shareAfter,
      gp === 0 ? "粗利益が0のため、労働分配率は計算できません" : null));
    results.push(result("人件費差額（方式C）", "変更後の人件費 − 今の人件費", "diff", roundYen(changed - current)));
    results.push(result("控除後金額差額（方式C）", "今の人件費 − 変更後の人件費（人件費が減ると控除後は増えます）", "diff",
      roundYen(current - changed)));
    results.push(result("労働分配率のポイント差（方式C）", "変更後労働分配率 − 現在労働分配率", "points",
      shareAfter !== null && shareNow !== null ? (shareAfter - shareNow) * 100 : null,
      gp === 0 ? "粗利益が0のため計算できません" : null));
  } else {
    for (const label of ["変更後労働分配率（方式C）", "労働分配率のポイント差（方式C）"]) {
      results.push(result(label, "", "percent", null, missingReason(["変更後の人件費"])));
    }
    for (const label of ["人件費差額（方式C）", "控除後金額差額（方式C）"]) {
      results.push(result(label, "", "diff", null, missingReason(["変更後の人件費"])));
    }
  }

  return {
    results,
    tables: [],
    basis: [
      "労働分配率 ＝ 人件費 ÷ 粗利益",
      "人件費控除後金額 ＝ 粗利益 − 人件費",
      "目標人件費 ＝ 粗利益 × 目標労働分配率",
      "一人当たり人件費 ＝ 人件費 ÷ 従業員数"
    ],
    notes: ["割合の目安は業種や会社の状況によって大きく違います。ここでは数字だけを示し、良い・悪いの判定はしません。"]
  };
}

// ---------------------------------------------------------------------------
// 4. 借入返済（確定式一覧7章：返済予定表定義）
// 月利 i ＝ 年利 ÷ 12。元利均等／元金均等。繰上返済は通常返済と別行で計算し、
// 期間短縮型と返済額軽減型に対応する。途中計算では丸めない。
// ---------------------------------------------------------------------------

function equalPaymentAmount(balance, annualRate, months) {
  const i = annualRate / 12;
  if (i === 0) return balance / months;
  const factor = (1 + i) ** months;
  return (balance * i * factor) / (factor - 1);
}

function hasPrepayment(v) {
  return isNum(v.prepaymentAmount) && isNum(v.prepaymentMonth)
    && typeof v.prepaymentType === "string" && v.prepaymentType !== "";
}

// 返済予定表を作る。繰上返済がある月は、通常返済のあとに別行を足す。
function buildSchedule(v) {
  const annualRate = v.interestRatePercent / 100;
  const i = annualRate / 12;
  const method = v.repaymentMethod;
  const hasPrepay = hasPrepayment(v);
  const rows = [];
  let balance = v.loanAmount;
  let regularPayment = method === "EQUAL_PAYMENT" ? equalPaymentAmount(balance, annualRate, v.repaymentMonths) : null;
  let regularPrincipal = method === "EQUAL_PRINCIPAL" ? balance / v.repaymentMonths : null;

  for (let month = 1; month <= v.repaymentMonths && balance > 0; month += 1) {
    const interest = balance * i;
    const isLast = month === v.repaymentMonths;
    let principal;
    if (method === "EQUAL_PAYMENT") {
      principal = isLast ? balance : Math.min(balance, Math.max(0, regularPayment - interest));
      if (principal <= 0) principal = balance;
    } else {
      principal = isLast ? balance : Math.min(balance, regularPrincipal);
    }
    const payment = principal + interest;
    balance = Math.max(0, balance - principal);
    rows.push({ month, label: null, principal, interest, payment, balance });

    if (hasPrepay && month === v.prepaymentMonth && balance > 0) {
      const extra = Math.min(v.prepaymentAmount, balance);
      balance -= extra;
      rows.push({ month, label: `${month}か月目（繰上返済）`, principal: extra, interest: 0, payment: extra, balance });
      if (balance > 0 && v.prepaymentType === "PAYMENT_REDUCE") {
        const remaining = v.repaymentMonths - month;
        if (remaining > 0) {
          if (method === "EQUAL_PAYMENT") regularPayment = equalPaymentAmount(balance, annualRate, remaining);
          else regularPrincipal = balance / remaining;
        }
      }
    }
  }
  return rows;
}

function computeLoan(v) {
  const schedule = buildSchedule(v);
  const firstYearRows = schedule.filter((row) => row.month <= 12);
  const annualPayment = firstYearRows.reduce((s, row) => s + row.payment, 0);
  const totalPayment = schedule.reduce((s, row) => s + row.payment, 0);
  const totalInterest = schedule.reduce((s, row) => s + row.interest, 0);
  const hasPrepay = hasPrepayment(v);

  const results = [
    result("毎月の返済額（初回）", v.repaymentMethod === "EQUAL_PAYMENT" ? "元利均等では、毎月ほぼ同じ額です" : "元金均等では、初回が最も大きく、少しずつ減ります", "yen",
      schedule.length ? roundYen(schedule[0].payment) : null),
    result("年間返済額", "予定表の最初の12回分の合計（繰上返済を含みます）", "yen", roundYen(annualPayment)),
    result("返済総額", "返済期間全体の返済額の合計", "yen", roundYen(totalPayment)),
    result("利息の総額", "返済総額のうち、利息の部分", "yen", roundYen(totalInterest))
  ];

  if (hasPrepay) {
    results.push(result("実際の返済回数", "繰上返済によって変わった、実際の返済の回数", "count",
      schedule.filter((row) => !row.label).length, null, "回"));
  }

  if (isNum(v.annualCashFlow)) {
    if (annualPayment > 0) {
      results.push(result("債務返済余裕倍率（DSCR）", "年間キャッシュフローが、年間返済額の何倍あるか", "times",
        ratio(v.annualCashFlow, annualPayment)));
    } else {
      results.push(result("債務返済余裕倍率（DSCR）", "年間キャッシュフローが、年間返済額の何倍あるか", "times", null,
        "年間返済額が0のため計算できません"));
    }
  } else {
    results.push(result("債務返済余裕倍率（DSCR）", "年間キャッシュフローが、年間返済額の何倍あるか", "times", null,
      missingReason(["年間キャッシュフロー"])));
  }

  const rows = schedule
    .filter((row) => row.month <= 12)
    .map((row) => [row.label ?? row.month, row.principal, row.interest, row.payment, row.balance]);
  return {
    results,
    tables: [{
      title: "返済表（最初の12か月）",
      columns: [
        { label: "月", format: "monthLabel" },
        { label: "元金", format: "yen" },
        { label: "利息", format: "yen" },
        { label: "返済額", format: "yen" },
        { label: "残高", format: "yen" }
      ],
      rows
    }],
    basis: [
      "月利 ＝ 年利 ÷ 12",
      "元利均等：毎月の返済額を一定にする方式。利息は、その月の残高 × 月利",
      "元金均等：毎月の元金を一定にする方式。利息は、その月の残高 × 月利",
      "年間返済額 ＝ 予定表の先頭12回分の合計（毎月額の単純な12倍ではありません）",
      "債務返済余裕倍率（DSCR）＝ 年間キャッシュフロー ÷ 年間返済額",
      "繰上返済は通常返済とは別に計算します。期間短縮型は返済額を変えずに期間を短くし、返済額軽減型は残高と残り回数から返済額を計算し直します"
    ],
    notes: ["利息は月利で計算した概算です。実際の返済額は、金融機関の計算（日割りなど）と少し違う場合があります。"]
  };
}

// ---------------------------------------------------------------------------
// 5. 投資回収・利回り（確定式一覧8章B：後続の年間利益ベース）
// 年間利益 Y ＝ 年間収入 − 年間経費、回収年数 ＝ 投資額 ÷ Y、
// 回収月数 ＝ round（回収年数 × 12）、年間利回り ＝ Y ÷ 投資額
// 年間経費が未入力の場合は0円として扱う。Y が0以下の場合は回収期間を算出しない。
// ---------------------------------------------------------------------------

function computeInvestment(v) {
  const expense = isNum(v.annualExpense) ? v.annualExpense : 0;
  const y = v.annualRevenue - expense;
  const results = [
    result("年間利益", "年間収入 − 年間経費", "yen", roundYen(y))
  ];

  if (y > 0) {
    const years = ratio(v.investmentAmount, y);
    results.push(result("投資回収年数", "投資額 ÷ 年間利益", "years", years));
    results.push(result("投資回収月数", "回収年数 × 12（四捨五入）", "months", Math.round(years * 12)));
  } else {
    const reason = "年間利益が0以下のため、回収期間は表示されません";
    results.push(result("投資回収年数", "投資額 ÷ 年間利益", "years", null, reason));
    results.push(result("投資回収月数", "回収年数 × 12（四捨五入）", "months", null, reason));
  }

  results.push(result("年間利回り", "年間利益 ÷ 投資額", "percent", ratio(y, v.investmentAmount)));

  return {
    results,
    tables: [],
    basis: [
      "年間利益 ＝ 年間収入 − 年間経費（経費が未入力の場合は0円として計算します）",
      "投資回収年数 ＝ 投資額 ÷ 年間利益",
      "投資回収月数 ＝ 回収年数 × 12（四捨五入）",
      "年間利回り ＝ 年間利益 ÷ 投資額"
    ],
    notes: ["回収年数と利回りは、キャッシュフローではなく年間の利益（収入から経費を引いた額）をもとに計算しています。"]
  };
}

// ---------------------------------------------------------------------------
// 6. 資金繰り（確定式一覧6章B：日別資金繰り）
// 日別入出金差額 Dt ＝ 当日入金 − 当日支出、日別残高 Bt ＝ B(t-1) ＋ Dt
// 残高が0円の日は不足日に含めない。
// ---------------------------------------------------------------------------

function computeCashFlow(v) {
  const days = v.periodDays;
  const specials = [];
  for (const prefix of ["specialIn", "specialOut"]) {
    for (const n of [1, 2]) {
      const day = v[`${prefix}Day${n}`];
      const amount = v[`${prefix}Amount${n}`];
      if (isNum(day) && isNum(amount)) {
        specials.push({ day, inAmount: prefix === "specialIn" ? amount : 0, outAmount: prefix === "specialOut" ? amount : 0 });
      }
    }
  }

  let balance = v.cashBalance;
  let minBalance = null;
  let minDay = null;
  let firstShortageDay = null;
  let negativeDays = 0;
  let totalIn = 0;
  let totalOut = 0;
  const rows = [];
  for (let d = 1; d <= days; d += 1) {
    let inAmount = v.dailyCashIn;
    let outAmount = v.dailyCashOut;
    for (const s of specials) {
      if (s.day === d) { inAmount += s.inAmount; outAmount += s.outAmount; }
    }
    balance += inAmount - outAmount;
    totalIn += inAmount;
    totalOut += outAmount;
    if (minBalance === null || balance < minBalance) { minBalance = balance; minDay = d; }
    if (balance < 0) {
      negativeDays += 1;
      if (firstShortageDay === null) firstShortageDay = d;
    }
    rows.push([d, inAmount, outAmount, balance]);
  }

  const results = [
    result("期間末残高", "開始残高に、期間中の入出金を反映した残高", "yen", roundYen(balance)),
    result("期間中の最低残高", `${minDay}日目の残高が最も低くなります`, "yen", roundYen(minBalance)),
    result("最初の残高不足日", "残高が初めてマイナスになる日（残高0円の日は含みません）", "day",
      firstShortageDay, "期間中に残高がマイナスになる日はありません"),
    result("残高がマイナスになる日数", "期間のうち、残高が0円未満になる日の数", "count", negativeDays, null, "日"),
    result("期間の収支", "期間中の入金合計 − 支出合計", "diff", roundYen(totalIn - totalOut))
  ];

  if (isNum(v.minimumCashBalance)) {
    results.push(result("最低維持資金との差額", "期間中の最低残高 − 最低維持資金", "diff",
      roundYen(minBalance - v.minimumCashBalance)));
  } else {
    results.push(result("最低維持資金との差額", "期間中の最低残高 − 最低維持資金", "diff", null,
      missingReason(["最低維持資金"])));
  }

  return {
    results,
    tables: [{
      title: "日別の残高推移",
      columns: [
        { label: "日", format: "day" },
        { label: "入金", format: "yen" },
        { label: "支出", format: "yen" },
        { label: "残高", format: "yen" }
      ],
      rows
    }],
    basis: [
      "その日の差額 ＝ その日の入金 − その日の支出",
      "その日の残高 ＝ 前日の残高 ＋ その日の差額（同日の入金と支出は合算して反映します）",
      "期間の収支 ＝ 期間中の入金合計 − 支出合計",
      "最低維持資金との差額 ＝ 期間中の最低残高 − 最低維持資金"
    ],
    notes: ["入力した入出金の予定どおりに進むという仮定の試算です。入力は保存されません。"]
  };
}

// ---------------------------------------------------------------------------
// 7. 財務健全性（確定式一覧9章：対象7指標）
// 確定式が直接確認できたのは自己資本比率のみ。他の6指標は一般的な定義式で
// 計算する（確定式の照合待ちであることは、報告の確認事項に挙げる）。
// ---------------------------------------------------------------------------

function computeSoundness(v) {
  const need = (keys, labels) => missingReason(keys.filter((k, idx) => !isNum(v[k])).map((k) => labels[k]));
  const labels = {
    currentAssets: "流動資産", fixedAssets: "固定資産", totalAssets: "資産合計",
    currentLiabilities: "流動負債", totalLiabilities: "負債合計", netAssets: "純資産",
    quickAssets: "当座資産", fixedLiabilities: "固定負債"
  };
  const ratioOrNull = (label, hint, numeratorKey, denominatorKeys, computeFn, zeroReason) => {
    const missing = denominatorKeys.concat(numeratorKey).filter((k) => !isNum(v[k]));
    if (missing.length > 0) return result(label, hint, "percent", null, missingReason(missing.map((k) => labels[k])));
    const value = computeFn();
    return result(label, hint, "percent", value, value === null ? zeroReason : null);
  };

  const results = [
    ratioOrNull("自己資本比率", "資産合計のうち、返さなくてよいお金（純資産）の割合", "netAssets",
      ["totalAssets"], () => (v.totalAssets !== 0 ? ratio(v.netAssets, v.totalAssets) : null),
      "資産合計が0のため計算できません"),
    ratioOrNull("流動比率", "1年以内の負債に対して、1年以内の資産がどれだけあるか", "currentAssets",
      ["currentLiabilities"], () => (v.currentLiabilities !== 0 ? ratio(v.currentAssets, v.currentLiabilities) : null),
      "流動負債が0のため計算できません"),
    ratioOrNull("当座比率", "1年以内の負債に対して、すぐに現金化できる資産（当座資産）がどれだけあるか", "quickAssets",
      ["currentLiabilities"], () => (v.currentLiabilities !== 0 ? ratio(v.quickAssets, v.currentLiabilities) : null),
      "流動負債が0のため計算できません"),
    ratioOrNull("固定比率", "固定資産が純資産の何倍あるか", "fixedAssets",
      ["netAssets"], () => (v.netAssets !== 0 ? ratio(v.fixedAssets, v.netAssets) : null),
      "純資産が0のため計算できません"),
    result("固定長期適合率", "固定資産が、純資産と固定負債の合計の何割か",
      "percent",
      isNum(v.fixedAssets) && isNum(v.netAssets) && isNum(v.fixedLiabilities) && (v.netAssets + v.fixedLiabilities) !== 0
        ? ratio(v.fixedAssets, v.netAssets + v.fixedLiabilities) : null,
      !isNum(v.fixedAssets) || !isNum(v.netAssets) || !isNum(v.fixedLiabilities)
        ? need(["fixedAssets", "netAssets", "fixedLiabilities"], labels)
        : "純資産と固定負債の合計が0のため計算できません"),
    ratioOrNull("負債比率", "負債合計が純資産の何倍あるか", "totalLiabilities",
      ["netAssets"], () => (v.netAssets !== 0 ? ratio(v.totalLiabilities, v.netAssets) : null),
      "純資産が0のため計算できません"),
    result("運転資本", "流動資産 − 流動負債。日々の運転に回せるお金の目安", "yen",
      isNum(v.currentAssets) && isNum(v.currentLiabilities) ? roundYen(v.currentAssets - v.currentLiabilities) : null,
      need(["currentAssets", "currentLiabilities"], labels))
  ];
  return {
    results,
    tables: [],
    basis: [
      "自己資本比率 ＝ 純資産 ÷ 資産合計",
      "流動比率 ＝ 流動資産 ÷ 流動負債",
      "当座比率 ＝ 当座資産 ÷ 流動負債",
      "固定比率 ＝ 固定資産 ÷ 純資産",
      "固定長期適合率 ＝ 固定資産 ÷（純資産 ＋ 固定負債）",
      "負債比率 ＝ 負債合計 ÷ 純資産",
      "運転資本 ＝ 流動資産 − 流動負債"
    ],
    notes: ["割合の目安は業種によって大きく違います。ここでは数字だけを示し、良い・悪いの判定はしません。"]
  };
}

// ---------------------------------------------------------------------------
// 8. 収益性比率（確定式一覧9章：4種類の利益率＋ROA＋必要利益）
// 各利益率 ＝ 対象利益 ÷ 売上高。ROA ＝ 経常利益 ÷ 総資産（初期確定式）。
// 必要利益 ＝ 売上高 × 目標利益率、追加利益 ＝ max(0, 必要利益 − 現在利益)
// ---------------------------------------------------------------------------

function computeProfitability(v) {
  const margin = (label, hint, profitKey, profitLabel) => result(label, hint, "percent",
    isNum(v[profitKey]) && isNum(v.salesAmount) && v.salesAmount !== 0 ? ratio(v[profitKey], v.salesAmount) : null,
    !isNum(v[profitKey]) || !isNum(v.salesAmount) ? missingReason([
      ...(!isNum(v[profitKey]) ? [profitLabel] : []), ...(!isNum(v.salesAmount) ? ["売上高"] : [])
    ]) : "売上高が0のため計算できません");

  const results = [
    margin("売上高総利益率", "売上に対して、売上総利益（粗利益）がどれだけ残るか", "grossProfit", "売上総利益"),
    margin("売上高営業利益率", "売上に対して、本業の利益がどれだけ残るか", "operatingProfit", "営業利益"),
    margin("売上高経常利益率", "売上に対して、通常の活動全体の利益がどれだけ残るか", "ordinaryProfit", "経常利益"),
    margin("売上高当期純利益率", "売上に対して、最終利益がどれだけ残るか", "netProfit", "当期純利益"),
    result("総資産経常利益率（ROA）", "資産合計に対して、経常利益がどれだけ生まれたか", "percent",
      isNum(v.ordinaryProfit) && isNum(v.totalAssets) && v.totalAssets !== 0 ? ratio(v.ordinaryProfit, v.totalAssets) : null,
      !isNum(v.ordinaryProfit) || !isNum(v.totalAssets) ? missingReason([
        ...(!isNum(v.ordinaryProfit) ? ["経常利益"] : []), ...(!isNum(v.totalAssets) ? ["資産合計"] : [])
      ]) : "資産合計が0のため計算できません")
  ];

  if (isNum(v.targetOrdinaryMarginRatePercent)) {
    if (isNum(v.salesAmount)) {
      const required = v.salesAmount * (v.targetOrdinaryMarginRatePercent / 100);
      results.push(result("目標の経常利益率に必要な経常利益", "売上高 × 目標経常利益率", "yen", roundYen(required)));
      if (isNum(v.ordinaryProfit)) {
        results.push(result("追加で必要な経常利益", "必要な経常利益 − 今の経常利益（すでに届いている場合は0）", "yen",
          roundYen(Math.max(0, required - v.ordinaryProfit))));
      } else {
        results.push(result("追加で必要な経常利益", "必要な経常利益 − 今の経常利益", "yen", null,
          missingReason(["経常利益"])));
      }
    } else {
      results.push(result("目標の経常利益率に必要な経常利益", "売上高 × 目標経常利益率", "yen", null,
        missingReason(["売上高"])));
      results.push(result("追加で必要な経常利益", "必要な経常利益 − 今の経常利益", "yen", null,
        missingReason(["売上高"])));
    }
  } else {
    results.push(result("目標の経常利益率に必要な経常利益", "売上高 × 目標経常利益率", "yen", null,
      missingReason(["目標経常利益率"])));
    results.push(result("追加で必要な経常利益", "必要な経常利益 − 今の経常利益", "yen", null,
      missingReason(["目標経常利益率"])));
  }

  return {
    results,
    tables: [],
    basis: [
      "売上高○○利益率 ＝ 各利益 ÷ 売上高",
      "総資産経常利益率（ROA）＝ 経常利益 ÷ 資産合計",
      "必要な経常利益 ＝ 売上高 × 目標経常利益率",
      "追加で必要な経常利益 ＝ max(0, 必要な経常利益 − 今の経常利益)"
    ],
    notes: ["割合の目安は業種によって大きく違います。ここでは数字だけを示し、良い・悪いの判定はしません。"]
  };
}

// ---------------------------------------------------------------------------
// 9. 成長率（確定式一覧11章：基本式とその条件）
// 増減額 ΔX ＝ X当期 − X前期
// 売上高成長率：前期売上高が0の場合は算出しない
// 経常利益成長率：前期・当期とも正数の場合のみ算出（赤字・黒字転換は増減額で見る）
// 目標利益成長率からの逆算は、確定式を再現できないため実装しない。
// ---------------------------------------------------------------------------

function computeGrowth(v) {
  const results = [
    result("売上高の増減額", "今期の売上高 − 前期の売上高", "diff", roundYen(v.currentSalesAmount - v.previousSalesAmount)),
    result("売上高成長率", "増減額 ÷ 前期の売上高", "percent",
      v.previousSalesAmount !== 0 ? ratio(v.currentSalesAmount - v.previousSalesAmount, v.previousSalesAmount) : null,
      "前期の売上高が0のため、成長率は表示されません")
  ];

  const hasOrdinary = isNum(v.previousOrdinaryProfit) && isNum(v.currentOrdinaryProfit);
  if (hasOrdinary) {
    results.push(result("経常利益の増減額", "今期の経常利益 − 前期の経常利益", "diff",
      roundYen(v.currentOrdinaryProfit - v.previousOrdinaryProfit)));
    if (v.previousOrdinaryProfit > 0 && v.currentOrdinaryProfit > 0) {
      results.push(result("経常利益成長率", "増減額 ÷ 前期の経常利益", "percent",
        ratio(v.currentOrdinaryProfit - v.previousOrdinaryProfit, v.previousOrdinaryProfit)));
    } else {
      results.push(result("経常利益成長率", "増減額 ÷ 前期の経常利益", "percent", null,
        "経常利益の成長率は、前期・当期とも黒字の場合だけ表示します。赤字や黒字転換のときは増減額で見てください"));
    }
  } else {
    results.push(result("経常利益の増減額", "今期の経常利益 − 前期の経常利益", "diff", null,
      missingReason([
        ...(!isNum(v.previousOrdinaryProfit) ? ["前期の経常利益"] : []),
        ...(!isNum(v.currentOrdinaryProfit) ? ["今期の経常利益"] : [])
      ])));
    results.push(result("経常利益成長率", "増減額 ÷ 前期の経常利益", "percent", null,
      missingReason(["前期の経常利益", "今期の経常利益"])));
  }

  return {
    results,
    tables: [],
    basis: [
      "増減額 ＝ 今期の金額 − 前期の金額",
      "売上高成長率 ＝ 増減額 ÷ 前期の売上高（前期の売上高が0の場合は表示しません）",
      "経常利益成長率 ＝ 増減額 ÷ 前期の経常利益（前期・当期とも黒字の場合だけ表示します）"
    ],
    notes: []
  };
}

// ---------------------------------------------------------------------------
// 10. 給与・雇用コスト
// 確定式一覧に独立した確定式の記載がないため、入力項目の単純な集計として
// 実装する（給与総額＋社会保険料の概算＋その他の経費）。
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
    description: "価格変更による粗利益の変化と、目標の粗利益から逆算した価格を試算します。",
    fields: [
      amount("currentPrice", "今の価格", "1単位の今の販売価格", { required: true }),
      amount("changedPrice", "変更後の価格", "値上げ・値下げ後の価格", { required: true }),
      amount("unitCost", "1単位原価", "商品・材料原価＋付随費用＋その他変動費の合計", { required: true }),
      integer("salesQuantity", "販売数量", "価格の変更前後で共通の販売数量", { required: true, positive: true }),
      percent("targetGrossMarginRatePercent", "目標粗利益率", "価格の目安にしたい粗利益率（%）。方式Aに使います"),
      amount("targetGrossProfitAmount", "目標粗利益額（1単位）", "1単位あたりの目標の粗利益額。方式Cに使います")
    ],
    compute: computePricing,
    validateExtra: (v) => (isNum(v.targetGrossMarginRatePercent) && v.targetGrossMarginRatePercent >= 100)
      ? [{ field: "targetGrossMarginRatePercent", message: "目標粗利益率は100%未満で入力してください" }]
      : []
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
    question: "人件費は、粗利益のどれくらい？",
    description: "労働分配率（粗利益のうち人件費の割合）と、目標・変更後の人件費を試算します。",
    fields: [
      amount("currentLaborCosts", "今の人件費", "年間の人件費の合計", { required: true }),
      amount("grossProfit", "粗利益（売上総利益）", "売上高から売上原価を引いた金額", { required: true, allowNegative: true }),
      number("employeeCount", "従業員数", "パート等は勤務割合に直した人数（FTE）でも入力できます。小数第1位まで"),
      percent("targetLaborShareRatePercent", "目標労働分配率", "方式B（目標人件費）に使います（%）"),
      amount("changedLaborCosts", "変更後の人件費", "方式C（変更比較）に使います")
    ],
    compute: computeLabor
  },
  {
    id: "loan",
    no: 4,
    title: "借入返済",
    question: "毎月の返済額と、返済の目安は？",
    description: "借入の返済額・利息の総額・返済表と、返済の負担の目安を試算します。繰上返済も計算できます。",
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
      integer("prepaymentMonth", "繰上返済の月", "何か月目に繰上返済するか。使う場合は金額・方式も入力してください", { positive: true, max: 600 }),
      amount("prepaymentAmount", "繰上返済額", "繰上返済に回す金額", { positive: true }),
      {
        id: "prepaymentType", label: "繰上返済の方式", hint: "期間短縮型は返済額を変えずに期間を短く、返済額軽減型は毎月の返済額を下げます", kind: "select",
        options: [
          { value: "PERIOD_SHORTEN", label: "期間短縮型（期間を短くする）" },
          { value: "PAYMENT_REDUCE", label: "返済額軽減型（毎月の返済額を下げる）" }
        ]
      },
      amount("annualCashFlow", "年間キャッシュフロー", "返済余裕倍率（DSCR）の計算に使います")
    ],
    compute: computeLoan,
    validateExtra: (v) => {
      const errors = [];
      const anyPrepay = isNum(v.prepaymentMonth) || isNum(v.prepaymentAmount) || (v.prepaymentType ?? "") !== "";
      if (anyPrepay) {
        if (!isNum(v.prepaymentMonth)) errors.push({ field: "prepaymentMonth", message: "繰上返済を使う場合は、繰上返済の月も入力してください" });
        if (!isNum(v.prepaymentAmount)) errors.push({ field: "prepaymentAmount", message: "繰上返済を使う場合は、繰上返済額も入力してください" });
        if ((v.prepaymentType ?? "") === "") errors.push({ field: "prepaymentType", message: "繰上返済を使う場合は、繰上返済の方式も選んでください" });
        if (isNum(v.prepaymentMonth) && isNum(v.repaymentMonths) && v.prepaymentMonth >= v.repaymentMonths) {
          errors.push({ field: "prepaymentMonth", message: "繰上返済の月は、返済月数より小さい値で入力してください" });
        }
      }
      return errors;
    }
  },
  {
    id: "investment",
    no: 5,
    title: "投資回収・利回り",
    question: "投資は、何年で回収できる？",
    description: "設備投資などの回収年数と利回りを、年間の利益（収入−経費）をもとに試算します。",
    fields: [
      amount("investmentAmount", "投資額", "投資にかける金額", { required: true, positive: true }),
      amount("annualRevenue", "年間収入", "投資によって得られる1年の収入", { required: true }),
      amount("annualExpense", "年間経費", "投資後に毎年かかる経費。未入力の場合は0円として計算します")
    ],
    compute: computeInvestment
  },
  {
    id: "cashflow",
    no: 6,
    title: "資金繰り",
    question: "日々の残高は、どう推移する？",
    description: "日別の入出金から、残高の推移・最低残高・残高が不足する日を試算します。",
    fields: [
      amount("cashBalance", "現在の現預金（開始残高）", "今日の現金と預金の合計", { required: true }),
      integer("periodDays", "対象の日数", "これから何日分を見るか（最大31日）", { required: true, positive: true, max: 31 }),
      amount("dailyCashIn", "毎日の入金", "ほぼ毎日入ってくる入金の、1日分の目安（ない場合は0）", { required: true }),
      amount("dailyCashOut", "毎日の支出", "ほぼ毎日出ていく支出の、1日分の目安（ない場合は0）", { required: true }),
      integer("specialInDay1", "入金予定1：日", "特定の日の入金。何日目か", { positive: true, max: 31 }),
      amount("specialInAmount1", "入金予定1：金額", "その日の入金額"),
      integer("specialInDay2", "入金予定2：日", "特定の日の入金。何日目か", { positive: true, max: 31 }),
      amount("specialInAmount2", "入金予定2：金額", "その日の入金額"),
      integer("specialOutDay1", "支出予定1：日", "特定の日の支出（給与・家賃など）。何日目か", { positive: true, max: 31 }),
      amount("specialOutAmount1", "支出予定1：金額", "その日の支出額"),
      integer("specialOutDay2", "支出予定2：日", "特定の日の支出。何日目か", { positive: true, max: 31 }),
      amount("specialOutAmount2", "支出予定2：金額", "その日の支出額"),
      amount("minimumCashBalance", "最低維持資金", "手元に残しておきたい最低限の金額")
    ],
    compute: computeCashFlow,
    validateExtra: (v) => {
      const errors = [];
      for (const prefix of ["specialIn", "specialOut"]) {
        for (const n of [1, 2]) {
          const day = v[`${prefix}Day${n}`];
          const amt = v[`${prefix}Amount${n}`];
          const label = prefix === "specialIn" ? `入金予定${n}` : `支出予定${n}`;
          if (isNum(day) && !isNum(amt)) errors.push({ field: `${prefix}Amount${n}`, message: `${label}の金額も入力してください` });
          if (!isNum(day) && isNum(amt)) errors.push({ field: `${prefix}Day${n}`, message: `${label}の日も入力してください` });
          if (isNum(day) && isNum(v.periodDays) && day > v.periodDays) {
            errors.push({ field: `${prefix}Day${n}`, message: `${label}の日は、対象の日数以内で入力してください` });
          }
        }
      }
      return errors;
    }
  },
  {
    id: "soundness",
    no: 7,
    title: "財務健全性",
    question: "会社の財務の構成はどうなっている？",
    description: "貸借対照表の数字から、財務の構成の割合（7つの指標）を試算します。",
    fields: [
      amount("currentAssets", "流動資産", "1年以内に現金化できる資産"),
      amount("quickAssets", "当座資産", "現預金・売掛金・有価証券など、すぐに現金化できる資産"),
      amount("fixedAssets", "固定資産", "建物・土地・機械など、長く使う資産"),
      amount("totalAssets", "資産合計", "資産の全部の合計"),
      amount("currentLiabilities", "流動負債", "1年以内に支払う負債"),
      amount("fixedLiabilities", "固定負債", "長期借入金など、1年を超えて支払う負債"),
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
    description: "4種類の利益率と、資産に対する利益の割合を試算します。",
    fields: [
      amount("salesAmount", "売上高", ""),
      amount("grossProfit", "売上総利益", "売上高から売上原価を引いた金額（粗利益）", { allowNegative: true }),
      amount("operatingProfit", "営業利益", "本業で得た利益", { allowNegative: true }),
      amount("ordinaryProfit", "経常利益", "通常の活動全体での利益", { allowNegative: true }),
      amount("netProfit", "当期純利益", "税金などを引いたあと、最終的に残る利益", { allowNegative: true }),
      amount("totalAssets", "資産合計", "資産の全部の合計"),
      percent("targetOrdinaryMarginRatePercent", "目標経常利益率", "必要な経常利益の計算に使います（%）")
    ],
    compute: computeProfitability
  },
  {
    id: "growth",
    no: 9,
    title: "成長率",
    question: "前期と比べて、どれだけ伸びた？",
    description: "売上高と経常利益の増減額と成長率を試算します。",
    fields: [
      amount("previousSalesAmount", "前期の売上高", "", { required: true }),
      amount("currentSalesAmount", "今期の売上高", "", { required: true }),
      amount("previousOrdinaryProfit", "前期の経常利益", "入力すると、経常利益の増減と成長率も表示します", { allowNegative: true }),
      amount("currentOrdinaryProfit", "今期の経常利益", "入力すると、経常利益の増減と成長率も表示します", { allowNegative: true })
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
// Validation（総整理 5章・確定式一覧14章：入力検証は計算層と分ける）
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
  if (typeof sim.validateExtra === "function") {
    errors.push(...sim.validateExtra(values));
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
    pl.PL003 = monthly.M101;
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
      series.push({ endDate: agg.endYearMonth, sales: agg.figures.M001 });
    }
  }
  series.sort((a, b) => a.endDate.localeCompare(b.endDate));

  // 成長率用：経常利益は直近2期の年次登録から取る
  const ordinaryPair = { previous: null, current: null };
  if (periods.length >= 2) {
    const prev = getAnnualFigures(periods[periods.length - 2]);
    const cur = getAnnualFigures(periods[periods.length - 1]);
    ordinaryPair.previous = prev.PL020;
    ordinaryPair.current = cur.PL020;
  }

  return { pl, bs, monthly, series, ordinaryPair, sources };
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
  const { pl, bs, monthly, series, ordinaryPair, sources } = collectCompanyFigures(company);
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
      put("grossProfit", isNum(pl.PL003) ? pl.PL003 : monthly?.M101);
      break;
    }
    case "loan": {
      // 旧借入条件の初期値は登録データに無いため、試算固有の項目は手入力とする
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
      put("fixedLiabilities", bs?.BS021);
      put("totalLiabilities", bs?.BS022);
      put("netAssets", bs?.BS026);
      if (isNum(bs?.BS001) && isNum(bs?.BS002) && isNum(bs?.BS003)) {
        values.quickAssets = bs.BS001 + bs.BS002 + bs.BS003;
      }
      break;
    }
    case "profitability": {
      put("salesAmount", pl.PL001);
      put("grossProfit", pl.PL003);
      put("operatingProfit", pl.PL017);
      put("ordinaryProfit", pl.PL020);
      put("netProfit", pl.PL025);
      put("totalAssets", bs?.BS012);
      break;
    }
    case "growth": {
      if (series.length >= 2) {
        put("previousSalesAmount", series[series.length - 2].sales);
        put("currentSalesAmount", series[series.length - 1].sales);
        put("previousOrdinaryProfit", ordinaryPair.previous);
        put("currentOrdinaryProfit", ordinaryPair.current);
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
