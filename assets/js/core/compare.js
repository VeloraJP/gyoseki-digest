import { FACTOR_CANDIDATE_CODES, fieldLabel } from "../data/fields.js";
import {
  fiscalPeriodKey,
  fiscalPeriodMonths,
  findMonthlyRecord,
  getAnnualFigures,
  getMonthlyFigures
} from "./calc.js";

// 増減額・増減率（仕様書 6.3 の式で統一）
// 比較値が0または欠けている場合は増減率を null とし、画面では「—」と表示する。
export function diffPair(current, previous) {
  if (typeof current !== "number" || typeof previous !== "number") {
    return { current: current ?? null, previous: previous ?? null, amount: null, rate: null };
  }
  const amount = current - previous;
  const rate = previous === 0 ? null : (amount / previous) * 100;
  return { current, previous, amount, rate };
}

// 要因リスト（仕様書 6.3）
// 対象期と比較期の両方が標準登録の場合だけ使う。増減額の絶対値が大きい順に上位5項目。
export function buildFactorList(currentPeriod, previousPeriod) {
  const current = getAnnualFigures(currentPeriod);
  const previous = getAnnualFigures(previousPeriod);
  const items = [];
  for (const code of FACTOR_CANDIDATE_CODES) {
    const d = diffPair(current[code], previous[code]);
    if (d.amount === null) continue;
    items.push({ code, label: fieldLabel(code), ...d });
  }
  items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return items.slice(0, 5);
}

export function shiftYearMonth(yearMonth, deltaMonths) {
  const [year, month] = yearMonth.split("-").map(Number);
  const total = year * 12 + (month - 1) + deltaMonths;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// 当年度累計（仕様書 7.3）
// 対象月が属する決算期の期首月から対象月まで、登録済みの月次記録だけを合計する。
// 未登録月は0で補わず、月数と未登録の有無を返す。
export function monthlyCumulative(company, targetYearMonth) {
  const fiscalKey = fiscalPeriodKey(targetYearMonth, company.closingMonth);
  const allMonths = fiscalPeriodMonths(fiscalKey, company.closingMonth);
  const targetIndex = allMonths.indexOf(targetYearMonth);
  const range = targetIndex >= 0 ? allMonths.slice(0, targetIndex + 1) : [targetYearMonth];

  const sums = {};
  const codes = ["M001", "M002", "M003", "M004", "M005", "M006", "M007", "M101", "M102", "M103", "M104"];
  for (const code of codes) sums[code] = 0;
  const missingMonths = [];
  let registeredCount = 0;

  for (const ym of range) {
    const record = findMonthlyRecord(company, ym);
    if (!record) {
      missingMonths.push(ym);
      continue;
    }
    registeredCount += 1;
    const figures = getMonthlyFigures(record);
    for (const code of codes) {
      if (typeof figures[code] === "number") sums[code] += figures[code];
    }
  }

  return {
    fiscalKey,
    rangeMonths: range,
    registeredCount,
    missingMonths,
    figures: sums
  };
}

// 前年同期との累計比較（仕様書 7.3）
// 対象月の当年度累計と、前年の同じ決算期の同じ月までの累計を比べる。
// どちらかの範囲に未登録月がある場合は、そろっていない数字同士を比べない
// （未登録月を0で補わない）。比べられない理由は status で返す。
// - no-prior-data: 前年の範囲に月次記録が1件もない
// - prior-incomplete: 前年の範囲に未登録月がある
// - current-incomplete: 当年度の範囲に未登録月がある
export function priorYearCumulativeComparison(company, targetYearMonth) {
  const current = monthlyCumulative(company, targetYearMonth);
  const priorTargetYearMonth = shiftYearMonth(targetYearMonth, -12);
  const prior = monthlyCumulative(company, priorTargetYearMonth);

  let status = "ok";
  if (prior.registeredCount === 0) status = "no-prior-data";
  else if (prior.missingMonths.length > 0) status = "prior-incomplete";
  else if (current.missingMonths.length > 0) status = "current-incomplete";

  const diffs = {};
  if (status === "ok") {
    for (const code of Object.keys(current.figures)) {
      diffs[code] = diffPair(current.figures[code], prior.figures[code]);
    }
  }

  return { current, prior, priorTargetYearMonth, status, comparable: status === "ok", diffs };
}
