import {
  AMOUNT_INPUT_UNITS,
  APP_ID,
  GOAL_PROFIT_CODES,
  REGISTRATION_STAGES,
  SCHEMA_VERSION,
  TAX_ACCOUNTING_BASIS
} from "../config/constants.js";
import {
  STANDARD_INPUT_CODES,
  STANDARD_OPTIONAL_CODES,
  fieldLabel
} from "../data/fields.js";

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isValidAmountMap(v) {
  if (!isPlainObject(v)) return false;
  return Object.values(v).every(
    (x) => x === null || (typeof x === "number" && Number.isFinite(x))
  );
}

// 保存データ／JSON全体の構造検証
export function validatePersistentData(data) {
  const errors = [];
  if (!isPlainObject(data)) {
    return { valid: false, errors: ["データがオブジェクトではありません。"] };
  }
  if (data.appId !== APP_ID) errors.push("appIdが業績ダイジェストのものではありません。");
  if (data.schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersionが対応していません。");
  if (typeof data.createdAt !== "string" || typeof data.updatedAt !== "string") {
    errors.push("作成日時・更新日時がありません。");
  }
  if (!Array.isArray(data.companies)) {
    errors.push("companiesが配列ではありません。");
    return { valid: false, errors };
  }
  data.companies.forEach((company, i) => {
    const at = `companies[${i}]`;
    if (!isPlainObject(company)) {
      errors.push(`${at}がオブジェクトではありません。`);
      return;
    }
    if (typeof company.id !== "string" || company.id === "") errors.push(`${at}.idが不正です。`);
    if (typeof company.name !== "string") errors.push(`${at}.nameが不正です。`);
    if (!Number.isInteger(company.closingMonth) || company.closingMonth < 1 || company.closingMonth > 12) {
      errors.push(`${at}.closingMonthが不正です。`);
    }
    if (!Object.values(TAX_ACCOUNTING_BASIS).includes(company.taxAccountingBasis)) {
      errors.push(`${at}.taxAccountingBasisが不正です。`);
    }
    if (!Object.values(AMOUNT_INPUT_UNITS).includes(company.amountInputUnit)) {
      errors.push(`${at}.amountInputUnitが不正です。`);
    }
    if (!Array.isArray(company.annualPeriods)) {
      errors.push(`${at}.annualPeriodsが配列ではありません。`);
    } else {
      company.annualPeriods.forEach((period, j) => {
        const p = `${at}.annualPeriods[${j}]`;
        if (!isPlainObject(period)) { errors.push(`${p}がオブジェクトではありません。`); return; }
        if (typeof period.id !== "string" || period.id === "") errors.push(`${p}.idが不正です。`);
        if (typeof period.startDate !== "string" || typeof period.endDate !== "string") {
          errors.push(`${p}の期間が不正です。`);
        }
        if (!Object.values(REGISTRATION_STAGES).includes(period.stage)) {
          errors.push(`${p}.stageが不正です。`);
        }
        if (!isValidAmountMap(period.values)) errors.push(`${p}.valuesが不正です。`);
        if (period.bsValues !== null && period.bsValues !== undefined && !isValidAmountMap(period.bsValues)) {
          errors.push(`${p}.bsValuesが不正です。`);
        }
        // 目標設定（発展フェーズ）。初版データには無いため、未設定は許す。
        if (period.goal !== undefined && period.goal !== null) {
          const g = period.goal;
          if (
            !isPlainObject(g) ||
            !GOAL_PROFIT_CODES.includes(g.profitCode) ||
            typeof g.amount !== "number" ||
            !Number.isFinite(g.amount)
          ) {
            errors.push(`${p}.goalが不正です。`);
          }
        }
      });
    }
    if (!Array.isArray(company.monthlyRecords)) {
      errors.push(`${at}.monthlyRecordsが配列ではありません。`);
    } else {
      company.monthlyRecords.forEach((record, j) => {
        const r = `${at}.monthlyRecords[${j}]`;
        if (!isPlainObject(record)) { errors.push(`${r}がオブジェクトではありません。`); return; }
        if (typeof record.id !== "string" || record.id === "") errors.push(`${r}.idが不正です。`);
        if (!/^\d{4}-\d{2}$/.test(record.yearMonth ?? "")) errors.push(`${r}.yearMonthが不正です。`);
        if (!isValidAmountMap(record.values)) errors.push(`${r}.valuesが不正です。`);
      });
    }
  });
  return { valid: errors.length === 0, errors };
}

function periodOverlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

// 年次登録の保存前確認（仕様書 9）。errors は {field, message} の配列。
export function validateAnnualRegistration(company, candidate, { excludePeriodId = null } = {}) {
  const errors = [];
  if (!candidate.startDate) errors.push({ field: "startDate", message: "期の開始日を入力してください。" });
  if (!candidate.endDate) errors.push({ field: "endDate", message: "期の終了日を入力してください。" });
  if (candidate.startDate && candidate.endDate && candidate.startDate > candidate.endDate) {
    errors.push({ field: "endDate", message: "終了日は開始日より後の日付にしてください。" });
  }
  if (candidate.startDate && candidate.endDate) {
    const overlapped = (company?.annualPeriods ?? []).some(
      (p) => p.id !== excludePeriodId && periodOverlaps(candidate.startDate, candidate.endDate, p.startDate, p.endDate)
    );
    if (overlapped) {
      errors.push({ field: "startDate", message: "ほかの期と期間が重なっています。期間を見直してください。" });
    }
  }

  const values = candidate.values ?? {};
  const checkRequired = (code, { allowNegative = false } = {}) => {
    const v = values[code];
    if (v === null || v === undefined || typeof v !== "number") {
      errors.push({ field: code, message: `${fieldLabel(code)}を入力してください（該当しない場合は0を入力してください）。` });
    } else if (!allowNegative && v < 0) {
      errors.push({ field: code, message: code === "PL001" ? "売上高はマイナスでは入力できません。" : `${fieldLabel(code)}はマイナスでは入力できません。` });
    }
  };

  if (candidate.stage === REGISTRATION_STAGES.SIMPLE) {
    checkRequired("PL001");
    checkRequired("PL025", { allowNegative: true });
  } else {
    for (const code of STANDARD_INPUT_CODES) {
      checkRequired(code, { allowNegative: code === "PL024" });
    }
    for (const code of STANDARD_OPTIONAL_CODES) {
      const v = values[code];
      if (typeof v === "number" && v < 0) {
        errors.push({ field: code, message: `${fieldLabel(code)}はマイナスでは入力できません。` });
      }
    }
  }
  return errors;
}

// 月次登録の保存前確認（仕様書 9）
export function validateMonthlyRegistration(company, candidate, { excludeRecordId = null } = {}) {
  const errors = [];
  if (!/^\d{4}-\d{2}$/.test(candidate.yearMonth ?? "")) {
    errors.push({ field: "yearMonth", message: "対象年月を選んでください。" });
  } else {
    const duplicated = (company?.monthlyRecords ?? []).some(
      (r) => r.id !== excludeRecordId && r.yearMonth === candidate.yearMonth
    );
    if (duplicated) {
      errors.push({ field: "yearMonth", message: "この年月の記録はすでにあります。既存の記録を開いて修正してください。" });
    }
  }
  const values = candidate.values ?? {};
  for (const code of ["M001", "M002", "M003", "M004", "M005", "M006", "M007"]) {
    const v = values[code];
    if (v === null || v === undefined || typeof v !== "number") {
      errors.push({ field: code, message: `${fieldLabel(code)}を入力してください（該当しない場合は0を入力してください）。` });
    } else if (code !== "M007" && v < 0) {
      errors.push({ field: code, message: `${fieldLabel(code)}はマイナスでは入力できません。` });
    }
  }
  return errors;
}
