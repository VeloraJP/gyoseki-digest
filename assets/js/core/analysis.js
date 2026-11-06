import { REGISTRATION_STAGES } from "../config/constants.js";
import { buildMonthlyAggregate, getAnnualFigures, listFiscalKeys } from "./calc.js";

// 自動業績分析の対象期と比較期の選定（仕様書 6.1）
// 1. 最新の年次登録（比較は直前の年次登録）
// 2. 年次登録がない場合は、最新の月次集計による簡易年次（比較は直前の月次集計のみ。年次登録とは混ぜない）
export function selectAnalysisTarget(company) {
  const periods = [...(company.annualPeriods ?? [])]
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (periods.length > 0) {
    const target = periods[periods.length - 1];
    const previous = periods.length > 1 ? periods[periods.length - 2] : null;
    return {
      kind: "annual",
      target: {
        kind: "annual",
        label: target.displayName,
        stage: target.stage,
        period: target,
        figures: getAnnualFigures(target)
      },
      previous: previous
        ? {
            kind: "annual",
            label: previous.displayName,
            stage: previous.stage,
            period: previous,
            figures: getAnnualFigures(previous)
          }
        : null
    };
  }

  const aggregates = listFiscalKeys(company)
    .map((key) => buildMonthlyAggregate(company, key))
    .filter((a) => a !== null)
    .sort((a, b) => a.fiscalKey.localeCompare(b.fiscalKey));
  if (aggregates.length > 0) {
    const toTarget = (agg) => ({
      kind: "monthlyAggregate",
      label: (() => { const [y, m] = agg.fiscalKey.split("-"); return `${y}年${Number(m)}月期`; })(),
      stage: null,
      figures: { PL001: agg.sales, PL025: agg.netIncome },
      monthlyFigures: agg.figures
    });
    const target = aggregates[aggregates.length - 1];
    const previous = aggregates.length > 1 ? aggregates[aggregates.length - 2] : null;
    return {
      kind: "monthlyAggregate",
      target: toTarget(target),
      previous: previous ? toTarget(previous) : null
    };
  }

  return { kind: "none", target: null, previous: null };
}

// 比較できる項目コード。要因リストは両方が標準登録の場合だけ。
export function analysisComparison(selection) {
  const { target, previous } = selection;
  if (!target || !previous) return { codes: [], showFactors: false };
  const bothStandard =
    target.kind === "annual" && previous.kind === "annual" &&
    target.stage === REGISTRATION_STAGES.STANDARD &&
    previous.stage === REGISTRATION_STAGES.STANDARD;
  return { codes: ["PL001", "PL025"], showFactors: bothStandard };
}
