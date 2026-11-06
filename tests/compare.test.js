import test from "node:test";
import assert from "node:assert/strict";
import { buildFactorList, diffPair, monthlyCumulative, priorYearCumulativeComparison, shiftYearMonth } from "../assets/js/core/compare.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord } from "../assets/js/data/schema.js";

test("増減額と増減率は仕様書6.3の式どおり", () => {
  const d = diffPair(120, 100);
  assert.equal(d.amount, 20);
  assert.equal(d.rate, 20);
  const down = diffPair(80, 100);
  assert.equal(down.amount, -20);
  assert.equal(down.rate, -20);
});

test("比較値が0の場合は増減率を表示しない（null）", () => {
  const d = diffPair(100, 0);
  assert.equal(d.amount, 100);
  assert.equal(d.rate, null);
});

test("値が欠けている場合は増減を計算しない", () => {
  const d = diffPair(null, 100);
  assert.equal(d.amount, null);
  assert.equal(d.rate, null);
});

function standardPeriod(values) {
  const base = {
    PL001: 1000, PL002: 600, PL004: 60, PL005: 120, PL006: 20, PL008: 36,
    PL010: 6, PL011: 4, PL012: 3, PL013: 8, PL014: 5, PL015: 40,
    PL018: 1, PL019: 7, PL021: 0, PL022: 2, PL024: 15
  };
  return createAnnualPeriod({ stage: "STANDARD", values: { ...base, ...values } });
}

test("要因リストは増減額の絶対値が大きい順に上位5項目まで", () => {
  const previous = standardPeriod({});
  const current = standardPeriod({
    PL001: 1500, // +500
    PL002: 700, // +100
    PL005: 220, // +100
    PL008: 136, // +100
    PL015: 90, // +50
    PL024: 45 // +30
  });
  const factors = buildFactorList(current, previous);
  assert.equal(factors.length, 5);
  assert.equal(factors[0].code, "PL001");
  assert.equal(factors[0].amount, 500);
  // PL024（+30）は6位なので含まれない
  assert.ok(!factors.some((f) => f.code === "PL024"));
  // 合計項目・内数は候補に含まれない
  assert.ok(!factors.some((f) => ["PL003", "PL007", "PL009", "PL016", "PL017", "PL025"].includes(f.code)));
});

test("年月の前後計算", () => {
  assert.equal(shiftYearMonth("2027-01", -1), "2026-12");
  assert.equal(shiftYearMonth("2026-10", -12), "2025-10");
  assert.equal(shiftYearMonth("2026-12", 1), "2027-01");
});

const CUR_VALUES = { M001: 100, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 9 };
const PRIOR_VALUES = { M001: 80, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 6 };

function addMonths(company, yearMonths, values) {
  for (const ym of yearMonths) {
    company.monthlyRecords.push(createMonthlyRecord({ yearMonth: ym, values: { ...values } }));
  }
}

test("前年同期累計比較：両年そろっていれば累計同士を比べる", () => {
  const company = createCompany({ closingMonth: 3 });
  addMonths(company, ["2026-04", "2026-05", "2026-06"], CUR_VALUES);
  addMonths(company, ["2025-04", "2025-05", "2025-06"], PRIOR_VALUES);
  const result = priorYearCumulativeComparison(company, "2026-06");
  assert.equal(result.status, "ok");
  assert.equal(result.comparable, true);
  assert.equal(result.priorTargetYearMonth, "2025-06");
  // 期の途中（3か月目）までの累計同士の比較になっている
  assert.equal(result.current.figures.M001, 300);
  assert.equal(result.prior.figures.M001, 240);
  assert.equal(result.diffs.M001.amount, 60);
  assert.equal(result.diffs.M001.rate, 25);
  assert.equal(result.diffs.M007.amount, 9);
  assert.equal(result.diffs.M007.rate, 50);
});

test("前年同期累計比較：期首月は1か月分同士の比較になる", () => {
  const company = createCompany({ closingMonth: 3 });
  addMonths(company, ["2026-04"], CUR_VALUES);
  addMonths(company, ["2025-04"], PRIOR_VALUES);
  const result = priorYearCumulativeComparison(company, "2026-04");
  assert.equal(result.comparable, true);
  assert.equal(result.diffs.M001.amount, 20);
});

test("前年同期累計比較：前年の登録がまったくない場合は比べない", () => {
  const company = createCompany({ closingMonth: 3 });
  addMonths(company, ["2026-04", "2026-05", "2026-06"], CUR_VALUES);
  const result = priorYearCumulativeComparison(company, "2026-06");
  assert.equal(result.status, "no-prior-data");
  assert.equal(result.comparable, false);
  assert.deepEqual(result.diffs, {});
});

test("前年同期累計比較：前年に未登録月がある場合は比べない", () => {
  const company = createCompany({ closingMonth: 3 });
  addMonths(company, ["2026-04", "2026-05", "2026-06"], CUR_VALUES);
  addMonths(company, ["2025-04", "2025-06"], PRIOR_VALUES); // 2025-05 が未登録
  const result = priorYearCumulativeComparison(company, "2026-06");
  assert.equal(result.status, "prior-incomplete");
  assert.equal(result.comparable, false);
});

test("前年同期累計比較：当年度に未登録月がある場合は比べない", () => {
  const company = createCompany({ closingMonth: 3 });
  addMonths(company, ["2026-04", "2026-06"], CUR_VALUES); // 2026-05 が未登録
  addMonths(company, ["2025-04", "2025-05", "2025-06"], PRIOR_VALUES);
  const result = priorYearCumulativeComparison(company, "2026-06");
  assert.equal(result.status, "current-incomplete");
  assert.equal(result.comparable, false);
});

test("当年度累計は登録済み月だけを合計し、未登録月を明示する", () => {
  const company = createCompany({ closingMonth: 3 });
  const values = { M001: 100, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 8 };
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-04", values }));
  // 2026-05 は未登録
  company.monthlyRecords.push(createMonthlyRecord({ yearMonth: "2026-06", values }));
  const result = monthlyCumulative(company, "2026-06");
  assert.equal(result.fiscalKey, "2027-03");
  assert.equal(result.registeredCount, 2);
  assert.deepEqual(result.missingMonths, ["2026-05"]);
  assert.equal(result.figures.M001, 200);
  assert.equal(result.figures.M007, 16);
});
