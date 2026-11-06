function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class AppStore {
  constructor({ repository }) {
    if (!repository) throw new TypeError("repositoryは必須です。");
    this.repository = repository;
    this.data = null;
  }

  initialize() {
    this.data = this.repository.loadOrCreate();
    return this.getSnapshot();
  }

  getSnapshot() {
    return this.data === null ? null : clone(this.data);
  }

  getCompany(companyId) {
    const company = this.data?.companies.find((c) => c.id === companyId) ?? null;
    return company === null ? null : clone(company);
  }

  // 変更を加えたデータ全体を保存し、保存済みデータで状態を更新する。
  commit(mutator) {
    const draft = clone(this.data);
    mutator(draft);
    const saved = this.repository.save(draft);
    this.data = clone(saved);
    return this.getSnapshot();
  }

  replaceAll(data) {
    const saved = this.repository.save(clone(data));
    this.data = clone(saved);
    return this.getSnapshot();
  }

  // 保存済みのデータで状態だけを差し替える（読み込み直後用）。
  adoptSaved(data) {
    this.data = clone(data);
    return this.getSnapshot();
  }
}
