---
created_at: 2026-07-13
updated_by: claude-opus-4-6
---

# Chrome Web Store v0.2.0 リスティング最適化 設計書

v0.2.0 リリースに伴う Chrome Web Store のリスティング文言・多言語化・スクリーンショット更新の設計。

## スコープ

拡張機能の実装変更は含まない。Store リスティングの最適化のみ。

1. リスティング文言（Detailed Description）の更新
2. ja/ko ローカライズ済みリスティングの追加
3. スクリーンショット・プロモタイルの更新（3枚→5枚）

## 1. リスティング文言の更新

### Summary（132文字制限）

変更なし。現状で機能の本質を伝えている。

> Capture HTTP response headers and relay fixed or captured request headers for API development and testing.

### Detailed Description 構成

```
[導入文]              — 変更なし
[Main features]       — v0.2.0 の新機能を既存リストに統合
[Privacy and security] — 変更なし
[バージョンメモ]       — 末尾に1行追加
```

### Main features に追加する項目

既存の箇条書きリストに以下を自然に統合する:

- Full-page settings with section-based navigation and unsaved-draft URL Probe.
- Excluded-path tester for checking path-prefix matching rules before saving.
- iOS-style UI across popup and settings for a consistent, native feel.
- Japanese and Korean localization.

### 末尾バージョンメモ

```
Version 0.2 — redesigned UI, Japanese and Korean localization.
```

### 変更しない部分

- Privacy and security セクション（実装に変更なし）
- Permission Justifications（変更なし）
- Privacy Tab（変更なし）

## 2. リスティング多言語化

### 対象ロケール

ja, ko（拡張機能の `_locales` と一致）

### 管理ファイル

| ファイル                              | 用途               |
| ------------------------------------- | ------------------ |
| `docs/chrome-web-store/listing.md`    | 英語（既存、更新） |
| `docs/chrome-web-store/listing-ja.md` | 日本語（新規）     |
| `docs/chrome-web-store/listing-ko.md` | 韓国語（新規）     |

### 翻訳方針

- **Name**: `Header Relay`（固有名詞、全言語共通）
- **Summary**: `_locales/*/messages.json` の `extDescription` をベースに、132文字制限内で Store 向けに調整
- **Detailed Description**: 英語版を直訳ではなく、各言語の開発者が自然に読める文体で書き下ろし
- **Privacy Tab / Permission Justifications**: ローカライズ対象外（レビュアー向け英語のまま）

### ja Summary

> HTTPレスポンスヘッダーをキャプチャし、固定・取得したリクエストヘッダーをAPI開発・テスト用に中継します。

### ko Summary

`_locales/ko/messages.json` の `extDescription` をベースに同様に調整。

### ローカライズ済みリスティングの構成

各言語ファイルは英語版と同じセクション構成。以下のセクションのみ含む:

- Product Details（Name, Summary, Detailed Description）
- Category / Language

## 3. スクリーンショット・アセットの更新

### 生成方法

既存の `scripts/create-store-assets.mjs`（Chrome headless + モック HTML）を更新。生成フロー自体は変更しない。

### 5枚構成

| #   | ファイル名                   | テーマ                       | 訴求ポイント                                               |
| --- | ---------------------------- | ---------------------------- | ---------------------------------------------------------- |
| 01  | `screenshot-01-overview`     | 管理画面 Overview            | iOS-style デザイン、セクションナビ、プロファイル概要タイル |
| 02  | `screenshot-02-popup`        | Popup                        | コンパクトな状態表示、ワンクリック操作、ダークモード       |
| 03  | `screenshot-03-url-probe`    | URL Probe + 除外パステスター | 事前検証、設定の安心感                                     |
| 04  | `screenshot-04-headers`      | ヘッダー設定                 | Fixed / Captured ヘッダーのエディタ UI                     |
| 05  | `screenshot-05-i18n-privacy` | 多言語 + プライバシー        | ja/ko 対応表示、ローカルオンリーモデル                     |

### デザイン方針

- 現在のモック HTML のレイアウト構成（左に説明＋右にカード等）を踏襲
- カラーパレット・角丸・フォントを `DESIGN.md` のトークンに寄せる（`--ios-bg`, `--ios-card` 系の色味）
- v0.1 のモックにない要素を追加: サイドバーナビ、除外パステスター
- 多言語対応を示すバッジ的表示（"日本語 / 한국어" supported）

### プロモタイル

| ファイル名                    | サイズ   | 変更                                |
| ----------------------------- | -------- | ----------------------------------- |
| `small-promo-tile-440x280`    | 440×280  | デザインテイストを iOS-style に統一 |
| `marquee-promo-tile-1400x560` | 1400×560 | 同上                                |

### 変更しないもの

- `store-icon-128.png`（アイコン変更なし）
- 生成スクリプトのフロー（Chrome headless レンダリング）

## 成果物一覧

| ファイル                                                       | 操作            |
| -------------------------------------------------------------- | --------------- |
| `docs/chrome-web-store/listing.md`                             | 更新            |
| `docs/chrome-web-store/listing-ja.md`                          | 新規            |
| `docs/chrome-web-store/listing-ko.md`                          | 新規            |
| `scripts/create-store-assets.mjs`                              | 更新            |
| `docs/chrome-web-store/assets/screenshot-*.png`                | 再生成（3→5枚） |
| `docs/chrome-web-store/assets/small-promo-tile-440x280.png`    | 再生成          |
| `docs/chrome-web-store/assets/marquee-promo-tile-1400x560.png` | 再生成          |
