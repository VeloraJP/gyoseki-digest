import { DATA_ERROR_CODES, STORAGE_KEYS } from "../config/constants.js";
import { createPersistentData } from "../data/schema.js";
import { validatePersistentData } from "../core/validate.js";

export class DataRepositoryError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "DataRepositoryError";
    this.code = code;
    this.validationErrors = options.validationErrors ?? [];
  }
}

function isQuotaExceededError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

// 端末内保存（localStorage）。保存キーは business-tool2-2 と分離する。
export class LocalStorageRepository {
  constructor({ storage, now = () => new Date().toISOString(), key = STORAGE_KEYS.PRIMARY }) {
    if (!storage) throw new TypeError("storageは必須です。");
    this.storage = storage;
    this.now = now;
    this.key = key;
  }

  load() {
    let raw;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      throw new DataRepositoryError(
        DATA_ERROR_CODES.STORAGE_READ_FAILED,
        "保存データの読込に失敗しました。",
        { cause: error }
      );
    }
    if (raw === null) {
      return { status: "EMPTY", data: null };
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new DataRepositoryError(
        DATA_ERROR_CODES.INVALID_JSON,
        "保存データのJSONが破損しています。",
        { cause: error }
      );
    }
    const validation = validatePersistentData(data);
    if (!validation.valid) {
      throw new DataRepositoryError(
        DATA_ERROR_CODES.INVALID_DATA,
        "保存データが業績ダイジェストの形式に適合しません。",
        { validationErrors: validation.errors }
      );
    }
    return { status: "LOADED", data };
  }

  save(data) {
    const candidate = { ...data, updatedAt: this.now() };
    const validation = validatePersistentData(candidate);
    if (!validation.valid) {
      throw new DataRepositoryError(
        DATA_ERROR_CODES.INVALID_DATA,
        "不正なデータは保存できません。",
        { validationErrors: validation.errors }
      );
    }
    let serialized;
    try {
      serialized = JSON.stringify(candidate);
    } catch (error) {
      throw new DataRepositoryError(
        DATA_ERROR_CODES.INVALID_DATA,
        "データをJSONへ変換できません。",
        { cause: error }
      );
    }
    try {
      this.storage.setItem(this.key, serialized);
    } catch (error) {
      const code = isQuotaExceededError(error)
        ? DATA_ERROR_CODES.STORAGE_QUOTA_EXCEEDED
        : DATA_ERROR_CODES.STORAGE_WRITE_FAILED;
      throw new DataRepositoryError(
        code,
        code === DATA_ERROR_CODES.STORAGE_QUOTA_EXCEEDED
          ? "保存容量を超えたため保存できません。"
          : "保存データの書込に失敗しました。",
        { cause: error }
      );
    }
    return candidate;
  }

  loadOrCreate() {
    const loaded = this.load();
    return loaded.status === "LOADED" ? loaded.data : createPersistentData({ now: this.now });
  }
}
