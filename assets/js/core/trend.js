import { getAnnualFigures, getMonthlyFigures } from "./calc.js";

// 推移グラフ用のデータ整形（追加フェーズ）。
// 登録済みデータだけを使い、無い月・無い項目を0で補うことはしない。

export const MONTHLY_TREND_LIMIT = 12;

// 月次の推移。直近 MONTHLY_TREND_LIMIT 件までを対象とし、それより多い場合は
// truncated: true を返して、画面で「直近◯か月を表示」と伝える。
// 各系列は { yearMonth, value } の配列（値が無い月はその系列から除く）。
export function buildMonthlyTrend(company, limit = MONTHLY_TREND_LIMIT) {
  const records = [...(company?.monthlyRecords ?? [])]
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const truncated = records.length > limit;
  const target = truncated ? records.slice(records.length - limit) : records;

  const series = { M001: [], M103: [], M007: [] };
  for (const record of target) {
    const figures = getMonthlyFigures(record);
    for (const code of Object.keys(series)) {
      if (typeof figures[code] === "number") {
        series[code].push({ yearMonth: record.yearMonth, value: figures[code] });
      }
    }
  }
  return {
    count: target.length,
    truncated,
    limit,
    firstYearMonth: target[0]?.yearMonth ?? null,
    lastYearMonth: target[target.length - 1]?.yearMonth ?? null,
    series
  };
}

// 年次の推移。期の並びは終了日順。
// 営業利益（PL017）は、すべての期で値がそろう場合だけ系列として返す
// （簡易登録の期が混ざると内訳がないため、系列ごと出さない）。
export function buildAnnualTrend(company) {
  const periods = [...(company?.annualPeriods ?? [])]
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const points = periods.map((period) => {
    const figures = getAnnualFigures(period);
    return {
      periodId: period.id,
      label: period.displayName,
      endDate: period.endDate,
      stage: period.stage,
      PL001: figures.PL001,
      PL017: figures.PL017,
      PL025: figures.PL025
    };
  });
  const hasOperating = points.length > 0 && points.every((p) => typeof p.PL017 === "number");
  return { count: points.length, points, hasOperating };
}
