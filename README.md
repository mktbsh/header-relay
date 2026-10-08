# Header Relay

API開発・検証向けのChrome拡張です。レスポンスヘッダーから値を保持し、以降の対象APIリクエストへ固定ヘッダーまたは保持済みヘッダーとして付与する挙動をブラウザ上で再現します。

## Stack

- WXT
- TypeScript
- Solid
- Tailwind CSS
- Chrome MV3
- declarativeNetRequest
- webRequest
- IndexedDB

## Toolchain

Node 26.4.0 / pnpm 11 を前提にしています。ローカルのバージョンは `mise.toml`、CIのpnpmは `pnpm/action-setup` で管理し、`lint` / `compile` / `test` / `build` を検証します。

- mise利用時: `mise install`
- pnpm未導入時: `mise install pnpm`

## Install

```bash
pnpm install
```

## Dev

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Zip

```bash
pnpm zip
```

## Release

リリースは changesets で管理しています。リリースノートに載せたい変更を含むPRでは `pnpm changeset` でchangesetを作成してコミットしてください。mainへのマージ後、自動作成される「chore: release」PRをマージすると、タグ・GitHub Release・拡張機能zipの添付まで自動で行われます。

詳細は `docs/release.md` を参照してください。

## Chrome Web Store Release Prep

Chrome Web Store提出用の文面と画像素材は `docs/chrome-web-store/` に置いています。

```bash
pnpm store:assets
pnpm zip
```

- `docs/chrome-web-store/listing.md`: ストア掲載文、Privacyタブ、権限説明
- `docs/chrome-web-store/test-instructions.md`: 審査担当者向けテスト手順
- `docs/chrome-web-store/assets/`: store icon、screenshots、promo tile

## Runtime Model

Profileは独立して有効化できる設定モジュールです。RouteやFlow Ruleではなく、origin単位のヘッダーリレーに寄せています。複数Profileを同時にenabledにでき、有効なProfile群をコンパイルして単一のDNR Session Rulesetへ反映します。

- Target Origin: header relayを許可するorigin
- Fixed Header: 常にリクエストへ付与するヘッダー
- Captured Header: レスポンスから値を保持し、次回以降のリクエストへ付与するヘッダー名
- Excluded Path: 対象origin内でもrelay-managed headersを外すpath prefix
- Session: captured header valuesと現在のcapture state（Profile単位で独立、`storage.session` にのみ保持）

Profileの表示順はRuntimeの評価順でもあります。Sidebarから上下移動でき、複製したProfileは無効状態で元の直後に追加されます（名前は`Copy of {original_name}`）。

管理画面で表示するProfileは`manage.html#/profiles/:profileId/*`のURLから決まります。表示中のProfileと、Runtimeへ実際に適用される`profile.enabled`は別物です。画面遷移はRuntimeの挙動に影響しません。

有効Profile群とProfile別Sessionは `src/lib/compiler/compile-config.ts` の `compileConfig()` が中間表現 `CompiledConfig` へ変換します。DNR rule生成、URL Probe、Runtime Statusはすべてこの結果だけを入力とし、競合判定や除外判定を個別に再実装しません。

Header planの解決（fixed優先など）は `src/lib/header-emulation/core.ts` に集約しています。

### browser 依存の切り分け

実行時にbrowserへ触るのは `StoragePort` / `DnrPort` / `AuditPort` の3つだけです（`src/lib/ports.ts`）。
`createHeaderRelay()`（`src/lib/header-relay.ts`）が拡張全体を組み立て、production は
`src/lib/lifecycle/engine.ts` がbrowser adapterを渡します。

テストや動作確認では `createTestRuntime()`（`src/lib/testing/test-runtime.ts`）にin-memory adapterを
渡すことで、拡張全体をheadlessに駆動できます。設定投入 → 偽レスポンス → 実際に適用されたrulesetへの
assertが、module mockなしで書けます。

ただしin-memory DnrPortはChromeのDNRを再現しません。確認できるのは「意図したrulesetを適用できたか」
までで、ruleset自体の意味論は `probe-parity.test.ts`、実挙動はe2e / 実ブラウザが担当します。

## Header Flow

1. リクエストURLに一致するenabled Profileを全て評価する。
2. レスポンス受信時、一致した各ProfileごとにenabledなCaptured Header名に一致する値をそのProfileのSessionへ保存する。
3. 全Session更新後、有効Profile群をコンパイルし直し、単一のDNR session rulesetへ同期する。
4. 次回以降の対象originへのリクエストで、Fixed HeaderとCaptured Header valueをrequest headerとして付与する。
5. Excluded Pathに一致するリクエストでは、そのProfileが付与するheaderだけをremove ruleで外す。

Fixed HeaderとCaptured Headerが同じ名前の場合、同一Profile内ではFixed Headerを優先します。Captured Header valueは、そのProfileのSessionに保存された値だけを使用します。

### Conflict

同一Origin・同一Header Nameを複数のenabled Profileが付与する場合は競合とし、コンパイルエラーにします（fixed/captured の組み合わせを問わない）。Priorityによる自動解決は行いません。競合中はDNR ruleを一切適用せず（owned ruleを全削除）、Runtime StatusとUIにエラーを表示します。どちらかのProfileをdisabledにすると復旧します。

## UI

管理画面のSidebarはProfile一覧、レビュー案内、Settings、外部リンクで構成します。各Profile行の名前から編集対象を切り替え、enabledスイッチはその場で即時保存します。作成ボタンは名前と初期enabled状態を指定するModalを開き、同名Profileは大文字・小文字とUnicode互換文字を同一視して拒否します。Profile削除はOverviewに配置します。

