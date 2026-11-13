import test from "node:test";
import assert from "node:assert/strict";
import { computeRepaymentOutlook } from "../assets/js/core/repayment.js";
import { validateAnnualRegistration, validatePersistentData } from "../assets/js/core/validate.js";
import { createAnnualPeriod, createCompany, createPersistentData } from "../assets/js/data/schema.js";
import { renderAnalysis, renderRepaymentOutlook } from "../assets/js/views/analysis.js";
import { renderAnnual } from "../assets/js/views/annual.js";
import { buildHash } from "../assets/js/navigation/router.js";

const link = (route, params) => buildHash(route, params);

// insights.test.js と同じ標準登録サンプル。当期純利益 10,000,000／減価償却費 800,000
const STANDARD = {
  PL001: 110_000_000, PL002: 66_000_000, PL004: 6_000_000, PL005: 13_000_000, PL006: 2_000_000,
  PL008: 3_600_000, PL010: 600_000, PL011: 400_000, PL012: 300_000, PL013: 800_000,
  PL014: 500_000, PL015: 4_400_000, PL018: 100_000, PL019: 700_000, PL021: 0, PL022: 0, PL024: 1_800_000
};
// 借入金の残高 13,000,000（短期 3,000,000＋長期 10,000,000）
const BS = { BS001: 8_000_000, BS002: 12_000_000, BS003: 5_000_000, BS013: 4_000_000, BS014: 3_000_000, BS019: 10_000_000 };

function standardPeriod(overrides = {}) {
  return createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "STANDARD", values: { ...STANDARD }, ...overrides
  });
}

test("見通し：そろっている場合は5項目すべて計算できる", () => {
  const r = computeRepaymentOutlook(standardPeriod({ bsValues: { ...BS }, annualRepayment: 2_400_000 }));
  assert.equal(r.debtBalance, 13_000_000);
  assert.equal(r.debtReason, null);
  assert.equal(r.annualRepayment, 2_400_000);
  // 返済のもと ＝ 当期純利益 10,000,000 ＋ 減価償却費 800,000
  assert.equal(r.repaymentBase, 10_800_000);
  assert.equal(r.baseReason, null);
  assert.equal(r.remaining, 8_400_000);
  assert.equal(r.multiple, 4.5);
  assert.equal(r.multipleReason, null);
});

test("見通し：簡易登録では減価償却費がないため、返済のもと以降が出せない", () => {
  const period = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 50_000_000, PL025: 3_000_000 },
    bsValues: { ...BS }, annualRepayment: 2_400_000
  });
  const r = computeRepaymentOutlook(period);
  assert.equal(r.debtBalance, 13_000_000);
  assert.equal(r.annualRepayment, 2_400_000);
  assert.equal(r.repaymentBase, null);
  assert.equal(r.baseReason, "NO_DEPRECIATION");
  assert.equal(r.remaining, null);
  assert.equal(r.remainingReason, "NO_DEPRECIATION");
  assert.equal(r.multiple, null);
  assert.equal(r.multipleReason, "NO_DEPRECIATION");
});

test("見通し：B/S未登録では借入金の残高だけが出せない", () => {
  const r = computeRepaymentOutlook(standardPeriod({ annualRepayment: 2_400_000 }));
  assert.equal(r.debtBalance, null);
  assert.equal(r.debtReason, "NO_BS");
  assert.equal(r.repaymentBase, 10_800_000);
  assert.equal(r.remaining, 8_400_000);
  assert.equal(r.multiple, 4.5);
});

test("見通し：B/Sがあっても借入金の項目が欠けていれば残高は出せない", () => {
  const bs = { ...BS };
  delete bs.BS019;
  const r = computeRepaymentOutlook(standardPeriod({ bsValues: bs, annualRepayment: 2_400_000 }));
  assert.equal(r.debtBalance, null);
  assert.equal(r.debtReason, "MISSING_ITEMS");
  assert.equal(r.multiple, 4.5);
});

test("見通し：借入金が0の場合は残高0円とし、残りの目安と倍率を出さない", () => {
  const bs = { ...BS, BS014: 0, BS019: 0 };
  const r = computeRepaymentOutlook(standardPeriod({ bsValues: bs, annualRepayment: 2_400_000 }));
  assert.equal(r.debtBalance, 0);
  assert.equal(r.debtReason, null);
  assert.equal(r.repaymentBase, 10_800_000);
  assert.equal(r.remaining, null);
  assert.equal(r.remainingReason, "NO_DEBT");
  assert.equal(r.multiple, null);
  assert.equal(r.multipleReason, "NO_DEBT");
});

test("見通し：年間返済額が未登録の場合は、残りの目安と倍率が出せない", () => {
  const r = computeRepaymentOutlook(standardPeriod({ bsValues: { ...BS } }));
  assert.equal(r.annualRepayment, null);
  assert.equal(r.debtBalance, 13_000_000);
  assert.equal(r.repaymentBase, 10_800_000);
  assert.equal(r.remaining, null);
  assert.equal(r.remainingReason, "NO_REPAYMENT");
  assert.equal(r.multiple, null);
  assert.equal(r.multipleReason, "NO_REPAYMENT");
});

test("見通し：年間返済額が0の場合は倍率だけが出せない", () => {
  const r = computeRepaymentOutlook(standardPeriod({ bsValues: { ...BS }, annualRepayment: 0 }));
  assert.equal(r.remaining, 10_800_000);
  assert.equal(r.multiple, null);
  assert.equal(r.multipleReason, "ZERO_REPAYMENT");
});

