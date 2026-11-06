import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyAggregate,
  fiscalPeriodKey,
  fiscalPeriodMonths,
  getAnnualFigures,
  getBSFigures,
  getMonthlyFigures
} from "../assets/js/core/calc.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord } from "../assets/js/data/schema.js";

const STANDARD_VALUES = {
  PL001: 100_000_000, PL002: 60_000_000,
  PL004: 6_000_000, PL005: 12_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000,
  PL013: 800_000, PL014: 500_000, PL015: 4_000_000,
  PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 200_000, PL024: 1_500_000
};

test("年次標準登録の自動計算7項目が仕様書の計算式と一致する", () => {
  const period = createAnnualPeriod({ stage: "STANDARD", values: { ...STANDARD_VALUES } });
  const f = getAnnualFigures(period);
  assert.equal(f.PL003, 40_000_000); // 100,000,000 - 60,000,000
  assert.equal(f.PL007, 20_000_000); // 6,000,000 + 12,000,000 + 2,000,000
  assert.equal(f.PL016, 30_200_000); // 人件費合計 + 家賃 + 光熱 + 広告 + 手数料 + 償却 + その他固定 + その他変動
  assert.equal(f.PL017, 9_800_000); // 40,000,000 - 30,200,000
  assert.equal(f.PL020, 9_200_000); // 9,800,000 + 100,000 - 700,000
  assert.equal(f.PL023, 9_000_000); // 9,200,000 + 0 - 200,000
  assert.equal(f.PL025, 7_500_000); // 9,000,000 - 1,500,000
});

test("年次標準登録で入力が欠けている自動計算項目はnullになる（推測で補わない）", () => {
  const period = createAnnualPeriod({ stage: "STANDARD", values: { PL001: 1000, PL002: 400 } });
  const f = getAnnualFigures(period);
  assert.equal(f.PL003, 600);
  assert.equal(f.PL007, null);
  assert.equal(f.PL017, null);
  assert.equal(f.PL025, null);
});

test("年次簡易登録では売上高と当期純利益だけが返る", () => {
  const period = createAnnualPeriod({ stage: "SIMPLE", values: { PL001: 50_000_000, PL025: -2_000_000 } });
  const f = getAnnualFigures(period);
  assert.equal(f.PL001, 50_000_000);
  assert.equal(f.PL025, -2_000_000);
  assert.equal(f.PL017, null);
});

test("月次の自動計算4項目が仕様書の計算式と一致する", () => {
  const record = createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 }
  });
  const f = getMonthlyFigures(record);
  assert.equal(f.M101, 4_000_000);
  assert.equal(f.M102, 2_900_000);
  assert.equal(f.M103, 1_100_000);
  assert.equal(f.M104, -300_000); // 800,000 - 1,100,000
});

test("B/Sの自動計算項目が合計として再計算される", () => {
  const f = getBSFigures({
    BS001: 100, BS002: 50, BS003: 30, BS004: 20,
    BS006: 200, BS007: 300, BS008: 0, BS009: 10, BS010: 0,
    BS013: 40, BS014: 100, BS015: 10, BS016: 5, BS017: 0,
    BS019: 400, BS020: 0, BS023: 100, BS024: 155, BS025: 0
  });
  assert.equal(f.BS005, 200);
  assert.equal(f.BS011, 510);
  assert.equal(f.BS012, 710);
  assert.equal(f.BS018, 155);
  assert.equal(f.BS021, 400);
  assert.equal(f.BS022, 555);
  assert.equal(f.BS026, 255);
  assert.equal(f.BS027, 810);
});

test("決算期キーは仕様書4.2の規則どおり（3月決算）", () => {
  assert.equal(fiscalPeriodKey("2026-04", 3), "2027-03");
  assert.equal(fiscalPeriodKey("2027-03", 3), "2027-03");
  assert.equal(fiscalPeriodKey("2027-02", 3), "2027-03");
  assert.equal(fiscalPeriodKey("2026-12", 3), "2027-03");
});

test("決算期キーは12月決算でも正しい", () => {
  assert.equal(fiscalPeriodKey("2026-01", 12), "2026-12");
  assert.equal(fiscalPeriodKey("2026-12", 12), "2026-12");
});

test("決算期の12か月は期首月から決算月の順になる", () => {
  const months = fiscalPeriodMonths("2027-03", 3);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2026-04");
  assert.equal(months[11], "2027-03");
});

test("月次集計による簡易年次は12か月そろった場合だけ生成される", () => {
  const company = createCompany({ closingMonth: 3 });
  const months = fiscalPeriodMonths("2027-03", 3);
  for (const ym of months.slice(0, 11)) {
    company.monthlyRecords.push(createMonthlyRecord({
      yearMonth: ym,
      values: { M001: 100, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 8 }
    }));
  }
  assert.equal(buildMonthlyAggregate(company, "2027-03"), null);
  company.monthlyRecords.push(createMonthlyRecord({
    yearMonth: months[11],
    values: { M001: 100, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 8 }
  }));
  const agg = buildMonthlyAggregate(company, "2027-03");
  assert.equal(agg.sales, 1200);
  assert.equal(agg.netIncome, 96);
  assert.equal(agg.figures.M103, 11 * 12); // (100-60) - (20+3+2+4) = 11 /月
});
