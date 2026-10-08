---
created_at: 2026-07-12
updated_at: 2026-08-05
updated_by: codex-gpt-5
---

# Design System

Header Relay のデザイントークンと UI ガイドライン。
Popup・Options（manage）ページ共通の基盤として参照する。

## Design Philosophy

- Apple HIG をベースとした iOS-like デザイン
- system-ui フォントファミリー優先
- Light / Dark テーマ対応（`prefers-color-scheme`）
- Reduced motion / Reduced transparency / High contrast 対応
- Popup はマウス操作前提（タッチターゲット 44px → 36px に緩和可）

## Color Tokens

CSS custom properties として `popup-root`（将来的に共通クラスへ昇格予定）で定義。

| Token                   | Light                    | Dark                     | 用途                   |
| ----------------------- | ------------------------ | ------------------------ | ---------------------- |
| `--ios-bg`              | `#f2f2f7`                | `#000000`                | ページ背景             |
| `--ios-card`            | `#ffffff`                | `#1c1c1e`                | カード・セクション背景 |
| `--ios-label`           | `#1c1c1e`                | `#ffffff`                | 主テキスト             |
| `--ios-secondary-label` | `rgba(60,60,67,0.6)`     | `rgba(235,235,245,0.6)`  | 補助テキスト           |
| `--ios-fill`            | `rgba(120,120,128,0.12)` | `rgba(120,120,128,0.24)` | ボタン・バッジ背景     |
| `--ios-separator`       | `rgba(60,60,67,0.29)`    | `rgba(84,84,88,0.65)`    | 区切り線               |
| `--ios-chrome`          | `rgba(242,242,247,0.8)`  | `rgba(0,0,0,0.75)`       | 半透明ツールバー       |
| `--ios-switch-off`      | `#e9e9eb`                | `#39393d`                | スイッチ OFF 背景      |

### Accent Colors

| Token          | Light     | Dark      | 用途                         |
| -------------- | --------- | --------- | ---------------------------- |
| `--ios-blue`   | `#007aff` | `#0a84ff` | プライマリアクション・リンク |
| `--ios-green`  | `#34c759` | `#30d158` | 成功・有効状態               |
| `--ios-orange` | `#ff9500` | `#ff9f0a` | 警告・待機状態               |
| `--ios-red`    | `#ff3b30` | `#ff453a` | エラー・破壊的操作           |
| `--ios-gray`   | `#8e8e93` | —         | 無効状態                     |

## Easing

| Token          | Value                            | 用途                                             |
| -------------- | -------------------------------- | ------------------------------------------------ |
| `--ios-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | スイッチ・ドロワー等のスプリング系アニメーション |

UI トランジションのデフォルトは `ease-out` 100–200ms。
`ease-in` は使用禁止（初動が遅く鈍く感じる）。

## Typography

```
Font family: system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif
Monospace:   ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace
Smoothing:   -webkit-font-smoothing: antialiased
```

| Role             | Size | Weight | Letter-spacing     | Line-height |
| ---------------- | ---- | ------ | ------------------ | ----------- |
| Title            | 16px | 600    | -0.01em            | 1.25        |
| Body / Row title | 15px | 400    | -0.01em            | —           |
| Section label    | 13px | 400    | 0.03em (uppercase) | —           |
| Footnote         | 12px | 400    | —                  | 1.35        |
| Badge            | 12px | 600    | —                  | —           |
| Button (pill)    | 13px | 600    | -0.01em            | —           |

## Spacing & Layout

### Popup

- 幅: 480px
- セクション間: 16px (`space-y-4`)
- カード角丸: 12px
- 行パディング: 8px 16px（コンパクト行）/ 10px 16px（通常行）
- 行最小高: 36px（マウス操作向け）
- ヘッダーパディング: 8px 16px

### Components

- **Card**: `border-radius: 12px`, `background: var(--ios-card)`
- **Badge**: `border-radius: 9999px`, `padding: 3px 9px`
- **Button (pill)**: `border-radius: 9999px`, `min-height: 28px`
- **Switch**: 51×31px トラック、27px ノブ
- **Separator**: 0.5px hairline、左 16px inset

## Accessibility

- `prefers-reduced-motion: reduce` → transform アニメーション無効、opacity/color のみ 150ms
- `prefers-reduced-transparency: reduce` → backdrop-filter 無効、不透明背景に切替
- `prefers-contrast: more` → カードにボーダー追加
- ボタン `:active` フィードバック: `scale(0.96)` + opacity（即時応答、pointer-down 時点）

## Options ページ (manage)

デザイントークンは `.hr-theme` に昇格済み。Popup は `.hr-theme.popup-root` で適用。

- `manage.html` が `options_ui` から開く唯一の管理画面。既定表示と主な操作対象は Profile 管理とする。
- Compact など Profile に属さない拡張機能全体の設定は、サイドバー下部のSettingsリンクから `manage.html#/settings` で表示する。

### ルーティング

- `@tanstack/solid-router` の code-based routing を使用する。
- Chrome 拡張ページには server rewrite がないためhash historyとし、Profileは`manage.html#/profiles/:profileId/*`、拡張機能全体の設定は`manage.html#/settings/*`で直接表示する。
- editor・session state は root layout が保持し、セクション遷移では破棄しない。

### レイアウト

- サイドバー幅: 260px (lg breakpoint 以上で表示)
- サイドバーはProfileList、ReviewPromptCard、Settings、外部リンクだけのBottomNavの順に配置する。
- ProfileListの各行はProfile名、未保存表示、enabledスイッチを持つ。Profile作成ボタンは見出しの右側に置く。
- enabledはProfileListで即時変更し、削除はOverviewに配置する。
- MainのProfile領域はProfile名とProfile固有の6タブを持ち、URL Probeを含める。
- MainのSettings領域はSettings見出しとGeneral、Audit Logs、JSON Editorの3タブを持つ。
- Migration Issuesは独立ナビゲーションを持たず、選択中Profileに問題がある場合だけCookie画面の先頭に表示する。
- モバイルではProfileListとMain内のタブを一行の横スクロールにする。
- メインコンテンツ: `padding: 20px` (lg: 24px)
- ヘッダー: `hr-chrome` (translucent sticky bar)

### コンポーネント共有

| Popup prefix    | Manage/共通 prefix | 用途                       |
| --------------- | ------------------ | -------------------------- |
| `popup-card`    | `hr-card`          | カード背景 + 12px 角丸     |
| `popup-btn`     | `hr-btn`           | Pill ボタン                |
| —               | `hr-switch`        | 共通トグルスイッチ         |
| `popup-badge-*` | `hr-badge-*`       | バッジ                     |
| `popup-list`    | `hr-list`          | ヘアラインセパレータ       |
| `popup-row`     | `hr-row`           | リスト行 (44px min-height) |

### Options 固有

- `hr-input` / `hr-textarea` / `hr-select`: フォーム要素（iOS fill background + focus ring）
- `hr-nav-item` / `hr-nav-item-active`: サイドバーナビゲーション
- `hr-section-label`: セクション見出し (uppercase, secondary-label)
