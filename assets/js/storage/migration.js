import {
  AMOUNT_INPUT_UNITS,
  APP_ID,
  DATA_ERROR_CODES,
  MAX_IMPORT_BYTES,
  REGISTRATION_STAGES,
  TAX_ACCOUNTING_BASIS
} from "../config/constants.js";
import {
  BS_FIELDS,
  STANDARD_INPUT_CODES,
  STANDARD_OPTIONAL_CODES
} from "../data/fields.js";
import {
  createAnnualPeriod,
  createCompany,
  defaultPeriodDisplayName
} from "../data/schema.js";
import { validateAnnualRegistration } from "../core/validate.js";
import { DataImportError, getUtf8ByteLength } from "./import-export.js";

// business-tool2-2形式JSONの移行（発展フェーズ）。
// 本ツールのJSON読み込み（置き換え方式）とは別扱いとし、
// 形式を判定できた場合だけ、変換内容を確認してから新しい会社として追加する。

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// business-tool2-2形式かどうかの判定。
// 同ツールは appId を持たず、会社データを単一の companyData として保持する。
export function isLegacyToolData(data) {
  return (
    isPlainObject(data) &&
    data.appId !== APP_ID &&
    isPlainObject(data.companyData) &&
    Array.isArray(data.companyData.periods)
  );
}

export function parseLegacyToolData(text, { byteLength } = {}) {
  if (typeof text !== "string") {
    throw new DataImportError(DATA_ERROR_CODES.INVALID_JSON, "JSONは文字列である必要があります。");
  }
  const actualByteLength = getUtf8ByteLength(text);
  const effectiveByteLength = byteLength === undefined ? actualByteLength : Math.max(byteLength, actualByteLength);
  if (effectiveByteLength > MAX_IMPORT_BYTES) {
    throw new DataImportError(DATA_ERROR_CODES.FILE_TOO_LARGE, "5MBを超えるJSONファイルは読み込めません。");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DataImportError(DATA_ERROR_CODES.INVALID_JSON, "JSONの形式が不正です。", { cause: error });
  }
  if (isPlainObject(data) && data.appId === APP_ID) {
    throw new DataImportError(
      DATA_ERROR_CODES.UNSUPPORTED_FORMAT,
      "これは業績ダイジェストのJSONです。移行ではなく、上の「復元（読み込み）」から読み込んでください。"
    );
  }
  if (!isLegacyToolData(data)) {
    throw new DataImportError(
      DATA_ERROR_CODES.UNSUPPORTED_FORMAT,
      "business-tool2-2のJSONとして判定できませんでした。対応していない形式です。"
    );
  }
  return data;
}

// business-tool2-2の保存値から金額を取り出す。
// 金額は数値そのもの、または { value, mode } 形式で保持される。
// 自動計算項目は本ツールで再計算するため、保存値があっても入力値としては使わない。
function extractAmount(entry) {
  if (typeof entry === "number" && Number.isFinite(entry)) return entry;
  if (isPlainObject(entry) && typeof entry.value === "number" && Number.isFinite(entry.value)) {
    return entry.value;
  }
  return null;
}

