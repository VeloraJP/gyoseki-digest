// 項目定義。コードと名称は business-tool2-2 の項目定義を流用する。
// hint は、会計がわからない経営者向けの短い補足。

function field(id, label, options = {}) {
  return Object.freeze({
    id,
    label,
    auto: false,
    allowNegative: false,
    ...options
  });
}

export const PL_FIELDS = Object.freeze([
  field("PL001", "売上高", { hint: "売上の合計" }),
  field("PL002", "売上原価", { hint: "売上に対応する仕入や製造などの原価" }),
  field("PL003", "売上総利益", { auto: true, allowNegative: true, hint: "売上から原価を引いた利益" }),
  field("PL004", "役員報酬"),
  field("PL005", "給与手当"),
  field("PL006", "法定福利費", { hint: "社会保険料など、会社が負担する分" }),
  field("PL007", "人件費合計", { auto: true, hint: "役員報酬・給与手当・法定福利費の合計" }),
  field("PL008", "地代家賃"),
  field("PL009", "地代家賃うち非課税分", { includedIn: "PL008", hint: "地代家賃のうち消費税がかからない分（内数）" }),
  field("PL010", "水道光熱費"),
  field("PL011", "広告宣伝費"),
  field("PL012", "支払手数料"),
  field("PL013", "減価償却費", { hint: "建物や機械などの価値の目減り分を費用にしたもの" }),
  field("PL014", "その他固定費", { hint: "売上に関係なくかかる上記以外の費用" }),
  field("PL015", "その他変動費", { hint: "売上原価以外の、売上に連動して変わる費用" }),
  field("PL016", "販売費及び一般管理費合計", { auto: true, hint: "人件費・家賃など、会社の運営にかかる費用の合計" }),
  field("PL017", "営業利益", { auto: true, allowNegative: true, hint: "本業で得た利益" }),
  field("PL018", "営業外収益", { hint: "受取利息など、本業以外の収益" }),
  field("PL019", "営業外費用", { hint: "支払利息など、本業以外の費用" }),
  field("PL020", "経常利益", { auto: true, allowNegative: true, hint: "本業以外も含めた、通常の活動での利益" }),
  field("PL021", "特別利益", { hint: "資産の売却益など、その期だけの特別な利益" }),
  field("PL022", "特別損失", { hint: "その期だけの特別な損失" }),
  field("PL023", "税引前当期純利益", { auto: true, allowNegative: true, hint: "税金を引く前の最終利益" }),
  field("PL024", "法人税等", { allowNegative: true, hint: "法人税・住民税・事業税などの合計" }),
  field("PL025", "当期純利益", { auto: true, allowNegative: true, hint: "最終的に残る利益" })
]);

// 簡易登録で入力する項目（仕様書 4.3.1）
export const SIMPLE_INPUT_CODES = Object.freeze(["PL001", "PL025"]);

// 標準登録で入力する項目（仕様書 4.3.2、17項目）
export const STANDARD_INPUT_CODES = Object.freeze([
  "PL001", "PL002", "PL004", "PL005", "PL006", "PL008", "PL010",
  "PL011", "PL012", "PL013", "PL014", "PL015", "PL018", "PL019",
  "PL021", "PL022", "PL024"
]);

// 標準登録の任意項目（PL008の内数）
export const STANDARD_OPTIONAL_CODES = Object.freeze(["PL009"]);

// 年次の自動計算項目（仕様書 4.3.3）
export const ANNUAL_AUTO_CODES = Object.freeze([
  "PL003", "PL007", "PL016", "PL017", "PL020", "PL023", "PL025"
]);

// 要因リストの候補（仕様書 6.3。合計項目と内数を除いた入力項目）
export const FACTOR_CANDIDATE_CODES = Object.freeze([
  "PL001", "PL002", "PL004", "PL005", "PL006", "PL008", "PL010",
  "PL011", "PL012", "PL013", "PL014", "PL015", "PL018", "PL019",
  "PL021", "PL022", "PL024"
]);

