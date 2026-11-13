import { REGISTRATION_STAGES } from "../config/constants.js";
import { getAnnualFigures, getBSFigures } from "./calc.js";

// 利益と手元のお金のズレ（追加フェーズ）。
// 過ぎた期の実績データだけを使い、「利益は出ているのに現預金が減った（増えた）」
// 主な理由を説明する。将来の予測は行わない。
// 完全な資金計算書は再現できないため、主な項目を取り上げ、残りは
// 「その他の動き」として合計が現預金の増減と一致する形で示す。
//
// お金への影響の考え方（すべて実績の増減からの算術的な内訳）：
//   現預金の増減 ≒ 当期純利益 ＋ 減価償却費（お金が出ていない費用）
//     − 売掛金の増加 − 棚卸資産の増加 ＋ 買掛金の増加 ＋ 借入金の増減 ＋ その他

// この表示に必要なB/S項目（今期・前期の両方に要る）
const REQUIRED_BS_CODES = Object.freeze(["BS001", "BS002", "BS003", "BS013", "BS014", "BS019"]);

// 対象は最新の年次登録、比較はその直前の年次登録（自動業績分析と同じ選び方）。
export function selectCashGapPair(company) {
  const periods = [...(company?.annualPeriods ?? [])]
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (periods.length === 0) return { current: null, previous: null };
  return {
    current: periods[periods.length - 1],
    previous: periods.length > 1 ? periods[periods.length - 2] : null
  };
}

// 前期・当期のペアから、お金の動きの内訳を計算する。
// 前提がそろわない場合は ok: false と理由コードを返す（推測で補わない）。
// 理由コード：NO_PREVIOUS（前期がない）／NOT_STANDARD（当期が簡易登録）／
// NO_BS（B/S登録がない）／MISSING_ITEMS（必要な項目の一部が未登録）
export function computeCashGap(current, previous) {
  if (!current || !previous) return { ok: false, reason: "NO_PREVIOUS" };
  if (current.stage !== REGISTRATION_STAGES.STANDARD) {
    return { ok: false, reason: "NOT_STANDARD" };
  }
  if (!current.bsValues || !previous.bsValues) return { ok: false, reason: "NO_BS" };

  const cur = getBSFigures(current.bsValues);
  const prev = getBSFigures(previous.bsValues);
  for (const code of REQUIRED_BS_CODES) {
    if (typeof cur[code] !== "number" || typeof prev[code] !== "number") {
      return { ok: false, reason: "MISSING_ITEMS" };
    }
  }
  const pl = getAnnualFigures(current);
  if (typeof pl.PL025 !== "number" || typeof pl.PL013 !== "number") {
    return { ok: false, reason: "MISSING_ITEMS" };
  }

  const cashChange = cur.BS001 - prev.BS001;
  const receivablesChange = cur.BS002 - prev.BS002;
  const inventoryChange = cur.BS003 - prev.BS003;
  const payablesChange = cur.BS013 - prev.BS013;
  const debtChange = (cur.BS014 + cur.BS019) - (prev.BS014 + prev.BS019);

  // amount は項目そのものの金額・増減、effect は手元のお金への影響（＋で増える方向）。
  const items = [
    { code: "NET_INCOME", amount: pl.PL025, effect: pl.PL025 },
    { code: "DEPRECIATION", amount: pl.PL013, effect: pl.PL013 },
    { code: "RECEIVABLES", amount: receivablesChange, effect: -receivablesChange },
    { code: "INVENTORY", amount: inventoryChange, effect: -inventoryChange },
    { code: "PAYABLES", amount: payablesChange, effect: payablesChange },
    { code: "DEBT", amount: debtChange, effect: debtChange }
  ];
  const explained = items.reduce((sum, item) => sum + item.effect, 0);
  // 残りは「その他の動き」。設備の購入・買い替え、税金や利息の支払い、
  // 未払金の動きなど、上の項目以外の合計であり、内訳は特定しない。
  items.push({ code: "OTHER", amount: cashChange - explained, effect: cashChange - explained });

  return {
    ok: true,
    currentLabel: current.displayName,
    previousLabel: previous.displayName,
    cashPrevious: prev.BS001,
    cashCurrent: cur.BS001,
    cashChange,
    items
  };
}
