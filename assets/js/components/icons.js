// 画面・カード用のアイコン（インラインSVG、自作のみ。外部素材は使わない）。
// 線の太さ・角の丸みをそろえ、currentColor で色を継承する。

const PATHS = {
  // 棒グラフ（業績を見る）
  chart: '<path d="M4 4v15.2A0.8 0.8 0 0 0 4.8 20h15.2"/><path d="M8.5 16v-5"/><path d="M13 16V7.5"/><path d="M17.5 16v-3"/>',
  // 丸い的（目標）
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  // ゴールの旗
  flag: '<path d="M5.5 21.5v-17"/><path d="M5.5 4.8c2.2-1.5 4.3 1.3 6.5 0 1.9-1.1 3.9-0.9 5.5 0.2v6c-1.6-1.1-3.6-1.3-5.5-0.2-2.2 1.3-4.3-1.5-6.5 0"/>',
  // カレンダー（月次・レビュー）
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.8h17"/><path d="M8 2.8V6"/><path d="M16 2.8V6"/><path d="M7.5 13.5h3"/><path d="M13.5 13.5h3"/><path d="M7.5 17h3"/>',
  // 帳簿・ノート（年次登録）
  book: '<path d="M6 3.5h13.5v17H6.8a1.8 1.8 0 0 1-1.8-1.8V5.3A1.8 1.8 0 0 1 6.8 3.5Z"/><path d="M5 16.5h14.5"/><path d="M9 8h6.5"/><path d="M9 11.5h6.5"/>',
  // データベース（データ管理）
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-13"/><path d="M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8"/>',
  // 設定（歯車）
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3"/><path d="M12 18.2v3"/><path d="M2.8 12h3"/><path d="M18.2 12h3"/><path d="M5.2 5.2l2.1 2.1"/><path d="M16.7 16.7l2.1 2.1"/><path d="M18.8 5.2l-2.1 2.1"/><path d="M7.3 16.7l-2.1 2.1"/>',
  // 家（ホーム）
  home: '<path d="M4 11.2 12 4l8 7.2"/><path d="M6.2 9.5V20h11.6V9.5"/><path d="M10 20v-5.2h4V20"/>',
  // 建物（会社）
  building: '<rect x="5" y="3.5" width="11" height="17" rx="1"/><path d="M16 9.5h2.6a1 1 0 0 1 1 1V20.5"/><path d="M3.5 20.5h17.5"/><path d="M8.3 7.2h1.6"/><path d="M12 7.2h1.6"/><path d="M8.3 11h1.6"/><path d="M12 11h1.6"/><path d="M8.3 14.8h1.6"/><path d="M12 14.8h1.6"/>',
  // 書き出し（下向き矢印とトレイ）
  download: '<path d="M12 3.5v10.5"/><path d="m7.2 10 4.8 4.8L16.8 10"/><path d="M4 17.5v1.7A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8v-1.7"/>',
  // 読み込み（上向き矢印とトレイ）
  upload: '<path d="M12 14V3.5"/><path d="m7.2 7.5 4.8-4.8 4.8 4.8"/><path d="M4 17.5v1.7A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8v-1.7"/>',
  // 入れ替え（移行）
  swap: '<path d="M4 7.5h13"/><path d="m13.8 3.8 3.7 3.7-3.7 3.7"/><path d="M20 16.5H7"/><path d="m10.2 12.8-3.7 3.7 3.7 3.7"/>',
  // 芽（空の状態の案内）
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-3-2.4-5-6-5 0 3.6 2.2 5.4 6 5Z"/><path d="M12 11c0-3 2.4-5 6-5 0 3.6-2.2 5.4-6 5Z"/><path d="M5 21h14"/>',
  // きらめき
  sparkle: '<path d="M12 3.5c0.6 4.4 1.9 5.7 6.3 6.3-4.4 0.6-5.7 1.9-6.3 6.3-0.6-4.4-1.9-5.7-6.3-6.3C10.1 9.2 11.4 7.9 12 3.5Z"/><path d="M18.8 15.2c0.3 2 0.9 2.6 2.9 2.9-2 0.3-2.6 0.9-2.9 2.9-0.3-2-0.9-2.6-2.9-2.9 2-0.3 2.6-0.9 2.9-2.9Z"/>',
  // チェック
  check: '<circle cx="12" cy="12" r="8.8"/><path d="m8.2 12.4 2.6 2.6 5-5.4"/>',
  // 時計（月次）
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.2 2"/>',
  // プラス
  plus: '<circle cx="12" cy="12" r="8.8"/><path d="M12 8.2v7.6"/><path d="M8.2 12h7.6"/>',
  // 電卓（試算）
  calculator: '<rect x="6" y="2.8" width="12" height="18.4" rx="1.8"/><path d="M9.3 6.2h5.4"/><path d="M9.3 10.6h.01"/><path d="M12 10.6h.01"/><path d="M14.7 10.6h.01"/><path d="M9.3 14h.01"/><path d="M12 14h.01"/><path d="M14.7 14h.01"/><path d="M9.3 17.4h.01"/><path d="M12 17.4h.01"/><path d="M14.7 17.4h.01"/>'
};

export function icon(name, extraClass = "") {
  const body = PATHS[name] ?? "";
  return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// ページ見出しの先頭に付けるアイコンの受け皿。variant は "sun" | "coral"。
export function pageIcon(name, variant = "") {
  const variantClass = variant ? ` page-icon--${variant}` : "";
  return `<span class="page-icon${variantClass}" aria-hidden="true">${icon(name)}</span>`;
}