MainではProfile名の下にOverview、Target Origins、Headers、Excluded Paths、Cookies、URL Probeのタブを表示します。拡張機能全体のGeneral、Audit Logs、JSON EditorはSettingsのタブに分離します。ProfileとタブはURLで直接開け、Profile切替時は同じProfileタブと未保存draftを維持します。移行時の問題は存在する場合だけCookiesに表示します。

Settings › JSON Editorでは設定全体をJSONファイルへエクスポート／インポートできます。エクスポートは既定でFixed Header・Fixed Cookie・Popup選択肢・移行元値を空にし、秘密の値を含めるチェックを明示的に有効にした場合だけ値を含めます。空のFixed Cookieは無効化して書き出し、インポートは検証後に既存設定全体を置き換えます。

Overviewでは選択中Profileの状態に加えて、Runtime Status（Enabled Profiles / Total DNR Session Rules / Compile Errors / Compile Warnings）を確認できます。ProfileタブのURL Probeは選択中Profileだけでなく、一致した全enabled Profileと最終的なEffective Headersを表示します。

Audit Logsは深刻度の下限で表示を絞り込めます。選択は保存せず、画面を開き直すと「すべて」に戻ります。ログは直近1000件かつ7日以内のみ保持し、超過分は自動でpruneされます。リクエストURLは永続化しません。URLはorigin一致判定のためメモリ上でのみ処理され、直近ログへの表示用に現在のブラウザセッション中だけsession storage（メモリのみ・query string / fragment除去済み）に保持し、ブラウザ終了時に破棄されます。Audit Logsセクションの「Clear logs」で全削除できます。

popupでは現在のタブURLに一致するProfileのenabledトグルとsession state、enabled Profile全体のfixed header `name: value`、captured valuesを確認できます。Profile名から該当ProfileのOverview、Settingsボタンから拡張機能全体のSettingsを直接開けます。

キーボードショートカット`Toggle all profiles`はChromeのショートカット設定から割り当てます。実行時は有効Profileを一括停止し、同じブラウザセッション中に元の有効Profileだけを復元します。停止中はActionバッジに`OFF`を表示します。

captured header valuesは管理画面のUIでデフォルトでマスク表示され、「表示」「コピー」の明示的な操作でのみ実値にアクセスできます。値はメモリ上の `storage.session` にだけ保存され、ブラウザ再起動、拡張機能の無効化・再読み込み・更新、Profile無効化、ルール変更、ホスト権限取消、手動クリア時に消去されます。監査ログには記録されず、一致するTarget Originへのリクエスト以外へ外部送信しません。

`pnpm dev`では、Popupと管理画面の主要操作が型付き分析イベントとしてService Workerへ送られます。
Service Workerはローカルに保持したUUID v7の`client_id`を付け、`console.log`へ出力するだけで外部送信しません。
Production buildではFeature Flagによって分析メッセージ送信とコンソール出力を無効にします。
UUID v7の`client_id`はすべてのビルドで生成し、将来trackingを有効化した場合も同じIDを利用します。
イベント設計と将来のGA4有効化条件は`docs/analytics.md`を参照してください。

Privacy Policyは拡張内の `privacy.html` で確認できます。popupまたは管理画面のPrivacyボタンから開けます。

## Security Model

既定のローカル開発用途として `host_permissions` に `http://localhost/*` を含めます。Chromeのmatch patternはポートを指定できないため、localhostの全ポートが対象です。`127.0.0.1` を含むその他のホストは `optional_host_permissions`(`http://*/*` / `https://*/*`)のままで、Target Originの保存・Profileの有効化・行ごとの「アクセスを許可」ボタン(いずれもユーザー操作)を起点に、対象ホストへの権限だけを `permissions.request()` で要求します。未許可のoriginにはDNR ruleを生成せず(fail-closed)、webRequestイベントも届きません。optional権限がChrome設定から取り消された場合は `permissions.onRemoved` で検知し、該当Profileのcaptured valuesを消去してruleを再同期します。capture/attach/DNR rule生成は、権限があり、かつenabledなProfileのTarget Originに一致するURLだけに制限されます。

### Header Policy

ヘッダー名はtrim・小文字化して判定します。認証用途を一律禁止せず、`Authorization`、`Cookie`、`X-Auth-Token`、`X-Access-Token`、`X-API-Key`、`Api-Key` はUIで警告したうえで利用できます。`Cookie` は将来のCookie操作を妨げないため許可しますが、ChromeのCookieストア・認証状態と競合し得ることを明示します。

HTTPメッセージを安全に中継できない次の名前は、Fixed Header / Captured Headerのどちらでも保存を拒否します。

- `Set-Cookie`（レスポンス専用）
- `Host`（リクエスト先authority）
- `Content-Length`（message framing）
- `Connection`, `Keep-Alive`, `Proxy-Connection`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`（proxy / connection-specific semantics）

なお、E2E・visual review用ビルド(`HR_E2E=1`)のみ従来どおり `host_permissions: ["<all_urls>"]` を使います(Playwrightから権限ダイアログを操作できないため)。ストア配布物には含まれません。

- enabledなProfileが1つもなければ動作しません
- Target Originに一致しないURLではcapture/attachしません
- Excluded Pathではrelay-managed headersを外します
- DNR ruleは拡張が管理するsession rule ID範囲だけを更新します

## Default Profile

初期Profileは `http://localhost:3000` と `http://127.0.0.1:3000` をTarget Originとして持ち、ヘッダーや除外パスは空の状態で作成されます。

- Target Origin: `http://localhost:3000`, `http://127.0.0.1:3000`

必要に応じて管理画面の各セクションから設定を追加してください。

## License

[MIT](LICENSE)
