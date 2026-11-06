# 業績ダイジェスト

登録した決算（年次）と月次の数字を自動で要約し、「結局いくら儲かるのか」「儲けが増えた／減った要因は何か」「前月・前年同月・前年度と比べてどう変わったか」に、追加の数値入力なしで答えるWebアプリです。

根本原則：**全ては、会計がわからない中小企業経営者のためにある。**

仕様の正本は `~/workspace/projects/management-analysis-tool/業績ダイジェスト_仕様書.md`（2026-11-06承認の正式仕様）です。本リポジトリはその初版範囲のみを実装しています。

## 特徴

- スマートフォン・PC両対応のWebアプリ（PWA構成）。ビルド不要のプレーンなHTML/CSS/JavaScript（ESモジュール）。
- データは端末のブラウザ内（localStorage）にだけ保存し、サーバーへ送信しません。
- バックアップと端末間移行はJSONの書き出し・読み込み（置き換え方式、5MBまで、本ツール形式のみ）。

## 初版の範囲

- 会社登録と初回設定（決算月・税込／税抜・金額入力単位）
- 年次登録：簡易2項目（売上高・当期純利益）／標準17項目の2段階、貸借対照表（B/S）は任意登録
- 月次登録：7項目（売上高、売上原価、人件費合計、地代家賃、その他固定費、その他変動費、当期純利益）
- 自動業績分析：当期純利益の主表示、前期比較、増減の大きい項目（要因リスト、上位5項目）
- 月次・年度レビュー：前年度・前月・前年同月比較と当年度累計
- SIM-06発展系①「差額・達成率」は後段フェーズのため初版には含みません。

## 起動方法

任意の静的HTTPサーバーでこのフォルダを配信してください（ESモジュールのため `file://` では動作しません）。

```bash
cd gyoseki-digest
python3 -m http.server 8123
# http://localhost:8123/ を開く
```

## テスト

```bash
npm test   # node --test（計算・比較・検証・保存・描画のテスト）
```

## 構成

```
index.html                  画面の土台
assets/css/                 スタイル
assets/js/
  config/constants.js       定数（保存キー、版、単位など）
  data/fields.js            項目定義（business-tool2-2から流用）
  data/schema.js            データ構造の生成
  core/calc.js              自動計算（年次・月次・B/S、決算期キー、月次集計）
  core/compare.js           増減比較・要因リスト・当年度累計
  core/analysis.js          分析対象期の選定
  core/validate.js          保存データ検証と登録時の入力確認
  storage/repository.js     端末内保存（localStorage）
  storage/import-export.js  JSON書き出し・読み込み
  state/store.js            状態管理
  navigation/router.js      ハッシュルーター
  views/                    各画面（スタート／設定／ホーム／年次登録／月次登録／分析／レビュー／データ管理）
tests/                      テスト
```
