# 行動分析イベントの設計

## 現在の送信範囲

`pnpm dev`で起動した開発ビルドだけがtrackingを有効にする。
Popup と管理画面は、型付きメッセージで分析イベントを Service Worker へ送る。
Service Worker は `client_id` と発生時刻を加え、GA4 Measurement Protocol 本文の上位構造に合わせた JSON を `console.log` へ出力する。
現在の実装は Google Analytics を含む外部サーバーへ分析データを送信しない。

`import.meta.env.PROD`が`true`になるproduction buildでは、trackingを無効にする。
UIクライアントは分析メッセージを送らず、Service Workerは分析イベントをコンソールへ出力しない。
UUID v7の`client_id`はFeature Flagに関係なく生成する。

## Feature Flag

Feature Flagは`src/lib/feature-flags.ts`で一度だけ解決する。
各クライアントがビルド環境を個別に解釈する実装は置かない。

| Flag                | `PROD=false` | `PROD=true` |
| ------------------- | ------------ | ----------- |
| `analyticsTracking` | `true`       | `false`     |

クライアント側の判定は不要なService Workerのwake-upを防ぐ。
Service Worker側の判定は、別のクライアントや古い画面からメッセージが届いた場合にもtrackingを停止する。

## モジュールの責務

- **イベント定義**：イベント名と許可するパラメータを closed union で定義する。
- **Feature Flag**：ビルド環境からtrackingの有効状態を決める。
- **クライアント**：Popup と管理画面から `trackAnalyticsEvent(event)` を呼ぶ。
- **メッセージハンドラー**：分析イベントを Service Worker のトラッカーへ渡す。
- **トラッカー**：`client_id` と `timestamp_micros` を付与し、出力処理を呼ぶ。
- **Client ID ストア**：UUID v7 を一度だけ生成し、`storage.local` の `analytics-client-id` に保存する。

UI クライアントが知るインターフェースは `trackAnalyticsEvent(event)` だけである。
将来の GA4 対応では Service Worker の出力処理だけを HTTP 送信へ差し替える。

## Client ID

Service Workerを初期化するとき、`client_id`をUUID v7として生成する。
`client_id` は拡張機能のインストール中に変化しない。
Service Worker の再起動後は `storage.local` の値を再利用する。
同時に複数のイベントを受けた場合も、一つの生成処理を共有して別々の ID を作らない。
Production buildでもIDを生成しておくため、将来trackingを有効化した場合に同じIDを利用できる。

UUID v7 の先頭 48 bit には生成時刻が含まれる。
GA4 の `client_id` に時系列ソートは必要ないが、今回の方針では UUID v7 を採用し、この時刻情報を新しい分析データとして扱わない。

## 記録するイベント

イベントは Profile ID、Profile 名、URL、origin、パス、Header 名、Header 値を受け取れない型にする。
件数、真偽値、定義済みの列挙値だけをパラメータとして許可する。

| イベント                     | 発生条件                             | パラメータ                          |
| ---------------------------- | ------------------------------------ | ----------------------------------- |
| `page_view`                  | Popup 表示、管理画面のセクション表示 | `surface`, `route`                  |
| `profile_selected`           | ManageまたはPopupから編集対象を開く  | `surface`                           |
| `profile_toggled`            | Profile の有効状態を変更             | `surface`, `enabled`                |
| `profile_created`            | Profile を作成                       | `surface`                           |
| `profile_deleted`            | Profile を削除                       | `surface`                           |
| `profile_section_saved`      | Profile のセクションを保存           | `surface`, `section`                |
| `fixed_header_value_updated` | Popup で Fixed Header 値を更新       | `surface`                           |
| `session_cleared`            | Captured Header 値を削除             | `surface`, `scope`                  |
| `host_permission_requested`  | Host permission を要求               | `requested_origin_count`, `outcome` |
| `url_probe_run`              | URL Probe を実行                     | 結果の件数と `allowed`              |
| `ui_density_changed`         | 表示密度を変更                       | `density`                           |
| `audit_logs_cleared`         | 監査ログを全削除                     | `surface`                           |
| `advanced_config_applied`    | Advanced JSON を適用                 | `surface`                           |
| `review_prompt`              | レビュー訴求の表示と応答             | `surface`, `action`                 |

Manageの`page_view.route`はProfile IDを除いた閉じた分類へ変換する。
`#/profiles/:profileId/headers`のようなURLは`headers`だけを送り、Profile ID、Profile名、URL自体は送らない。

## GA4 を有効にする条件

GA4 送信を有効にする変更では、次の作業を同じリリースに含める。

1. Service Worker の出力処理を Measurement Protocol の HTTPS POST へ差し替える。
2. `page_view` の論理 route を GA4 が要求する `page_title` と `page_location` へ変換する。
3. Realtime Report に必要な `session_id` と `engagement_time_msec` の生成規則を決める。
4. Measurement Protocol の debug endpoint で全イベントを検証する。
5. Privacy Policy と Chrome Web Store の Privacy practices を、外部送信するデータに合わせて更新する。
6. 利用者への告知、同意、無効化手段が必要かを配信地域と Store ポリシーに照らして判断する。

拡張機能へ埋め込む `api_secret` は配布物から取得できるため、一般的なサーバー秘密鍵と同じ機密性は持たない。
直接送信を採用する場合は専用のデータストリームを使い、悪用の監視と交換手順を用意する。

## 参考資料

- [Use Google Analytics 4](https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4)
