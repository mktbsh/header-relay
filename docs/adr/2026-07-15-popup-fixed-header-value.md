---
title: Popupから適用中の固定ヘッダー値を変更できるようにする
date: 2026-07-15
status: accepted
issue: 54
agent_model: claude-opus-4-8
---

# 背景

カナリアリリースや環境切り替えでは、振り分け用Headerの値（`x-release-track: stable` / `canary` / `canary-10`）を
短時間に何度も変更したい。現状は管理画面を開き、対象ProfileとHeaderを探して編集する導線しかなかった。

# 決定

固定HeaderにPopup公開設定を追加し、現在のタブURLに適用されるHeaderだけをPopupから変更できるようにする。

- Config: `FixedHeader.popup?: { visible, input: "text" | "select", options? }` を追加（schemaVersion 3 -> 4）。
  `popup` 未設定または `visible: false` はPopup非表示。
- Migration: v3 -> v4 は schemaVersion のバンプのみ。既存Headerに `popup` を付けない。
  アップグレードだけで意図せずHeader値をPopupへ公開しないため。
- Messaging: `UPDATE_FIXED_HEADER_VALUE { profileId, headerId, value }` を追加。
  Popupは保持しているConfig全体を保存せず、Runtime側が最新Configへ値だけを部分適用する。
- Popup: Compilerの `probeUrl()` 結果のみを入力とし、Popup独自のmatching / 除外 / 競合判定を持たない。
  DNR Rulesは書き換えず、Config更新 -> Compiler -> DNR Syncのフローを管理画面と共有する。
- 競合Headerは編集不可とし、Compilerの競合メッセージをそのまま表示する。

# 補足決定（issue に明記がなく、実装時に決めた事項）

- **Header値のValidation**: 前後空白を含めて verbatim に保存する（正規化しない）。
  Header値では空白が意味を持ちうるため、保存時に黙って書き換えるとブラウザが送る値と設定値が乖離する。
  空文字は既存の固定HeaderのValidation方針どおり許容する。
- **Session を消さない**: `saveConfig` は「ルールが変わったProfile」のSessionをクリアするが、
  `updateFixedHeaderValue` はクリアしない。固定Headerの**値**はそのProfileが何をCaptureするかに影響せず、
  カナリア切り替えのたびにCaptured tokenを失うのはissueのGoal（頻繁な操作を短い導線で）に反するため。
- **既存の Fixed Headers セクションは残す**: 新設した「このページ」セクション（編集可能・URL一致のみ）とは
  問いが違う（「ここで何を変えられるか」と「何が設定されているか」）ため、置き換えずに併置した。
- **権限追加なし**: タブURLは `host_permissions: ["<all_urls>"]` で取得できるため `tabs` 権限は追加しない。
  URLを取得できないタブ（`chrome://` など）では編集候補ゼロとして扱う。
- **Select の現在値がoptionsに無い場合**: 操作不能にせず `Custom: <value>` として先頭に表示し、
  選択で正規値へ戻せるようにする。設定不整合はユーザーが直せる状態で見せる。
- **管理画面の並び順編集**: ドラッグ&ドロップではなく ↑ / ↓ ボタン。選択肢は数件想定で、
  D&Dの実装コストとa11y対応に見合わないため。

# 影響

- 既存Configは `migrateAppConfig()` が v3 -> v4 へ移行する。既存の固定HeaderはPopup非表示のまま。
- `ExtensionCommandHandlers` に `updateFixedHeaderValue` が追加され、実装漏れは型エラーになる。
- DNR同期の失敗は従来どおり `SessionState.lastError` に現れ、Popupの既存エラー表示に載る。
  Config保存だけ成功して同期に失敗した場合も、Audit Log（`fixed_header_value_updated`）に記録が残る。
