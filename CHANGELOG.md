# header-relay

## 0.10.1

### Patch Changes

- [#3](https://github.com/mktbsh/header-relay/pull/3) [`b5b53a5`](https://github.com/mktbsh/header-relay/commit/b5b53a5c1608b752778c6191338c16e1f0a64731) Thanks [@mktbsh](https://github.com/mktbsh)! - ビルドツールを WXT 0.21 に更新し、脆弱性が報告されていた依存パッケージを修正版に更新しました。

## 0.10.0

### Minor Changes

- ポップアップで現在のサイトに一致するプロファイルがないとき、プロファイルを選んでこのサイトのオリジンを対象オリジンへ追加できるようにしました。新しいプロファイルの作成後は対象オリジンのタブを開きます。

### Patch Changes

- JSON Editor で JSON を適用する前に、設定全体を置き換える確認を表示するようにしました。

- コンパイル警告・エラーを表示言語に合わせて表示し、プロファイルIDではなくプロファイル名で示すようにしました。概要画面で警告の件数だけでなく内容も確認できます。

- 管理画面の各行のスイッチと入力欄に、対象の名前を含むラベルを付けました。URLプローブと除外パスのテスターはEnterキーで実行できます。監査ログのレベルとイベントを読みやすい表記にし、追跡Cookieの一括クリアは確認してから実行します。

- 管理画面の保存完了メッセージを一定時間後とタブ移動時に消し、エラーは省略せず全文表示して閉じるボタンで消せるようにしました。

- 取得したヘッダー値を伏せ字にせず、管理画面とポップアップで平文表示するようにしました。コピー時には完了を表示します。

- 管理画面とポップアップのラベルを大文字表示しないようにし、各言語で「Profile/プロファイル」などの用語を統一しました。ヘッダー値・Cookie 値の入力欄の例示文を翻訳し、概要タブの説明文を実際の操作内容に合わせて見直しました。

## 0.9.1

### Patch Changes

- Target Originへ完全なHTTPまたはHTTPS URLを貼り付けたとき、originへ自動変換するようにしました。

## 0.9.0

### Minor Changes

- Profileの複製・並び替え、設定ファイルのエクスポート／インポート、全Profileを切り替えるキーボードショートカットを追加しました。

## 0.8.5

### Patch Changes

- 監査ログを深刻度の下限で絞り込み、直近 200 件より前の警告やエラーにも到達できるようにしました。

## 0.8.4

### Patch Changes

- Chrome Web Store で機能が伝わりやすいよう、拡張機能名に HTTP リクエストヘッダー変更とレスポンスヘッダー取得を明記しました。

- DNR ルールの URL マッチを大文字小文字を区別する設定に統一。除外パスの判定が DNR とランタイム評価(URL Probe)で食い違い、Probe が「ヘッダーが付く」と表示する URL で実際にはヘッダーが外れることがあった。

  あわせてキャプチャ対象のリソース種別に `other` を追加。ページの Service Worker を経由した `fetch` はこの種別になるため、ログイン応答のヘッダーや `Set-Cookie` を取り逃がしていた。

## 0.8.3

### Patch Changes

- 固定ヘッダーなどのヘッダー付与を全リソース種別へ拡大。これまでは `main_frame` / `sub_frame` / `xmlhttprequest` だけが対象で、HTML から読み込まれる JS・CSS・favicon にはヘッダーが付かず、認証が必要なオリジンでサブリソースだけ 403 になっていた。Cookie のキャプチャ対象は従来どおり 3 種別のまま(サブリソースの `Set-Cookie` は追跡しない)。

## 0.8.2

### Patch Changes

- Manage 画面を Profile 一覧と Main 内タブの構成へ変更し、Profile と Settings を直接開ける URL、Profile 作成 Modal、Popup からのリンクを追加しました。

## 0.8.1

### Patch Changes

- Chromium の Popup が高さ超過時に横幅 800px へ拡張される不具合を回避するため、内容を Popup 内でスクロールできるようにしました。

- Popup を現在のタブに一致する Profile と設定だけに絞り、Popup から固定ヘッダーの有効・無効を切り替えられるようにしました。

## 0.8.0

### Minor Changes

- 管理画面にレビュー訴求を追加。サイドバー下部に Chrome ウェブストアのレビューリンクとご意見フォームへのリンクを常設し、その上に満足度を尋ねるカードを表示する。「はい」ならストアのレビュー、「いまひとつ」ならフィードバックフォームへ誘導し、「後で」を選ぶと 30 日後まで表示しない。

### Patch Changes

- 依存関係を更新

- 各種 Web サイトリンクを更新

## 0.7.2

### Patch Changes

- manage 画面のリファクタリング: audit log・URL probe ロジックをカスタムフックに抽出、addX 関数をルーター側にインライン化。Popup CSS クラスを共通 hr-\*クラスに統一し、popup 固有のサイズオーバーライドのみ残す形で CSS 重複を削減。

## 0.7.1

### Patch Changes

- バックグラウンドのパフォーマンスを改善。マッチした HTTP レスポンスごとに無条件で実行していた DNR ルールリビルド・ストレージ読み書きを、実際に値が変わった時だけに限定。RegExp キャッシュの追加とセッションストアへのインメモリキャッシュ導入により、高トラフィックオリジンでの CPU・I/O 負荷を大幅に削減。

## 0.7.0

### Minor Changes

- Profile に固定 Cookie と追跡 Cookie を追加できるようになりました。対象オリジンのレスポンスに含まれる`Set-Cookie`から登録済み Cookie の値を自動取得し、次回以降の対象リクエストで`Cookie`ヘッダーを完全に置き換えます。送信候補が 0 件のリクエストでは Chrome が生成した`Cookie`をそのまま通します。

  固定/追跡 Cookie 名の登録、`Max-Age`と`Expires`による削除判定、複数 Profile の決定的な統合順、同名 Cookie 競合時の DNR Session Ruleset 停止、URL Probe への最終`Cookie`値表示を含みます。Fixed Header `Cookie` は自動的に専用の固定 Cookie へ変換され、変換不能設定は移行時の問題として保持されます (`schemaVersion` 4→5)。監査ログには Cookie 名と処理結果のみを記録し、値と元の`Set-Cookie`は記録しません。`cookies`権限は追加していません。

- 管理画面のプロファイル切替・新規作成とナビゲーションを整理し、ヘッダー設定の統合画面と URL プローブ・監査ログ・JSON 編集の高度な設定タブを追加しました。移行時の問題は必要な場合だけ Cookie 画面に表示します。

### Patch Changes

- Cookie 機能: Excluded Path 時の FR-13/FR-14 違反を修正。単一 Profile が唯一の寄与元で Excluded Path を持つ origin では、DNR の SET 非可逆性と RE2 の否定 path 非対応により Chrome 既存 Cookie を復元できないため、その origin の Cookie Rule を全て省略し Runtime Status/URL Probe へ`cookie-exclusion-cannot-preserve` warning を表示する(非除外パスの Cookie 送信機能は失うが、除外パスで Chrome 既存 Cookie を勝手に上書きしない挙動を優先)。併せて Popup select option の`name=value`形式を`value`単体へ正規化する移行時の欠落、および`compile-config.ts`内の NUL バイト区切り文字(git diff/grep を壊す)を修正。

- Ticket 06: DNR 同期エラーの型細分化。`syncDnrRules` の戻り値を `{ status: 'ok' | 'stale-ok' | 'stale-failed', error?, unremovedRuleIds? }` の typed union に変更。原子的更新の失敗時、削除すべき owned rule (surplus) がある場合は remove-only 更新を一度自動再試行する。再試行も失敗した場合は `stale-failed` を返し、`Runtime Status` に「古いルールが送信され続けている可能性」を表示する。Popup に stale-ok / stale-failed のインライン警告を追加(全 8 ロケール反映)。

## 0.6.0

### Minor Changes

- UI の対応言語にスペイン語・フランス語・ドイツ語・簡体字中国語・繁体字中国語を追加

### Patch Changes

- Popup の設定ボタンの遷移先を `manage.html#/settings` から `manage.html#/`(Profile 概要)に変更。ユーザが Popup から manage を開く目的は主に Profile 操作であり、UI 設定ではないため。

## 0.5.0

### Minor Changes

- 監査ログにリクエスト URL を永続化しないように変更。URL はオリジン一致判定のためメモリ上でのみ処理し、直近ログへの表示用に現在のブラウザセッション中だけ session storage（メモリのみ）へ保持、ブラウザ終了時に破棄する。アップグレード時には IndexedDB の監査ログストアを再作成し、旧バージョンが保存した URL 入りログを完全に削除する。

- Profile を削除できるようにし、UI にコンパクト表示モードを追加した。

  - 管理画面のプロファイル一覧から各プロファイルを削除できるようにした（プロファイルが 1 つだけのときは削除ボタンを表示しない）。削除すると取得済みの値も破棄し、選択中プロファイルを削除した場合は先頭のプロファイルへ切り替える。
  - 管理画面の Settings セクションに「コンパクト表示」トグルを追加した。設定は `uiDensity` として保存され、Popup・管理画面の行やコントロールの余白を詰めて表示する。表示のみの設定で、適用されるヘッダーには影響しない。

- manage.html をブラウザの拡張機能オプションページ (options_ui) として開けるようにした。Profile 管理を既定表示とし、拡張機能全体の設定は同じ画面のサイドバーから開ける。

- キャプチャしたヘッダー値を管理画面でデフォルトマスク表示に変更し、「表示」「コピー」の明示的な操作を追加。あわせて、Popup からの固定ヘッダー値更新時に監査ログへ新旧の値が記録されていた問題を修正し、ヘッダー値が監査ログへ混入しないことをテストで保証するようにした。

- 監査ログを障害解析に必要な診断イベントのみに最小化。ユーザー操作履歴にあたる `profile_enabled` / `profile_disabled` / `fixed_header_value_updated` と成功時の `session_cleared` を記録しないように変更(`session_cleared` は DNR 同期失敗時のみ warn として記録)。あわせて保存データの分類と Chrome Web Store プライバシー申告の判断根拠を `docs/chrome-web-store/privacy-declaration.md` に記録した。

- ホスト権限を `optional_host_permissions` へ移行。インストール時に全サイトへのアクセス権限(`<all_urls>`)を要求せず、Target Origin の保存・Profile の有効化・「アクセスを許可」ボタンの操作時に、対象ホストへの権限だけを要求するように変更。未許可のオリジンには DNR ルールを生成せず(fail-closed)、権限の付与・取消を検知してルールを自動再同期する。管理画面にはオリジンごとの権限状態(許可済み / 要許可 / 非対応)と許可ボタンを表示し、Popup には要許可オリジンの警告を表示する。どのプロファイルからも使われなくなったホスト権限は確認付きで解除を提案する。

- 機密ヘッダーに警告と安全な禁止ルールを追加し、取得値のセッション限定保持・削除タイミングを明確化しました。ホスト権限取消時は影響するプロファイルの取得値を自動消去します。

### Patch Changes

- localhost の HTTP 通信を追加の権限許可なしで扱えるようにする

- UUID v7 の client_id をローカルに生成し、開発ビルドに限って Popup と管理画面の行動分析イベントを Service Worker のコンソールへ出力する基盤を追加した。

- Compact 表示を管理画面サイドバーの Settings セクションに集約し、Popup と管理画面ヘッダーを簡潔にするとともにトグルを小型化しました。サイドバー下部から Homepage と Buy Me a Coffee も開けます。

## 0.4.0

### Minor Changes

- 複数の Profile を同時に有効化できるようにしました。

  - Profile の「選択(管理画面で編集中)」と「有効化(ブラウザへ適用)」を分離しました。管理画面の Profile 一覧では、行の選択と有効化トグルが別の操作になります。トグルは即時反映されます。
  - 有効な Profile 群をコンパイルし、単一の DNR Session Ruleset として適用します。DNR 生成・URL Probe・Runtime Status は同じコンパイル結果を参照するため、Probe の表示と実際の挙動が一致します。
  - Captured Header と Session を Profile 単位で保持するようになりました。ある Profile を無効化・保存しても、他の Profile の取得済みヘッダーは保持されます。
  - 同一 Origin・同一 Header Name を複数の有効 Profile が付与する場合は競合として検出し、DNR ルールを適用せずにエラーを表示します(fixed/captured の組み合わせを問いません)。
  - URL Probe は一致した全ての有効 Profile と、最終的に付与されるヘッダーを表示します。Overview に有効 Profile 数・DNR ルール総数・コンパイルエラー/警告の Runtime Status を追加しました。
  - popup は全 Profile の一覧とトグル、有効 Profile 全体の固定ヘッダー・取得値を表示します。
  - 既存設定は自動で移行されます(`activeProfileId` → `selectedProfileId`)。各 Profile の enabled 値はそのまま維持されます。

- Popup から、現在のタブに適用される固定ヘッダーの値を変更できるようにしました。管理画面の固定ヘッダー設定に「ポップアップに表示」を追加し、入力形式（テキスト / 選択肢）と選択肢の Label・Value・並び順を設定できます。公開したヘッダーだけが Popup に表示され、既存の固定ヘッダーは初期状態で非表示のままです。値の変更は対象ヘッダーのみを部分更新し、Compiler と DNR 同期を経て即時反映されます。

## 0.3.0

### Minor Changes

- 除外パスのマッチングを前方一致から glob(全体一致)に変更。`*` は同一パスセグメント内、`**` はセグメントを跨ぐ任意、`?` は 1 文字に一致し、パターンは pathname 全体に一致する(配下すべてを対象にするには `/assets/**` のように指定)。DNR ルールの regexFilter も同じ glob セマンティクスで生成する。あわせて除外パステスターが無効化中のプロファイルでも対象オリジン・除外判定を評価できるよう修正。

  また、プロファイル名の編集中にサイドバーの表示名が即時変更されていた挙動を修正し、保存後に反映されるようにした。

- manage 画面ヘッダーを簡素化: プロファイル名・有効/無効バッジ・未保存バッジを削除し、保存ボタンを未保存時に filled スタイルへ変更。プライバシーリンクをサイドバー最下部へ移動。バッジ CSS のカラーバリアントにベーススタイルが欠落していた問題も修正。

- 依存関係を更新

- 管理画面の保存状態をセクション単位に分離。対象オリジン・固定ヘッダー・取得ヘッダー・除外パス・プロファイル基本情報の各セクションが独立した未保存状態と保存ボタンを持つようになり、変更したセクションだけを個別に保存できる。保存時は該当セクションのみをストレージへ書き込み、DNR ルールを再構築する。ヘッダーのグローバル保存ボタンと「未保存の変更」表示は廃止した。

## 0.2.0

### Minor Changes

- 管理画面の情報設計と Application Shell を再構成し、未保存 Draft の URL プローブ、除外パスの共有検証と判定テスター、監査ログ展開状態の保持、空の初期設定、未保存変更の保護を追加しました。

- Options（manage）ページを iOS-style デザインシステムに統一。デザイントークンを `.hr-theme` クラスに昇格し、popup と manage で共有化。Dark mode・Accessibility 対応。

- 管理画面にセクション単位の URL ルーティングを導入し、直接表示やブラウザの戻る・進む操作に対応しました。

- i18n 対応を追加(デフォルト: 英語、日本語・韓国語をサポート)。UI 文字列と manifest を browser.i18n(`_locales`)で多言語化

### Patch Changes

- changesets によるリリースフロー(バージョン管理・タグ作成・GitHub Release への拡張機能 zip 添付)を導入

- Popup UI をコンパクト化（幅 480px、行高さ 36px、セクション間余白縮小）し、セクション構成を Fixed Headers / Captured Headers に再編

- プライバシーポリシーページを拡張機能内から外部サイト（hsblabs.github.io）へのリンクに変更。UI の言語設定（ja/ko/その他）に応じて対応する言語ページへ遷移する。
