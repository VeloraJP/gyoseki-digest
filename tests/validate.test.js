import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAnnualRegistration,
  validateMonthlyRegistration,
  validatePersistentData
} from "../assets/js/core/validate.js";
import { createAnnualPeriod, createCompany, createMonthlyRecord, createPersistentData } from "../assets/js/data/schema.js";

const FULL_STANDARD = {
  PL001: 1000, PL002: 600, PL004: 60, PL005: 120, PL006: 20, PL008: 36,
  PL010: 6, PL011: 4, PL012: 3, PL013: 8, PL014: 5, PL015: 40,
  PL018: 1, PL019: 7, PL021: 0, PL022: 2, PL024: 15
};

test("年次標準登録：必須項目が欠けるとエラーになる", () => {
  const company = createCompany({});
  const candidate = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", stage: "STANDARD",
    values: { ...FULL_STANDARD, PL005: null }
  });
  const errors = validateAnnualRegistration(company, candidate);
  assert.ok(errors.some((e) => e.field === "PL005"));
});

test("年次標準登録：法人税等はマイナスを認め、その他の項目は認めない", () => {
  const company = createCompany({});
  const okTax = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", stage: "STANDARD",
    values: { ...FULL_STANDARD, PL024: -50 }
  });
  assert.equal(validateAnnualRegistration(company, okTax).length, 0);
  const badCost = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", stage: "STANDARD",
    values: { ...FULL_STANDARD, PL002: -1 }
  });
  assert.ok(validateAnnualRegistration(company, badCost).some((e) => e.field === "PL002"));
});

test("年次登録：売上高のマイナスは簡易・標準とも認めない", () => {
  const company = createCompany({});
  const simple = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", stage: "SIMPLE",
    values: { PL001: -1, PL025: 10 }
  });
  assert.ok(validateAnnualRegistration(company, simple).some((e) => e.field === "PL001"));
});

test("年次登録：期間の重複を検出する（自分自身の編集は除く）", () => {
  const company = createCompany({});
  const existing = createAnnualPeriod({ startDate: "2025-04-01", endDate: "2026-03-31", stage: "SIMPLE", values: { PL001: 1, PL025: 1 } });
  company.annualPeriods.push(existing);
  const overlapping = createAnnualPeriod({
    startDate: "2026-01-01", endDate: "2026-12-31", stage: "SIMPLE", values: { PL001: 1, PL025: 1 }
  });
  assert.ok(validateAnnualRegistration(company, overlapping).some((e) => e.field === "startDate"));
  // 既存期そのものの編集は重複にならない
  assert.equal(validateAnnualRegistration(company, existing, { excludePeriodId: existing.id }).length, 0);
});

test("月次登録：7項目すべて必須で、M007以外はマイナス不可", () => {
  const company = createCompany({});
  const missing = createMonthlyRecord({ yearMonth: "2026-10", values: { M001: 100 } });
  assert.ok(validateMonthlyRegistration(company, missing).length >= 6);
  const negativeProfit = createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 100, M002: 60, M003: 20, M004: 3, M005: 2, M006: 4, M007: -5 }
  });
  assert.equal(validateMonthlyRegistration(company, negativeProfit).length, 0);
  const negativeCost = createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 100, M002: -60, M003: 20, M004: 3, M005: 2, M006: 4, M007: 5 }
  });
  assert.ok(validateMonthlyRegistration(company, negativeCost).some((e) => e.field === "M002"));
});

test("月次登録：同じ年月の重複を検出する", () => {
  const company = createCompany({});
  company.monthlyRecords.push(createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 1, M002: 1, M003: 1, M004: 1, M005: 1, M006: 1, M007: 1 }
  }));
  const dup = createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 2, M002: 2, M003: 2, M004: 2, M005: 2, M006: 2, M007: 2 }
  });
  assert.ok(validateMonthlyRegistration(company, dup).some((e) => e.field === "yearMonth"));
});

test("保存データ検証：正常なデータは通り、壊れたデータは弾く", () => {
  const data = createPersistentData();
  data.companies.push(createCompany({ name: "テスト会社" }));
  assert.equal(validatePersistentData(data).valid, true);
  assert.equal(validatePersistentData({ ...data, appId: "other" }).valid, false);
  assert.equal(validatePersistentData(null).valid, false);
  const badCompany = createPersistentData();
  badCompany.companies.push({ id: "x" });
  assert.equal(validatePersistentData(badCompany).valid, false);
});
