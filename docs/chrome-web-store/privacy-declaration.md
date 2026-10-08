---
updated_at: 2026-08-05
---

# Chrome Web Store プライバシー申告の判断記録

2026-07-18にv0.5.0がChrome Web Storeの審査を通過し、ウェブ履歴区分を「未収集」へ変更可能な状態であることを確認した。

このドキュメントは、Chrome Web Store Developer Dashboard の Privacy practices で
何をどの根拠で申告する/しないかの判断を記録する。実装を変更したら必ずここを更新する。

## 前提: Dashboard の設問とカテゴリ定義

Developer Dashboard の Privacy practices は「収集するユーザーデータ」をカテゴリ単位で
申告させる。カテゴリの例示(公式ドキュメント記載)は以下(記録日: 2026-07-16)。

| カテゴリ                                     | Dashboard の例示                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Authentication information(認証に関する情報) | passwords, credentials, security question, PIN                                                            |
| Web history(ウェブ履歴)                      | the list of web pages a user has visited, as well as associated data such as page title and time of visit |
| User activity(ユーザーのアクティビティ)      | network monitoring, clicks, mouse position, scroll, or keystroke logging                                  |

> **注意**: 上記はこのリポジトリの作業環境から `developer.chrome.com` に到達できなかったため、
> 既知の公式例示の記録である。**Store の申告を実際に変更する前に、Developer Dashboard 上の
> 最新の設問文を必ず確認し、相違があればこの表と判断を更新すること。**

## 保存データの分類一覧

プロファイル設定、監査ログ、分析データは端末内(ブラウザプロファイル内)に留まる。
設定したヘッダー値は、一致するTarget Originへの機能上のリクエストにだけ付与し、開発者、分析事業者、無関係な送信先へは送らない。
分析 SDK と外部計測基盤は存在しない(依存関係は `package.json` 参照)。
Chrome Web Storeへ提出するproduction buildでは、Feature Flagによってtrackingを無効にする。
分析イベントのメッセージ送信とコンソール出力は発生しない。
UUID v7の`client_id`はFeature Flagに関係なく生成し、`storage.local`へ保存する。
`pnpm dev`で起動する開発ビルドだけが、型付き分析イベントをService Workerの開発者コンソールへ出力する。
拡張機能自身が発行する分析用ネットワークリクエストは存在しない。

### 設定データ(ユーザーが明示的に入力したもの)

| データ                  | 保存先                         | 保持期間               | 目的                       | 外部送信 |
| ----------------------- | ------------------------------ | ---------------------- | -------------------------- | -------- |
| プロファイル名          | `storage.local` (`app-config`) | ユーザーが削除するまで | 設定の識別                 | なし     |
| Target Origins          | 同上                           | 同上                   | 対象オリジンの一致判定     | なし     |
| Fixed Headers(名前・値) | 同上                           | 同上                   | リクエストへのヘッダー付与 | なし     |
| Capture Header names    | 同上                           | 同上                   | キャプチャ対象の指定       | なし     |
| Excluded Paths          | 同上                           | 同上                   | 付与除外の指定             | なし     |

### 動作状態(機能提供に必要な現在状態)

| データ                                 | 保存先                            | 保持期間                                                                                                   | 目的                                                 | 外部送信                          |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Profile の enabled 状態                | `storage.local` (`app-config`)    | ユーザーが変更するまで                                                                                     | リレーの有効/無効                                    | なし                              |
| captured header values                 | `storage.session`(**メモリのみ**) | ブラウザ再起動・拡張機能の無効化/再読み込み/更新・プロファイル無効化・ルール変更・権限取消・手動クリアまで | 後続リクエストへの付与                               | 一致するTarget Originへの付与のみ |
| session phase / dnrRuleIds / lastError | 同上                              | 同上                                                                                                       | 状態表示と DNR 同期                                  | なし                              |
| createdAt / updatedAt                  | `storage.local` (`app-config`)    | 設定と同じ                                                                                                 | **設定の作成・更新日時。行動分析には一切使用しない** | なし                              |
| 分析用 `client_id` (UUID v7)           | `storage.local`                   | 拡張機能を削除するまで                                                                                     | 将来の分析イベントで使う安定した識別子               | なし                              |

### 分析イベント(開発者コンソールのみ)

