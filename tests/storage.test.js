import test from "node:test";
import assert from "node:assert/strict";
import { LocalStorageRepository } from "../assets/js/storage/repository.js";
import {
  DataImportError,
  exportPersistentData,
  importPersistentData,
  parseImportedData
} from "../assets/js/storage/import-export.js";
import { MAX_IMPORT_BYTES } from "../assets/js/config/constants.js";
import {
  createAnnualPeriod,
  createCompany,
  createMonthlyRecord,
  createPersistentData
} from "../assets/js/data/schema.js";

function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

function sampleData() {
  const data = createPersistentData();
  const company = createCompany({ name: "サンプル商事", closingMonth: 3 });
  company.annualPeriods.push(createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 120_000_000, PL025: 6_000_000 }
  }));
  company.monthlyRecords.push(createMonthlyRecord({
    yearMonth: "2026-10",
    values: { M001: 10_000_000, M002: 6_000_000, M003: 2_000_000, M004: 300_000, M005: 200_000, M006: 400_000, M007: 800_000 }
  }));
  data.companies.push(company);
  return data;
}

test("保存→再読み込みで会社・年次・月次が復元される", () => {
  const repository = new LocalStorageRepository({ storage: createFakeStorage() });
  repository.save(sampleData());
  const loaded = repository.load();
  assert.equal(loaded.status, "LOADED");
  assert.equal(loaded.data.companies.length, 1);
  assert.equal(loaded.data.companies[0].name, "サンプル商事");
  assert.equal(loaded.data.companies[0].annualPeriods[0].values.PL025, 6_000_000);
  assert.equal(loaded.data.companies[0].monthlyRecords[0].values.M007, 800_000);
});

test("JSON書き出し→読み込みの往復でデータが一致する", () => {
  const repository = new LocalStorageRepository({ storage: createFakeStorage() });
  const original = sampleData();
  const text = exportPersistentData(original);
  const imported = importPersistentData({ text, repository });
  assert.equal(imported.companies[0].name, "サンプル商事");
  assert.deepEqual(imported.companies[0].monthlyRecords, original.companies[0].monthlyRecords);
  const loaded = repository.load();
  assert.equal(loaded.data.companies[0].annualPeriods.length, 1);
});

test("ほかのツール（business-tool2-2形式）のJSONは読み込めない", () => {
  const otherToolJson = JSON.stringify({
    schemaVersion: "1.0", appVersion: "1.0",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    companyData: { periods: [] }, settings: {}, metadata: {}
  });
  assert.throws(
    () => parseImportedData(otherToolJson),
    (e) => e instanceof DataImportError && e.code === "UNSUPPORTED_APP_ID"
  );
});

test("5MBを超えるJSONは読み込めない", () => {
  assert.throws(
    () => parseImportedData("{}", { byteLength: MAX_IMPORT_BYTES + 1 }),
    (e) => e instanceof DataImportError && e.code === "FILE_TOO_LARGE"
  );
});

test("壊れたJSONは読み込めず、エラーになる", () => {
  assert.throws(
    () => parseImportedData("{not json"),
    (e) => e instanceof DataImportError && e.code === "INVALID_JSON"
  );
});