export const BS_FIELDS = Object.freeze([
  field("BS001", "現預金"),
  field("BS002", "売掛金", { hint: "まだ入金されていない売上代金" }),
  field("BS003", "棚卸資産", { hint: "商品や材料などの在庫" }),
  field("BS004", "その他流動資産"),
  field("BS005", "流動資産合計", { auto: true }),
  field("BS006", "建物"),
  field("BS007", "土地"),
  field("BS008", "車両運搬具"),
  field("BS009", "工具器具備品"),
  field("BS010", "その他固定資産"),
  field("BS011", "固定資産合計", { auto: true }),
  field("BS012", "資産合計", { auto: true }),
  field("BS013", "買掛金", { hint: "まだ支払っていない仕入代金" }),
  field("BS014", "短期借入金"),
  field("BS015", "未払法人税等"),
  field("BS016", "未払消費税等"),
  field("BS017", "その他流動負債"),
  field("BS018", "流動負債合計", { auto: true }),
  field("BS019", "長期借入金"),
  field("BS020", "その他固定負債"),
  field("BS021", "固定負債合計", { auto: true }),
  field("BS022", "負債合計", { auto: true }),
  field("BS023", "資本金"),
  field("BS024", "利益剰余金", { allowNegative: true, hint: "これまでの利益の蓄積" }),
  field("BS025", "その他純資産", { allowNegative: true }),
  field("BS026", "純資産合計", { auto: true, allowNegative: true }),
  field("BS027", "負債純資産合計", { auto: true })
]);

export const BS_AUTO_CODES = Object.freeze([
  "BS005", "BS011", "BS012", "BS018", "BS021", "BS022", "BS026", "BS027"
]);

// 月次入力項目（仕様書 4.4.1、7項目）
// M007 は暫定定義：月次試算表ベースの当期純利益をそのまま登録値とする（仕様書 11.1-2 の最終確定待ち）
export const MONTHLY_FIELDS = Object.freeze([
  field("M001", "売上高"),
  field("M002", "売上原価"),
  field("M003", "人件費合計", { hint: "役員報酬・給与手当・法定福利費の合計" }),
  field("M004", "地代家賃"),
  field("M005", "その他固定費", { hint: "水道光熱費・広告宣伝費・支払手数料・減価償却費・その他固定費の合計" }),
  field("M006", "その他変動費", { hint: "売上原価以外の、売上に連動して変わる費用" }),
  field("M007", "当期純利益", { allowNegative: true, hint: "その月の最終利益（月次試算表の当期純利益）" })
]);

export const MONTHLY_INPUT_CODES = Object.freeze(MONTHLY_FIELDS.map((f) => f.id));

// 月次の自動計算項目（仕様書 4.4.2）
export const MONTHLY_AUTO_FIELDS = Object.freeze([
  Object.freeze({ id: "M101", label: "売上総利益", hint: "売上から原価を引いた利益" }),
  Object.freeze({ id: "M102", label: "販売費及び一般管理費合計", hint: "人件費・家賃など、会社の運営にかかる費用の合計" }),
  Object.freeze({ id: "M103", label: "営業利益", hint: "本業で得た利益" }),
  Object.freeze({ id: "M104", label: "営業利益と当期純利益の差", hint: "営業外損益・特別損益・法人税等による差の合計" })
]);

export const MONTHLY_AUTO_CODES = Object.freeze(MONTHLY_AUTO_FIELDS.map((f) => f.id));

const FIELD_MAP = new Map(
  [...PL_FIELDS, ...BS_FIELDS, ...MONTHLY_FIELDS, ...MONTHLY_AUTO_FIELDS].map((f) => [f.id, f])
);

export function fieldLabel(code) {
  return FIELD_MAP.get(code)?.label ?? code;
}

export function fieldHint(code) {
  return FIELD_MAP.get(code)?.hint ?? "";
}
