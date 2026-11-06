import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPeriodGoal,
  removeAnnualPeriod,
  removeCompany,
  removeMonthlyRecord
} from "../assets/js/core/manage.js";
import {
  createAnnualPeriod,
  createCompany,
  createMonthlyRecord,
  createPersistentData
} from "../assets/js/data/schema.js";

function sampleData() {
  const data = createPersistentData();
  const company = createCompany({ name: "削除テスト", closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 90_000_000, PL025: 4_000_000 },
    goal: { profitCode: "PL025", amount: 5_000_000 }
  }));
  company.monthlyRecords.push(createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 }
  }));
  data.companies.push(company);
  return data;
}

test("会社を削除できる。存在しないIDでは何もしない", () => {
  const data = sampleData();
  const id = data.companies[0].id;
  assert.equal(removeCompany(data, "no-such-id"), false);
  assert.equal(data.companies.length, 1);
  assert.equal(removeCompany(data, id), true);
  assert.equal(data.companies.length, 0);
});

test("年次期を削除できる（目標も一緒に消える）", () => {
  const data = sampleData();
  const company = data.companies[0];
  const periodId = company.annualPeriods[0].id;
  assert.equal(removeAnnualPeriod(company, periodId), true);
  assert.equal(company.annualPeriods.length, 0);
  assert.equal(removeAnnualPeriod(company, periodId), false);
});

test("月次記録を削除できる", () => {
  const data = sampleData();
  const company = data.companies[0];
  const recordId = company.monthlyRecords[0].id;
  assert.equal(removeMonthlyRecord(company, recordId), true);
  assert.equal(company.monthlyRecords.length, 0);
  assert.equal(removeMonthlyRecord(company, recordId), false);
});

test("目標だけを取り消せる（期は残る）", () => {
  const data = sampleData();
  const company = data.companies[0];
  const periodId = company.annualPeriods[0].id;
  assert.equal(clearPeriodGoal(company, periodId), true);
  assert.equal(company.annualPeriods.length, 1);
  assert.equal(company.annualPeriods[0].goal, null);
  assert.equal(clearPeriodGoal(company, periodId), false);
});
