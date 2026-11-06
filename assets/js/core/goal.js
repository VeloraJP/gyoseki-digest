import { REGISTRATION_STAGES } from "../config/constants.js";
import { FIXED_COST_CODES, VARIABLE_COST_CODES } from "../data/fields.js";
import {
  findMonthlyRecord,
  getAnnualFigures,
  getMonthlyFigures
} from "./calc.js";
import { shiftYearMonth } from "./compare.js";

// 目標と必要売上の計算（発展フェーズ、SIM-06発展系①〜④）
// 考え方は仕様書 8 の損益分岐点の計算と同じ。
//   限界利益率 ＝（売上高 − 変動費合計）÷ 売上高
//   必要売上高 ＝（固定費合計 ＋ 目標営業利益）÷ 限界利益率
// 経常利益・当期純利益を目標にする場合は、対象期の実績構造
// （営業外損益・特別損益・法人税等が同じという前提）で営業利益へ換算する。
// 前提が増える当期純利益ベースは「概算」として扱う。

function sumCodes(figures, codes) {
  let total = 0;
  for (const code of codes) {
    const v = figures[code];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

// 対象期の費用構造。標準登録でない、または必要項目が欠ける場合は null。
export function getCostStructure(period) {
  if (!period || period.stage !== REGISTRATION_STAGES.STANDARD) return null;
  const figures = getAnnualFigures(period);
  const variableCosts = sumCodes(figures, VARIABLE_COST_CODES);
  const fixedCosts = sumCodes(figures, FIXED_COST_CODES);
  const sales = figures.PL001;
  if (variableCosts === null || fixedCosts === null || typeof sales !== "number") return null;
  const marginalProfitRate = sales > 0 ? (sales - variableCosts) / sales : null;
  return { sales, variableCosts, fixedCosts, marginalProfitRate, figures };
}

// 目標（利益の種類と金額）を、必要売上高の計算に使う目標営業利益へ換算する。
// 換算できない（前提になる実績値が欠ける）場合は null。
export function convertGoalToOperatingProfit(period, profitCode, amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const figures = getAnnualFigures(period);
  if (profitCode === "PL017") {
    return { operatingProfitTarget: amount, approximate: false };
  }
  const nonOperatingBalance = sumCodes(figures, ["PL018"]) !== null && typeof figures.PL019 === "number"
    ? figures.PL018 - figures.PL019
    : null;
  if (nonOperatingBalance === null) return null;
  if (profitCode === "PL020") {
    // 経常利益 ＝ 営業利益 ＋ 営業外収益 − 営業外費用
    return { operatingProfitTarget: amount - nonOperatingBalance, approximate: false };
  }
  if (profitCode === "PL025") {
    // 当期純利益 ＝ 営業利益 ＋ 営業外損益 ＋ 特別損益 − 法人税等
    if (typeof figures.PL021 !== "number" || typeof figures.PL022 !== "number" || typeof figures.PL024 !== "number") {
      return null;
    }
    const specialBalance = figures.PL021 - figures.PL022;
    return {
      operatingProfitTarget: amount + figures.PL024 - nonOperatingBalance - specialBalance,
      approximate: true
    };
  }
  return null;
}

// 必要売上高・差額・達成率の主計算。
// 計算できない場合は ok: false と理由コードを返す（数値を推測で作らない）。
export function computeRequiredSales(period, goal) {
  if (!period || period.stage !== REGISTRATION_STAGES.STANDARD) {
    return { ok: false, reason: "NOT_STANDARD" };
  }
  if (!goal || typeof goal.amount !== "number") {
    return { ok: false, reason: "NO_GOAL" };
  }
  const structure = getCostStructure(period);
  if (!structure) return { ok: false, reason: "MISSING_FIGURES" };
  if (!(structure.sales > 0)) {
    return { ok: false, reason: "NO_SALES", ...structure };
  }
  if (structure.marginalProfitRate === null || structure.marginalProfitRate <= 0) {
    return { ok: false, reason: "RATE_NOT_POSITIVE", ...structure };
  }
  const converted = convertGoalToOperatingProfit(period, goal.profitCode, goal.amount);
  if (!converted) return { ok: false, reason: "MISSING_FIGURES", ...structure };

  const requiredSales = Math.round(
    (structure.fixedCosts + converted.operatingProfitTarget) / structure.marginalProfitRate
  );
  const additionalSales = Math.max(0, requiredSales - structure.sales);
  const achievementRate = requiredSales > 0 ? (structure.sales / requiredSales) * 100 : null;
  return {
    ok: true,
    goalType: goal.profitCode,
    goalAmount: goal.amount,
    approximate: converted.approximate,
    operatingProfitTarget: converted.operatingProfitTarget,
    sales: structure.sales,
    variableCosts: structure.variableCosts,
    fixedCosts: structure.fixedCosts,
    marginalProfitRate: structure.marginalProfitRate,
    requiredSales,
    additionalSales,
    achievementRate,
    alreadyAchieved: additionalSales === 0
  };
}

// 複数案の比較（発展系④の限定形）。同じ基礎データのまま、目標額だけを変える。
// 案は保存しない、その場の計算結果だけを返す。
export function compareGoalPlans(period, profitCode, amounts) {
  return amounts.map((amount) => ({
    amount,
    result: computeRequiredSales(period, { profitCode, amount })
  }));
}

// 進捗の対象となる12か月（目標を設定した期の翌期）。
// 目標は、基礎データとなった決算期の実績構造を使って「次の1年」で達成を目指すものとして扱う。
// 目標期そのものの月次は、その期の実績として年次登録と重なるため、進捗には使わない。
export function progressYearMonths(period) {
  const endYm = period?.endDate?.slice(0, 7) ?? "";
  if (!/^\d{4}-\d{2}$/.test(endYm)) return [];
  const months = [];
  let ym = shiftYearMonth(endYm, 1);
  for (let i = 0; i < 12; i += 1) {
    months.push(ym);
    ym = shiftYearMonth(ym, 1);
  }
  return months;
}

// 進捗表示（発展系②）。目標を設定した期の翌期の月次記録で計算する。
// 翌期の月次記録が1件もない場合は null（この部分自体を出さない）。
export function computeGoalProgress(company, period, requiredResult) {
  if (!company || !period || !requiredResult?.ok) return null;
  const months = progressYearMonths(period);
  if (months.length === 0) return null;
  const records = months
    .map((ym) => findMonthlyRecord(company, ym))
    .filter((r) => r !== null);
  if (records.length === 0) return null;

  const latestYm = records[records.length - 1].yearMonth;
  const elapsedMonths = months.slice(0, months.indexOf(latestYm) + 1);
  const missingMonths = elapsedMonths.filter((ym) => !findMonthlyRecord(company, ym));

  let cumulativeSales = 0;
  let cumulativeNetIncome = 0;
  let cumulativeOperatingProfit = 0;
  for (const record of records) {
    const figures = getMonthlyFigures(record);
    if (typeof figures.M001 === "number") cumulativeSales += figures.M001;
    if (typeof figures.M007 === "number") cumulativeNetIncome += figures.M007;
    if (typeof figures.M103 === "number") cumulativeOperatingProfit += figures.M103;
  }

  const registeredCount = records.length;
  const remainingMonthCount = months.length - elapsedMonths.length;
  const remainingSales = Math.max(0, requiredResult.requiredSales - cumulativeSales);
  const requiredMonthlyAverage = remainingMonthCount > 0
    ? Math.round(remainingSales / remainingMonthCount)
    : null;
  const actualMonthlyAverage = registeredCount > 0
    ? Math.round(cumulativeSales / registeredCount)
    : null;
  const salesProgressRate = requiredResult.requiredSales > 0
    ? (cumulativeSales / requiredResult.requiredSales) * 100
    : null;

  // 利益そのものの進捗は、月次で直接比べられる種類だけ出す。
  // 当期純利益は月次M007、営業利益は月次M103（営業利益）と対応する。
  // 経常利益は月次に直接対応する項目がないため出さない。
  let profitProgress = null;
  if (requiredResult.goalType === "PL025" || requiredResult.goalType === "PL017") {
    const actual = requiredResult.goalType === "PL025" ? cumulativeNetIncome : cumulativeOperatingProfit;
    const target = requiredResult.goalAmount;
    profitProgress = {
      profitCode: requiredResult.goalType,
      actual,
      target,
      rate: target > 0 ? (actual / target) * 100 : null
    };
  }

  const [labelYear, labelMonth] = months[months.length - 1].split("-");
  return {
    months,
    fiscalLabel: `${labelYear}年${Number(labelMonth)}月期`,
    elapsedMonths,
    missingMonths,
    registeredCount,
    cumulativeSales,
    cumulativeNetIncome,
    cumulativeOperatingProfit,
    latestYearMonth: latestYm,
    remainingMonthCount,
    remainingSales,
    requiredMonthlyAverage,
    actualMonthlyAverage,
    salesProgressRate,
    profitProgress
  };
}

// 目標を設定した最新の年次期。
export function latestGoalPeriod(company) {
  const withGoal = [...(company?.annualPeriods ?? [])]
    .filter((p) => p.goal && typeof p.goal.amount === "number")
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  return withGoal[withGoal.length - 1] ?? null;
}

// ホーム画面の要約用。目標があり、計算できる場合だけ返す。
export function computeGoalSummary(company) {
  const period = latestGoalPeriod(company);
  if (!period) return null;
  const result = computeRequiredSales(period, period.goal);
  if (!result.ok) return null;
  const progress = computeGoalProgress(company, period, result);
  return {
    period,
    goal: period.goal,
    result,
    progress,
    remainingSales: progress ? progress.remainingSales : result.additionalSales
  };
}
