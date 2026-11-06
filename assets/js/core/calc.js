import { REGISTRATION_STAGES } from "../config/constants.js";
import {
  BS_FIELDS,
  MONTHLY_INPUT_CODES,
  PL_FIELDS
} from "../data/fields.js";

// 入力値の取得。未入力（null/undefined/数値でない）は null を返す。
function num(values, code) {
  const v = values?.[code];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// すべて揃っている場合だけ合計する。欠けていれば null（推測で補わない）。
function sumAll(values, codes) {
  let total = 0;
  for (const code of codes) {
    const v = num(values, code);
    if (v === null) return null;
    total += v;
  }
  return total;
}

function sub(a, b) {
  return a === null || b === null ? null : a - b;
}

function add(a, b) {
  return a === null || b === null ? null : a + b;
}

// 年次期の全項目（入力＋自動計算）を解決する。自動計算項目は保持せず、入力値から再計算する。
export function getAnnualFigures(period) {
  const figures = {};
  for (const f of PL_FIELDS) figures[f.id] = null;
  if (!period) return figures;
  const values = period.values ?? {};

  if (period.stage === REGISTRATION_STAGES.SIMPLE) {
    figures.PL001 = num(values, "PL001");
    figures.PL025 = num(values, "PL025");
    return figures;
  }

  for (const f of PL_FIELDS) {
    if (!f.auto) figures[f.id] = num(values, f.id);
  }
  figures.PL003 = sub(figures.PL001, figures.PL002);
  figures.PL007 = sumAll(values, ["PL004", "PL005", "PL006"]);
  figures.PL016 = sumAll(values, [
    "PL004", "PL005", "PL006", "PL008", "PL010",
    "PL011", "PL012", "PL013", "PL014", "PL015"
  ]);
  figures.PL017 = sub(figures.PL003, figures.PL016);
  figures.PL020 = sub(add(figures.PL017, figures.PL018), figures.PL019);
  figures.PL023 = sub(add(figures.PL020, figures.PL021), figures.PL022);
  figures.PL025 = sub(figures.PL023, figures.PL024);
  return figures;
}

// B/S任意登録の全項目を解決する。自動計算項目は business-tool2-2 と同じ考え方で再計算する。
export function getBSFigures(bsValues) {
  const figures = {};
  for (const f of BS_FIELDS) figures[f.id] = null;
  if (!bsValues) return figures;
  for (const f of BS_FIELDS) {
    if (!f.auto) figures[f.id] = num(bsValues, f.id);
  }
  figures.BS005 = sumAll(bsValues, ["BS001", "BS002", "BS003", "BS004"]);
  figures.BS011 = sumAll(bsValues, ["BS006", "BS007", "BS008", "BS009", "BS010"]);
  figures.BS012 = add(figures.BS005, figures.BS011);
  figures.BS018 = sumAll(bsValues, ["BS013", "BS014", "BS015", "BS016", "BS017"]);
  figures.BS021 = sumAll(bsValues, ["BS019", "BS020"]);
  figures.BS022 = add(figures.BS018, figures.BS021);
  figures.BS026 = sumAll(bsValues, ["BS023", "BS024", "BS025"]);
  figures.BS027 = add(figures.BS022, figures.BS026);
  return figures;
}

// 月次記録の全項目（入力7項目＋自動計算4項目）を解決する。
export function getMonthlyFigures(record) {
  const figures = {};
  for (const code of MONTHLY_INPUT_CODES) figures[code] = null;
  figures.M101 = null;
  figures.M102 = null;
  figures.M103 = null;
  figures.M104 = null;
  if (!record) return figures;
  const values = record.values ?? {};
  for (const code of MONTHLY_INPUT_CODES) figures[code] = num(values, code);
  figures.M101 = sub(figures.M001, figures.M002);
  figures.M102 = sumAll(values, ["M003", "M004", "M005", "M006"]);
  figures.M103 = sub(figures.M101, figures.M102);
  figures.M104 = sub(figures.M007, figures.M103);
  return figures;
}

// 決算期キー（仕様書 4.2）。決算月を表す "YYYY-MM" を返す。
// 対象月が決算月以前の月であればその暦年に決算月が来る期、後の月であれば翌暦年に決算月が来る期。
export function fiscalPeriodKey(yearMonth, closingMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const fiscalYear = month <= closingMonth ? year : year + 1;
  return `${fiscalYear}-${String(closingMonth).padStart(2, "0")}`;
}

// 決算期に属する12か月（期首月→決算月の順）
export function fiscalPeriodMonths(fiscalKey, closingMonth) {
  const [fiscalYear] = fiscalKey.split("-").map(Number);
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const offset = closingMonth - 11 + i;
    const year = fiscalYear + Math.floor((offset - 1) / 12);
    const month = ((offset - 1 + 12) % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

export function findMonthlyRecord(company, yearMonth) {
  return company?.monthlyRecords?.find((r) => r.yearMonth === yearMonth) ?? null;
}

// 月次集計による簡易年次（仕様書 4.5）。
// 同一決算期の月次記録が12か月そろっている場合だけ、合計を表示用に生成する。保存はしない。
export function buildMonthlyAggregate(company, fiscalKey) {
  if (!company) return null;
  const months = fiscalPeriodMonths(fiscalKey, company.closingMonth);
  const records = months.map((ym) => findMonthlyRecord(company, ym));
  if (records.some((r) => r === null)) return null;

  const sums = {};
  for (const code of MONTHLY_INPUT_CODES) sums[code] = 0;
  for (const record of records) {
    const figures = getMonthlyFigures(record);
    for (const code of MONTHLY_INPUT_CODES) {
      if (figures[code] === null) return null;
      sums[code] += figures[code];
    }
  }
  const aggregated = { values: sums };
  const figures = getMonthlyFigures(aggregated);
  return {
    kind: "monthlyAggregate",
    fiscalKey,
    endYearMonth: fiscalKey,
    figures,
    // 年次表示と対応付けるための代表値
    sales: figures.M001,
    netIncome: figures.M007
  };
}

// 会社が持つすべての決算期キー（月次記録から）
export function listFiscalKeys(company) {
  if (!company) return [];
  const keys = new Set(
    (company.monthlyRecords ?? []).map((r) => fiscalPeriodKey(r.yearMonth, company.closingMonth))
  );
  return [...keys].sort();
}
