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
  bsValues = null
} = {}) {
  return { id, startDate, endDate, displayName, stage, values, bsValues };
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
