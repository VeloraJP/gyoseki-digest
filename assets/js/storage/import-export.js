import {
  APP_ID,
  DATA_ERROR_CODES,
  MAX_IMPORT_BYTES,
  SCHEMA_VERSION
} from "../config/constants.js";
import { validatePersistentData } from "../core/validate.js";
import { DataRepositoryError } from "./repository.js";

export class DataImportError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "DataImportError";
    this.code = code;
    this.validationErrors = options.validationErrors ?? [];
  }
}

export function getUtf8ByteLength(text) {
  if (typeof text !== "string") throw new TypeError("textは文字列である必要があります。");
  return new TextEncoder().encode(text).byteLength;
}

export function exportPersistentData(data) {
  const validation = validatePersistentData(data);
  if (!validation.valid) {
    throw new DataImportError(
      DATA_ERROR_CODES.INVALID_DATA,
      "不正なデータは書き出せません。",
      { validationErrors: validation.errors }
    );
  }
  return JSON.stringify(data, null, 2);
}

// 読み込み前の検証（仕様書 4.6.3）。検証に失敗した場合は既存データを変更しない。
export function parseImportedData(text, { byteLength } = {}) {
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
  if (data?.appId !== APP_ID) {
    throw new DataImportError(
      DATA_ERROR_CODES.UNSUPPORTED_APP_ID,
      "業績ダイジェストのJSONではありません。ほかのツールのJSONは読み込めません。"
    );
  }
  if (data?.schemaVersion !== SCHEMA_VERSION) {
    throw new DataImportError(DATA_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION, "対応していない形式の版です。");
  }
  const validation = validatePersistentData(data);
  if (!validation.valid) {
    throw new DataImportError(
      DATA_ERROR_CODES.INVALID_DATA,
      "読み込んだデータが業績ダイジェストの形式に適合しません。",
      { validationErrors: validation.errors }
    );
  }
  return data;
}

// 置き換え方式の読み込み（部分マージは行わない）
export function importPersistentData({ text, repository, byteLength }) {
  if (!repository) throw new TypeError("repositoryは必須です。");
  const data = parseImportedData(text, { byteLength });
  try {
    return repository.save(data);
  } catch (error) {
    if (error instanceof DataRepositoryError) throw error;
    throw new DataImportError(DATA_ERROR_CODES.STORAGE_WRITE_FAILED, "検証済みデータの保存に失敗しました。", { cause: error });
  }
}
