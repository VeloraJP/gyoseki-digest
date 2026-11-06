// 削除操作（発展フェーズで追加）。
// いずれも store.commit のドラフトに対して使う純粋な変更関数。
// 削除できた場合は true、対象が無かった場合は false を返す。

export function removeCompany(data, companyId) {
  const index = data.companies.findIndex((c) => c.id === companyId);
  if (index < 0) return false;
  data.companies.splice(index, 1);
  return true;
}

export function removeAnnualPeriod(company, periodId) {
  const index = (company.annualPeriods ?? []).findIndex((p) => p.id === periodId);
  if (index < 0) return false;
  company.annualPeriods.splice(index, 1);
  return true;
}

export function removeMonthlyRecord(company, recordId) {
  const index = (company.monthlyRecords ?? []).findIndex((r) => r.id === recordId);
  if (index < 0) return false;
  company.monthlyRecords.splice(index, 1);
  return true;
}

// 目標設定だけを取り消す（期そのものは残す）。
export function clearPeriodGoal(company, periodId) {
  const period = (company.annualPeriods ?? []).find((p) => p.id === periodId);
  if (!period || !period.goal) return false;
  period.goal = null;
  return true;
}