test("見通し：返済のもとがマイナスの場合は倍率を出さず、差額はマイナスで出す", () => {
  const values = { ...STANDARD, PL024: 30_000_000 };
  const period = standardPeriod({ values, bsValues: { ...BS }, annualRepayment: 2_400_000 });
  const r = computeRepaymentOutlook(period);
  // 当期純利益 ＝ 11,800,000 − 30,000,000 ＝ −18,200,000。返済のもと ＝ −17,400,000
  assert.equal(r.repaymentBase, -17_400_000);
  assert.equal(r.remaining, -19_800_000);
  assert.equal(r.multiple, null);
  assert.equal(r.multipleReason, "NEGATIVE_BASE");
});

test("見通し：期がなければ null を返す", () => {
  assert.equal(computeRepaymentOutlook(null), null);
});

test("登録：年間返済額は任意項目で、未登録でも年次登録の確認を通る", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  const candidate = standardPeriod({ annualRepayment: null });
  assert.deepEqual(validateAnnualRegistration(company, candidate), []);
  const withValue = standardPeriod({ annualRepayment: 1_200_000 });
  assert.deepEqual(validateAnnualRegistration(company, withValue), []);
});

test("登録：年間返済額のマイナスは保存前確認でエラーになる", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  const candidate = standardPeriod({ annualRepayment: -100 });
  const errors = validateAnnualRegistration(company, candidate);
  assert.ok(errors.some((e) => e.field === "annualRepayment"));
});

test("保存データ検証：年間返済額は数値・null・未設定を許し、マイナスと文字列は弾く", () => {
  const build = (annualRepayment) => {
    const data = createPersistentData();
    const company = createCompany({ name: "検証用", closingMonth: 3 });
    const period = standardPeriod({});
    if (annualRepayment !== undefined) period.annualRepayment = annualRepayment;
    else delete period.annualRepayment;
    company.annualPeriods.push(period);
    data.companies.push(company);
    return data;
  };
  assert.equal(validatePersistentData(build(2_400_000)).valid, true);
  assert.equal(validatePersistentData(build(null)).valid, true);
  assert.equal(validatePersistentData(build(undefined)).valid, true);
  assert.equal(validatePersistentData(build(-1)).valid, false);
  assert.equal(validatePersistentData(build("2400000")).valid, false);
});

test("年次登録画面：年間返済額の任意入力欄があり、登録済みの値が入る", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  const period = standardPeriod({ annualRepayment: 2_400_000 });
  const html = renderAnnual({ company, period, link });
  assert.match(html, /年間返済額/);
  assert.match(html, /id="in-repayment"/);
  assert.match(html, /value="2400000"/);
});

test("分析画面：見通しの5項目と実績ベースの注記が表示される", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  company.annualPeriods.push(standardPeriod({ bsValues: { ...BS }, annualRepayment: 2_400_000 }));
  const html = renderAnalysis({ company, link });
  assert.match(html, /借入返済の見通し/);
  assert.match(html, /借入金の残高/);
  assert.match(html, /13,000,000円/);
  assert.match(html, /返済のもとになるお金/);
  assert.match(html, /10,800,000円/);
  assert.match(html, /返済したあとの残りの目安/);
  assert.match(html, /8,400,000円/);
  assert.match(html, /返済額の何倍あるか/);
  assert.match(html, /4\.5倍/);
  assert.match(html, /将来の返済を予測するものではありません/);
});

test("分析画面：年間返済額が未登録の場合は理由と登録への導線が表示される", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  const period = standardPeriod({ bsValues: { ...BS } });
  company.annualPeriods.push(period);
  const html = renderRepaymentOutlook(company, period, link);
  assert.match(html, /年間返済額が未登録のため、表示できません/);
  assert.match(html, /年間返済額を登録する/);
  assert.match(html, new RegExp(period.id));
});

test("分析画面：簡易登録の期では減価償却費がない理由が表示される", () => {
  const company = createCompany({ name: "検証用", closingMonth: 3 });
  const period = createAnnualPeriod({
    startDate: "2025-04-01", endDate: "2026-03-31", displayName: "2026年3月期",
    stage: "SIMPLE", values: { PL001: 50_000_000, PL025: 3_000_000 },
    bsValues: { ...BS }, annualRepayment: 2_400_000
  });
  company.annualPeriods.push(period);
  const html = renderRepaymentOutlook(company, period, link);
  assert.match(html, /減価償却費の登録がないため、表示できません/);
  // 残高と年間返済額は出せる範囲で表示される
  assert.match(html, /13,000,000円/);
  assert.match(html, /2,400,000円/);
});

test("分析画面：月次集計だけの会社では見通しの枠自体を出さない", () => {
  const company = createCompany({ name: "月次だけ", closingMonth: 3 });
  for (let m = 0; m < 12; m += 1) {
    const d = new Date(2025, 3 + m, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    company.monthlyRecords.push({
      id: `m${m}`, yearMonth: ym,
      values: { M001: 1_000_000, M002: 400_000, M003: 200_000, M004: 50_000, M005: 30_000, M006: 20_000, M007: 100_000 }
    });
  }
  const html = renderAnalysis({ company, link });
  assert.doesNotMatch(html, /借入返済の見通し/);
});
