---
title: Header Relayの用語
updated_at: 2026-08-14
updated_by: codex-gpt-5
---

# Header Relay

Header Relayは、指定した送信先へ開発用のリクエストヘッダーを付与し、後続リクエストで使う値をレスポンスから追跡するChrome拡張機能である。

## Language

**Profile**：
一緒に有効化される送信先、除外パス、固定値、追跡対象のまとまり。
_Avoid_：設定セット、環境、Rule、Flow

**Enabled Profile**：
ブラウザへ適用する候補としてRuntimeのコンパイルへ参加するProfile。
_Avoid_：Active Profile

**Matching Profile**：
対象URLがTarget OriginとExcluded Pathの条件に一致するProfileであり、enabledかどうかは問わない。
_Avoid_：Active Profile

**Viewed Profile**：
Manage画面が現在表示しているProfileであり、Runtimeの適用対象を決めない一時的な閲覧状態。
_Avoid_：Selected Profile、Active Profile

**Target Origin**：
Profileがリクエストの送信とレスポンスの追跡を行うscheme、host、portの組み合わせ。
_Avoid_：URL、ドメイン

**Excluded Path**：
Target Origin内で、そのProfileによる送信と追跡を止めるpath glob。
_Avoid_：除外URL、prefix

**Fixed Header**：
Profileへ保存した名前と値をそのまま送る一般リクエストヘッダー。
_Avoid_：Static Header

**Captured Header**：
登録した一般レスポンスヘッダーの値を追跡し、同名のリクエストヘッダーとして送る設定。
_Avoid_：Tracked Header

**Fixed Cookie**：
Profileへ名前と値を保存し、対象リクエストの`Cookie`ヘッダーへ含めるCookie。
_Avoid_：Cookie Header、Static Cookie

**Tracked Cookie**：
登録したCookie名について`Set-Cookie`から値を追跡し、対象リクエストの`Cookie`ヘッダーへ含める設定。
_Avoid_：Captured Cookie、Browser Cookie

**Tracked Cookie Value**：
Tracked Cookieが現在のブラウザセッション中に最後に取得した値。
_Avoid_：Stored Cookie、Chrome Cookie

**送信候補**：
対象リクエストについて、Profile、Target Origin、Excluded Path、現在の追跡値から送信対象に決まったFixed CookieまたはTracked Cookie。
_Avoid_：Active Cookie、有効Cookie

**Migration Issue**：
旧Cookieヘッダー設定を損失なく専用Cookieへ変換できず、送信対象から外したまま利用者の修正を待つ設定。
_Avoid_：Migration Error、Invalid Cookie

**Profile Order**：
Config内のProfile配列順。Manageの表示順であると同時に、複数のEnabled ProfileをRuntimeが評価・Cookieを連結する順序でもある。
_Avoid_：表示順だけの順序

**Configuration Export**：
AppConfig全体をJSONファイルへ持ち出す操作。Runtime Sessionの追跡値は含まない。
_Avoid_：Session Export、Audit Export

**Redacted Configuration Export**：
利用者が秘密値を含めると明示しない場合に、Fixed Header、Fixed Cookie、および移行問題に残る値を空にしたConfiguration Export。
_Avoid_：Masked Session

**Paused Profile Set**：
全Profileを停止する直前にEnabledだったProfile IDの集合。現在のブラウザセッション中だけ保持し、全Profile停止からの復元に使う。
_Avoid_：Active Profile、Saved Profile Selection