function isValidDateString(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

const BS_INPUT_CODES = Object.freeze(BS_FIELDS.filter((f) => !f.auto).map((f) => f.id));

// 変換の本体。新しい会社オブジェクトと、確認画面用の変換サマリーを返す。
// 変換できない期は理由つきで summary.periods に残し、会社には含めない。
export function convertLegacyToolData(legacy, { companyName } = {}) {
  const cd = legacy.companyData;
  const notes = [];

  let taxAccountingBasis = cd.taxAccountingBasis;
  if (!Object.values(TAX_ACCOUNTING_BASIS).includes(taxAccountingBasis)) {
    taxAccountingBasis = TAX_ACCOUNTING_BASIS.EXCLUDED;
    notes.push("税込／税抜の設定が元データに無いため、「税抜」として取り込みます。設定画面で変更できます。");
  }
  let amountInputUnit = cd.amountInputUnit;
  if (!Object.values(AMOUNT_INPUT_UNITS).includes(amountInputUnit)) {
    amountInputUnit = AMOUNT_INPUT_UNITS.YEN;
    notes.push("金額入力単位が元データに無いため、「円」として取り込みます。設定画面で変更できます。");
  }

  const company = createCompany({
    name: companyName ?? "",
    closingMonth: 3,
    taxAccountingBasis,
    amountInputUnit
  });

  const periodSummaries = [];
  for (const legacyPeriod of cd.periods) {
    const summary = {
      displayName: legacyPeriod?.displayName || defaultPeriodDisplayName(legacyPeriod?.endDate ?? ""),
      startDate: legacyPeriod?.startDate ?? "",
      endDate: legacyPeriod?.endDate ?? "",
      stage: null,
      imported: false,
      reason: null,
      hasBS: false
    };
    periodSummaries.push(summary);

    if (!isPlainObject(legacyPeriod) || !isValidDateString(legacyPeriod.startDate) || !isValidDateString(legacyPeriod.endDate)) {
      summary.reason = "期間の日付が確認できないため、取り込めませんでした。";
      continue;
    }

    // B/S（任意登録）：入力項目だけを取り出す。全て未入力なら無しとする。
    const bsValues = {};
    let bsHasValue = false;
    for (const code of BS_INPUT_CODES) {
      const v = extractAmount(legacyPeriod.bs?.[code]);
      bsValues[code] = v;
      if (v !== null) bsHasValue = true;
    }
    summary.hasBS = bsHasValue;

    const pl = {};
    for (const code of [...STANDARD_INPUT_CODES, ...STANDARD_OPTIONAL_CODES, "PL025"]) {
      pl[code] = extractAmount(legacyPeriod.pl?.[code]);
    }

    const buildCandidate = (stage, values) => createAnnualPeriod({
      startDate: legacyPeriod.startDate,
      endDate: legacyPeriod.endDate,
      displayName: summary.displayName,
      stage,
      values,
      bsValues: bsHasValue ? bsValues : null
    });

    let candidate = null;
    let errors = [];
    const standardComplete = STANDARD_INPUT_CODES.every((code) => pl[code] !== null);
    if (standardComplete) {
      const values = {};
      for (const code of STANDARD_INPUT_CODES) values[code] = pl[code];
      if (pl.PL009 !== null && pl.PL009 !== undefined) values.PL009 = pl.PL009;
      candidate = buildCandidate(REGISTRATION_STAGES.STANDARD, values);
      errors = validateAnnualRegistration(company, candidate);
      if (errors.length > 0) candidate = null;
    }
    if (!candidate && pl.PL001 !== null && pl.PL025 !== null) {
      candidate = buildCandidate(REGISTRATION_STAGES.SIMPLE, { PL001: pl.PL001, PL025: pl.PL025 });
      errors = validateAnnualRegistration(company, candidate);
      if (errors.length > 0) candidate = null;
    }

    if (candidate) {
      company.annualPeriods.push(candidate);
      summary.imported = true;
      summary.stage = candidate.stage;
    } else if (standardComplete || (pl.PL001 !== null && pl.PL025 !== null)) {
      summary.reason = errors[0]?.message ?? "このツールの登録条件に合わないため、取り込めませんでした。";
    } else {
      summary.reason = "取り込みに必要な項目がそろっていないため、取り込めませんでした（標準登録の17項目、または売上高と当期純利益が必要です）。";
    }
  }

  // 決算月は、取り込めた期のうち最も新しい期の終了月から決める。
  const imported = company.annualPeriods;
  if (imported.length > 0) {
    const latest = [...imported].sort((a, b) => a.endDate.localeCompare(b.endDate))[imported.length - 1];
    company.closingMonth = Number(latest.endDate.slice(5, 7));
  } else {
    const dated = cd.periods.filter((p) => isValidDateString(p?.endDate));
    if (dated.length > 0) {
      company.closingMonth = Number(dated[dated.length - 1].endDate.slice(5, 7));
    } else {
      notes.push("決算月が元データから決められないため、3月としています。設定画面で変更できます。");
    }
  }

  notes.push("取り込むのは年次登録（決算の数字）だけです。経営情報やシミュレーションの結果は取り込みません。");
  if (periodSummaries.some((s) => s.imported && s.stage === REGISTRATION_STAGES.SIMPLE)) {
    notes.push("簡易登録として取り込んだ期は、売上高と当期純利益だけの登録になります（内訳や要因は表示されません）。");
  }

  return {
    company,
    summary: {
      periods: periodSummaries,
      notes,
      closingMonth: company.closingMonth,
      taxAccountingBasis: company.taxAccountingBasis,
      amountInputUnit: company.amountInputUnit,
      importedCount: periodSummaries.filter((s) => s.imported).length,
      skippedCount: periodSummaries.filter((s) => !s.imported).length
    }
  };
}
