import {
  AMOUNT_INPUT_UNITS,
  APP_ID,
  APP_VERSION,
  REGISTRATION_STAGES,
  SCHEMA_VERSION,
  TAX_ACCOUNTING_BASIS
} from "../config/constants.js";

let idCounter = 0;

export function generateId(prefix) {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${random}`;
}

export function createCompany({
  id = generateId("company"),
  name = "",
  closingMonth = 3,
  taxAccountingBasis = TAX_ACCOUNTING_BASIS.EXCLUDED,
  amountInputUnit = AMOUNT_INPUT_UNITS.YEN
} = {}) {
  return {
    id,
    name,
    closingMonth,
    taxAccountingBasis,
    amountInputUnit,
    annualPeriods: [],
    monthlyRecords: []
  };
}

export function createAnnualPeriod({
  id = generateId("period"),
  startDate = "",
  endDate = "",
  displayName = "",
  stage = REGISTRATION_STAGES.STANDARD,
  values = {},
  bsValues = null,
  goal = null,
  annualRepayment = null
} = {}) {
  // goal は発展フェーズの目標設定。{ profitCode, amount } または null。
  // 初版の保存データには無い項目のため、検証では未設定（undefined）も許す。
  // annualRepayment は借入返済の見通しフェーズの年間返済額（円）。任意項目で、
  // 未登録は null とする。旧データには無いため、検証では未設定（undefined）も許す。
  return { id, startDate, endDate, displayName, stage, values, bsValues, goal, annualRepayment };
}

export function createMonthlyRecord({
  id = generateId("monthly"),
  yearMonth = "",
  values = {}
} = {}) {
  return { id, yearMonth, values };
}

export function defaultPeriodDisplayName(endDate) {
  if (!endDate) return "";
  const [year, month] = endDate.split("-").map(Number);
  if (!year || !month) return "";
  return `${year}年${month}月期`;
}

export function createPersistentData({
  now = () => new Date().toISOString()
} = {}) {
  const timestamp = now();
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    companies: []
  };
}
