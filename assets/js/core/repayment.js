import { getAnnualFigures, getBSFigures } from "./calc.js";

// 借入返済の見通し（仕様書 6.7）。
// 登録済みの決算データ（対象期＝最新の年次登録の実績）から、
// 「借入を返済していける目安」を計算する。将来の予測は行わない。
// 数字が無い項目は推測で補わず、項目ごとに値と理由コードを返す。
//
// 理由コード：
//   NO_BS          B/S任意登録がないため、借入金の残高が出せない
//   MISSING_ITEMS  必要な項目の一部が未登録のため出せない
//   NO_DEPRECIATION 減価償却費がない（簡易登録）ため、返済のもとが出せない
//   NO_REPAYMENT   年間返済額が未登録のため出せない
//   ZERO_REPAYMENT 年間返済額が0のため、倍率が計算できない
//   NEGATIVE_BASE  返済のもとになるお金がマイナスのため、倍率を出さない
//   NO_DEBT        借入金がないため、残りの目安・倍率を出さない

function amountOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function computeRepaymentOutlook(period) {
  if (!period) return null;
  const figures = getAnnualFigures(period);

  // 借入金の残高（決算時点の残高。短期＋長期）
  let debtBalance = null;
  let debtReason = null;
  if (!period.bsValues) {
    debtReason = "NO_BS";
  } else {
    const bs = getBSFigures(period.bsValues);
    if (typeof bs.BS014 !== "number" || typeof bs.BS019 !== "number") {
      debtReason = "MISSING_ITEMS";
    } else {
      debtBalance = bs.BS014 + bs.BS019;
    }
  }
  const noDebt = debtBalance === 0;

  // 年間返済額（登録値。その期の1年間に返す元金と利息の合計）
  const annualRepayment = amountOrNull(period.annualRepayment);

  // 返済のもとになるお金（当期純利益＋減価償却費。減価償却費は実際には
  // お金が出ていない費用のため足し戻す。6.5と同じ考え方）
  let repaymentBase = null;
  let baseReason = null;
  if (typeof figures.PL025 !== "number") {
    baseReason = "MISSING_ITEMS";
  } else if (typeof figures.PL013 !== "number") {
    baseReason = "NO_DEPRECIATION";
  } else {
    repaymentBase = figures.PL025 + figures.PL013;
  }

  // 返済したあとの残りの目安（返済のもと − 年間返済額）
  let remaining = null;
  let remainingReason = null;
  if (noDebt) {
    remainingReason = "NO_DEBT";
  } else if (repaymentBase === null) {
    remainingReason = baseReason;
  } else if (annualRepayment === null) {
    remainingReason = "NO_REPAYMENT";
  } else {
    remaining = repaymentBase - annualRepayment;
  }

  // 返済額の何倍あるか（返済のもと ÷ 年間返済額。
  // 試算「借入返済」の債務返済余裕倍率（DSCR）と同じ式）
  let multiple = null;
  let multipleReason = null;
  if (noDebt) {
    multipleReason = "NO_DEBT";
  } else if (repaymentBase === null) {
    multipleReason = baseReason;
  } else if (annualRepayment === null) {
    multipleReason = "NO_REPAYMENT";
  } else if (annualRepayment === 0) {
    multipleReason = "ZERO_REPAYMENT";
  } else if (repaymentBase < 0) {
    multipleReason = "NEGATIVE_BASE";
  } else {
    multiple = repaymentBase / annualRepayment;
  }

  return {
    debtBalance,
    debtReason,
    annualRepayment,
    repaymentBase,
    baseReason,
    remaining,
    remainingReason,
    multiple,
    multipleReason
  };
}