開発ビルドでは、主要操作と画面表示を分析イベントとして Service Worker へ送る。
イベントは拡張機能のストレージへ保存せず、Service Worker の `console.log` だけに出力する。
Profile ID、Profile 名、URL、origin、パス、Header 名、Header 値、自由入力文字列はイベント型で禁止する。
Production buildではイベント送信とコンソール出力を実行しないが、`client_id`は生成する。

Google Analytics などへの外部送信を有効にするリリースでは、配信前に Privacy Policy と Dashboard の申告を更新する。

### 診断記録(監査ログ)

| データ                        | 保存先                                    | 保持期間                                      | 目的                                      | 外部送信 |
| ----------------------------- | ----------------------------------------- | --------------------------------------------- | ----------------------------------------- | -------- |
| 監査ログ(下記イベントのみ)    | IndexedDB (`header-relay` / `audit_logs`) | 最大1000件・最大7日(自動 prune)、手動全削除可 | 障害解析・機能デバッグ                    | なし     |
| 監査ログ表示用 URL キャッシュ | `storage.session`(**メモリのみ**)         | ブラウザ終了まで                              | 直近ログの URL 表示(origin+pathname のみ) | なし     |

リクエスト URL は **永続化しない**(Issue #55)。オリジン一致判定はメモリ上で行い、
IndexedDB・`storage.local` に URL / origin / pathname を書き込まないことを
自動テスト(`src/lib/storage/audit-db.test.ts`)で担保している。
ヘッダー **値** はいかなる監査ログにも書き込まない(Issue #58、
`src/lib/lifecycle/runtime-session.test.ts` / `src/lib/runtime/extension-commands.test.ts` で担保)。

## 監査ログイベントの分類(Issue #56)

| イベント                               | 分類                                                         | 判断               |
| -------------------------------------- | ------------------------------------------------------------ | ------------------ |
| `error`                                | 障害解析に必要                                               | 残す               |
| `dnr_rules_synced`                     | 障害解析に必要(DNR 同期結果)                                 | 残す               |
| `config_compiled`(コンフリクト時)      | 障害解析に必要                                               | 残す               |
| `session_cleared`                      | 障害解析に必要(**DNR 同期失敗時のみ記録**)                   | 失敗時のみ残す     |
| `origin_matched`(debug)                | 機能デバッグに必要(「なぜキャプチャされないか」の切り分け)   | 残す(URL は非永続) |
| `headers_captured`                     | 機能デバッグに必要(ヘッダー名のみ)                           | 残す               |
| `profile_enabled` / `profile_disabled` | 不要(現在状態から判断可能な操作履歴)                         | **削除済み**       |
| `profile_deleted`                      | 不要(操作履歴。削除したプロファイル名がログに残り続けるため) | **削除済み**       |
| `session_cleared`(成功時)              | 不要(操作履歴)                                               | **削除済み**       |
| `fixed_header_value_updated`           | 不要(操作履歴。現在の設定値と updatedAt で足りる)            | **削除済み**       |
| `session_phase_changed`                | 未使用だった                                                 | **型から削除済み** |

開発ビルドだけが、利用回数、主要操作、画面遷移に相当するイベントを端末内の開発者コンソールへ出力する。
Chrome Web Storeへ提出するproduction buildは出力しない。
滞在時間、マウス位置、スクロール、キー入力は記録しない。

## カテゴリ別の申告判断

### 認証に関する情報 — **申告を維持**

Capture Header はユーザー指定のレスポンスヘッダー値(開発用セッショントークン等)を
端末内の `storage.session` に保持するため、機能が認証用の値を扱える限り申告を維持する
(Issue #58)。値は拡張機能 UI 内でだけ平文表示し、監査ログへは不記録・ブラウザ再起動時に
破棄され、一致するTarget Originへのリクエスト以外には外部送信しない。

## 機密ヘッダー方針(Issue #58)

ヘッダー名はtrim・小文字化して大文字小文字を区別せず判定する。

- **警告して許可**: `Authorization`, `Cookie`, `X-Auth-Token`, `X-Access-Token`,
  `X-API-Key`, `Api-Key`
- **保存を拒否**: `Set-Cookie`, `Host`, `Content-Length`, `Connection`, `Keep-Alive`,
  `Proxy-Connection`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailer`,
  `Transfer-Encoding`, `Upgrade`

認証用途を一律禁止しない。`Cookie` は将来のCookie操作を可能にするため警告扱いとし、
ChromeのCookieストア・認証状態と競合し得ることをUIで明示する。拒否対象はレスポンス専用、
request authority、message framing、proxy / connection-specific semanticsに限定する。

### ウェブ履歴 — **未収集へ変更する**

v0.5.0 以降、閲覧した URL・origin・pathname を永続保存しない(Issue #55)。
Dashboard の例示「訪問したページの一覧と付随データ」に該当する保存は存在しなくなる。

**変更手順(順序厳守)**: URL を保存する旧バージョンが公開されている間は申告を変更しない。
本変更を含む v0.5.0 は Chrome Web Store の審査を通過し配信開始済みであることを確認した
(確認日: 2026-07-18)。旧バージョンを利用しているユーザーは残り得ないため、
今回の申請作業で Developer Dashboard の Privacy practices「ウェブ履歴」を
**収集あり → 未収集** へ変更する。

### ユーザーのアクティビティ — **申告を維持(推奨)**

判断根拠:

- Dashboard の例示に **network monitoring** が含まれる。本拡張は `webRequest.onHeadersReceived`
  で対象オリジンのレスポンスヘッダーを監視することが中核機能であり、端末内処理のみとはいえ
  例示に照らすと該当し得る。
- 開発ビルドだけが、主要操作と画面遷移を端末内の開発者コンソールへ出力する。
  Production buildは出力せず、どちらのビルドもマウス位置、スクロール、キー入力、自由入力値を記録しない。
- 設定データ(プロファイル等)や現在状態は「ユーザーのアクティビティ」とは性質が異なり、
  これらを根拠とした申告はしない。操作履歴イベントは削除済み(上記)。

よって「該当し得る実装(ネットワーク監視)が存在する」ことを根拠に申告を維持し、
Store の説明文では範囲を「ユーザーが選択した対象オリジンのみ・端末内処理のみ・productionで分析イベントなし」に
限定して実態より広く見えないようにする。

**再検討の条件**: Dashboard の最新設問が「収集」をデバイス外への送信・開発者による取得に
限定していることが確認できた場合、本拡張は該当しなくなるため未申告へ変更を再検討する。
その際は確認した設問文・確認日をこのドキュメントに追記すること。

## ホスト権限(Issue #57)

既定のローカル開発用途として `host_permissions` に `http://localhost/*` を含める。
`127.0.0.1` を含むその他のホストは `optional_host_permissions`(`http://*/*` /
`https://*/*`)とし、実際の付与は Target Origin の保存・Profile 有効化・
「アクセスを許可」ボタンというユーザー操作を起点に、対象ホスト単位で行う。

- Chrome の match pattern はポートを持てないため、付与単位は「スキーム+ホスト名」
  (そのホストの全ポート)
- localhostの必須権限があってもcapture / attachはユーザー設定のenabled Target Originに限定する
- その他の未許可 origin には DNR rule を生成しない(fail-closed)。webRequest イベントも
  ブラウザ側で配信されない
- 権限取消時は、取消originから取得した値を個別識別できないため、影響するProfileの
  captured valuesを全消去してからDNR ruleを再同期する
- どのプロファイルからも参照されなくなったホスト権限は、確認ダイアログ付きで解除を提案
- 権限理由の申告は「ユーザーが選択した origin に対してのみ要求」へ更新する(listing.md)

### リリース前の実機検証チェックリスト(Chrome 実機・必須)

自動テストでは既存ユーザーの更新時挙動を検証できないため、公開前に実機で確認する。

- [ ] 旧バージョン(`host_permissions: <all_urls>`)から新バージョンへ更新した際、
      既存の付与が維持されるか(維持されない場合、UI に「要許可」バッジと popup 警告が
      表示され、再許可で復旧できること)
- [ ] Target Origin 保存時に権限ダイアログが表示され、許可後にヘッダーが付与されること
- [ ] 拒否時に origin が保存され「要許可」表示になり、ルールが作られないこと
- [ ] `chrome://extensions` から権限を取り消すと DNR rule と該当Profileのcaptured valuesが消え、キャプチャが止まること
- [ ] localhostは追加ダイアログなし、IPv4 / IPv6 / その他のhostは許可後に動作すること
- [ ] Origin 削除時の権限解除確認が表示され、解除後に再追加→再許可できること
