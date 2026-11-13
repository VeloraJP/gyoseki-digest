import test from "node:test";
import assert from "node:assert/strict";
import {
  convertLegacyToolData,
  isLegacyToolData,
  parseLegacyToolData
} from "../assets/js/storage/migration.js";
import { DataImportError } from "../assets/js/storage/import-export.js";
import { validatePersistentData } from "../assets/js/core/validate.js";
import { createPersistentData } from "../assets/js/data/schema.js";

const STANDARD = {
  PL001: 110_000_000, PL002: 66_000_000, PL004: 6_000_000, PL005: 13_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_400_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 0, PL024: 1_800_000
};

function legacyPeriod({ pl = {}, bs = {}, ...rest } = {}) {
  return {
    periodId: "FY2025",
    startDate: "2025-04-01",
    endDate: "2026-03-31",
    displayName: "2026年3月期",
    pl: {
      ...Object.fromEntries(Object.keys(STANDARD).map((k) => [k, null])),
      PL003: { value: null, mode: "AUTO" },
      PL025: { value: null, mode: "AUTO" },
      ...pl
    },
    bs: { BS001: null, BS023: null, BS005: { value: null, mode: "AUTO" }, ...bs },
    ...rest
  };
}

function legacyData({ periods = [], companyData = {} } = {}) {
  return {
    schemaVersion: "1.0",
    appVersion: "1.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    companyData: {
      taxAccountingBasis: "TAX_EXCLUDED",
      amountInputUnit: "YEN",
      periods,
      managementInfo: { MG001: 5, MG015: 3_000_000 },
      ...companyData
    },
    settings: { amountDisplayUnit: "yen" },
    metadata: {}
  };
}

test("形式判定：business-tool2-2形式を判定でき、本ツール形式や無関係なJSONは判定しない", () => {
  assert.equal(isLegacyToolData(legacyData()), true);
  assert.equal(isLegacyToolData({ appId: "gyoseki-digest", companies: [] }), false);
  assert.equal(isLegacyToolData({ foo: 1 }), false);
  assert.equal(isLegacyToolData(null), false);
});

test("読み取り：本ツールのJSONは移行対象外として案内する", () => {
  const ownJson = JSON.stringify({ appId: "gyoseki-digest", schemaVersion: "1.0", companies: [] });
  assert.throws(
    () => parseLegacyToolData(ownJson),
    (e) => e instanceof DataImportError && e.code === "UNSUPPORTED_FORMAT"
  );
});

test("読み取り：判定できないJSONはエラーにし、壊れたJSONもエラーにする", () => {
  assert.throws(() => parseLegacyToolData(JSON.stringify({ hello: "world" })), /判定できませんでした/);
  assert.throws(() => parseLegacyToolData("{not json"), (e) => e.code === "INVALID_JSON");
});

test("変換：標準17項目がそろった期は標準登録になり、B/Sも取り込まれる", () => {
  const legacy = legacyData({
    periods: [legacyPeriod({ pl: { ...STANDARD }, bs: { BS001: 5_000_000, BS023: 10_000_000 } })]
  });
  const { company, summary } = convertLegacyToolData(legacy, { companyName: "移行テスト商事" });
  assert.equal(company.name, "移行テスト商事");
  assert.equal(company.closingMonth, 3);
  assert.equal(company.annualPeriods.length, 1);
  const period = company.annualPeriods[0];
  assert.equal(period.stage, "STANDARD");
  assert.equal(period.values.PL001, 110_000_000);
  assert.equal(period.values.PL024, 1_800_000);
  assert.equal(period.bsValues.BS001, 5_000_000);
  assert.equal(period.bsValues.BS023, 10_000_000);
  assert.equal(summary.importedCount, 1);
  assert.equal(summary.periods[0].hasBS, true);
  // 変換後の会社が本ツールの保存形式に適合すること
  const data = createPersistentData();
  data.companies.push(company);
  assert.equal(validatePersistentData(data).valid, true);
});

test("変換：自動計算項目の保存値（{value, mode}）は入力値として使わない", () => {
  const legacy = legacyData({
    periods: [legacyPeriod({ pl: { ...STANDARD, PL025: { value: 999, mode: "MANUAL" } } })]
  });
  const { company } = convertLegacyToolData(legacy, { companyName: "x" });
  const period = company.annualPeriods[0];
  assert.equal(period.stage, "STANDARD");
  assert.equal("PL025" in period.values, false);
});

test("変換：売上高と当期純利益だけの期は簡易登録になる", () => {
  const legacy = legacyData({
    periods: [legacyPeriod({ pl: { PL001: 90_000_000, PL025: { value: 4_000_000, mode: "MANUAL" } } })]
  });
  const { company, summary } = convertLegacyToolData(legacy, { companyName: "x" });
  assert.equal(company.annualPeriods.length, 1);
  assert.equal(company.annualPeriods[0].stage, "SIMPLE");
  assert.deepEqual(company.annualPeriods[0].values, { PL001: 90_000_000, PL025: 4_000_000 });
  assert.equal(summary.periods[0].stage, "SIMPLE");
});

test("変換：項目が不足する期は理由つきでスキップされる", () => {
  const legacy = legacyData({ periods: [legacyPeriod({ pl: { PL001: 50_000_000 } })] });
  const { company, summary } = convertLegacyToolData(legacy, { companyName: "x" });
  assert.equal(company.annualPeriods.length, 0);
  assert.equal(summary.skippedCount, 1);
  assert.match(summary.periods[0].reason, /そろっていない/);
});

test("変換：期間が重なる期は2件目がスキップされる", () => {
  const legacy = legacyData({
    periods: [
      legacyPeriod({ pl: { ...STANDARD } }),
      legacyPeriod({ pl: { ...STANDARD }, periodId: "FY2025-dup" })
    ]
  });
  const { company, summary } = convertLegacyToolData(legacy, { companyName: "x" });
  assert.equal(company.annualPeriods.length, 1);
  assert.equal(summary.skippedCount, 1);
  assert.match(summary.periods[1].reason, /重なっています/);
});

test("変換：税区分が未設定なら税抜を既定とし、注記が付く", () => {
  const legacy = legacyData({
    periods: [legacyPeriod({ pl: { ...STANDARD } })],
    companyData: { taxAccountingBasis: null }
  });
  const { company, summary } = convertLegacyToolData(legacy, { companyName: "x" });
  assert.equal(company.taxAccountingBasis, "TAX_EXCLUDED");
  assert.ok(summary.notes.some((n) => n.includes("税抜")));
  // 経営情報は取り込まれない
  assert.equal("managementInfo" in company, false);
});

test("変換：決算月は取り込めた期の終了月から決まる", () => {
  const legacy = legacyData({
    periods: [legacyPeriod({
      pl: { ...STANDARD },
      startDate: "2025-01-01", endDate: "2025-12-31", displayName: "2025年12月期"
    })]
  });
  const { company } = convertLegacyToolData(legacy, { companyName: "x" });
  assert.equal(company.closingMonth, 12);
});
