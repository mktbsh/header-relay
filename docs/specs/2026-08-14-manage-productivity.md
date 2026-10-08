---
title: Profile操作、設定ファイル、キーボードショートカット
created_at: 2026-08-14
updated_at: 2026-08-14
updated_by: codex-gpt-5
status: accepted
issues: [122, 123, 124]
adr: ../adr/2026-08-14-manage-productivity.md
---

# Profile操作、設定ファイル、キーボードショートカット

## 文書の目的

Issue #122〜#124で決まったManageの反復操作を、実装可能な契約へ固定する。
Issue #121は対象外とする。

## 目的と非目的

### 目的

- Profileを既存設定ごと複製し、ConfigのProfile Orderを変更できるようにする。
- AppConfig全体をJSONファイルへ安全に書き出し、検証済みのファイルで全体置換できるようにする。
- 全Profileを一時停止し、停止直前のPaused Profile Setを使って復元するキーボード操作を追加する。

### 非目的

- Profile単位のエクスポート／インポートは今回実装しない。
- Profileの表示順と実行順を別々に保持しない。
- キーボードショートカットを複数コマンドへ拡張しない。
- Paused Profile SetをAppConfigへ保存しない。

## 用語と不変条件

- Profile Orderは`AppConfig.profiles`の配列順であり、表示順とRuntimeの評価順を兼ねる。
- Profile IDは複製後もConfig内で一意である。
- Profileの複製は、元Profileの永続設定をコピーするが、Enabled状態とRuntime Sessionはコピーしない。
- Configuration ExportはAppConfigだけを対象にし、`storage.session`にあるCaptured Header ValueとTracked Cookie Valueを含めない。
- Redacted Configuration Exportは、秘密値を含める明示的な選択がない限り、値を空文字にする。空値のFixed Cookieは無効化し、複数選択肢のPopup selectはtext入力へ変換して、Import可能なConfigにする。
- 全Profile停止からの復元は、現在もConfigに存在するIDだけを対象にする。削除済みProfileは復元しない。

## #122 Profileの複製とProfile Order

### 操作

- Profile Overviewの設定パネルに複製操作を置く。
- 複製Profileは元Profileの直後へ挿入する。
- 複製名の第一候補は`Copy of {original_name}`とする。比較キーが既存名と衝突する場合は末尾に` 2`、` 3`のような最小連番を付ける。
- 複製Profileは`enabled: false`で作成する。
- Profile IDと、Profile内のTarget Origin、Header、Cookie、Excluded Path、Migration IssueのIDはすべて新しく生成する。
- `createdAt`と`updatedAt`は複製時刻にする。Captured Header Value、Tracked Cookie Value、DNR Rule IDは複製しない。

### 並び替え

- Sidebarの各Profile行に上移動・下移動ボタンを置く。
- 先頭の上移動、末尾の下移動は無効にする。
- 操作は`AppConfig.profiles`の配列順を直接変更し、表示順とRuntimeのProfile Orderを一致させる。
- 並び替えはProfile作成・削除と同じ即時保存の操作とする。
- 保存時は保存済みConfigの配列を並び替え、Manageにある未保存のProfileセクションdraftは同じProfile IDに対して保持する。

## #123 Configuration Export / Import

### Export

- Settings › JSON EditorにExport操作を置く。
- Export対象は保存済みAppConfig全体で、ファイル名は`header-relay-config-YYYY-MM-DD.json`とする。
- JSONは読みやすい2スペース整形とし、`schemaVersion`を保持する。
- 「秘密値を含める」チェックボックスの既定値はOFFとする。
- OFFの場合はFixed HeaderとFixed Cookieの`value`、Popup select optionの`value`、Migration Issueの`originalValue`と`originalPopup`内のoption valueを空にする。
- OFFの場合、空値のFixed Cookieは`enabled: false`になり、複数選択肢を持つPopup selectは選択肢を除いたtext入力になる。
- ONの場合だけ、上記の値を含める。
- Session内の追跡値、監査ログ、Runtime状態はExportしない。

### Import

- JSONファイルを1つ選び、`JSON.parse`、`migrateAppConfig`、`parseAppConfig`の順で検証する。
- 検証に失敗した場合はConfigへ書き込まず、既存Configを変更しない。
- 検証成功後、全体置換の確認を表示する。Cancelなら書き込まない。
- Confirm後に既存の`saveConfig`経路へ渡し、必要なHost Permissionを要求してRuntimeを再同期する。
- Redacted ExportをImportした場合、空の値を含む設定として置換する。既存Configの秘密値を自動的に引き継がない。
- Import後はManageの保存済みConfig、JSON Editor、Viewed Profileを再読み込みする。

## #124 全Profile停止／復元ショートカット

### Manifestとイベント

- Manifestに`toggle-all-profiles`という1つのcommandを追加する。
- `suggested_key`は設定せず、利用者が`chrome://extensions/shortcuts`で割り当てる。
- `browser.commands.onCommand`でcommand名を受け、active tabは参照しない。
- 新しいPermissionは追加しない。

### 状態遷移

| Event                           | Before                       | After                 | Paused Profile Set             |
| ------------------------------- | ---------------------------- | --------------------- | ------------------------------ |
| Shortcut（Enabled Profileあり） | 一部または全ProfileがEnabled | 全ProfileがDisabled   | 直前のEnabled Profile IDを保存 |
| Shortcut（全Disabled、Setあり） | 全ProfileがDisabled          | 存在するIDだけEnabled | クリア                         |
| Shortcut（全Disabled、Setなし） | 全ProfileがDisabled          | 変更なし              | 変更なし                       |
| 通常のProfile toggle            | 任意                         | 指定Profileを変更     | 古いSetをクリア                |

- 全Profile停止時は、停止したProfileのRuntime Sessionを個別にクリアする。
- 復元時はRuntime Sessionを復元せず、ConfigのEnabledだけを戻してRuntimeを再同期する。
- Profile削除やConfig置換後にSetへ残ったIDは復元対象にしない。
- Paused Profile Setは`storage.session`に保存し、ブラウザ再起動時に失われる。その場合、Configは全Disabledのままになる。

### Feedback

- 全Profile停止後はAction badgeに`OFF`を表示する。
- 復元後はAction badgeの文字を空にする。
- 通知Permissionは追加せず、通知も表示しない。

## 共通の受け入れ条件

- [ ] 8ロケールが同一キー構成を保つ。
- [ ] 各機能の挙動変更コミットにpatch changesetを同梱する。
- [ ] #122と#123のManage共通ファイル変更が他機能の未保存draftを壊さない。
- [ ] `pnpm test`、`pnpm compile`、`pnpm lint`、`pnpm build`が成功する。
- [ ] ManageのProfile操作、JSON transfer、shortcutの主要経路をChromium E2Eで確認する。
