---
title: Cookieリクエストヘッダー機能のDNR Rule合成戦略
date: 2026-07-21
status: accepted
agent_model: claude-opus-4-7
amended_at: 2026-07-22
amended_by: claude-opus-4-7
---

# 改訂履歴

- 2026-07-22: 実装確定に合わせて決定4/6/7を差し替え。partition方式(`cookie-path-partition.ts`)は初回リリースでは実装せず、
  「base priority 200 + per-glob override priority 300」の単純方式に単一Profile除外時の安全fallbackを併用する。
  owned Rule ID範囲は `COOKIE_SET_BASE = 100_000` / `RANGE = 29_000`(100,000〜128,999)。

# 背景

Cookieリクエストヘッダー機能は、Chromeが生成した`Cookie`を送信候補がある時だけHeader Relayの値へ完全に置き換え、候補0件の時はChrome既存値をそのまま通す必要がある(spec FR-13、AC-24)。
一方DNRの`modifyHeaders`は次の制約を持つ(Chrome declarativeNetRequest API仕様)。

- 同一拡張機能で高優先度の`set`が適用されると、低優先度の`set`は無視される。同名Headerに対する低優先度のappendだけが後段で追加可能。
- 一度Header Relayが`set`または`remove`したCookieは、Chromeが生成した既存値へ戻せない。
- Rule Conditionには「URLが正規表現に一致しない」表現がない。
- 正規表現Ruleは1000件、Session Rule全体は5000件、コンパイル後の正規表現は1件2KBまで。

一般ヘッダーはProfileごとに別Headerを付けるため、Excluded Path上でそのProfileだけを`remove`できた。
Cookieは複数Profileの値を1本の`Cookie`Headerへ統合するため、同じ方法でHeader全体を`remove`すると別ProfileのCookieまで消える。

# 決定

1. Cookieは`Target Origin単位で、URL領域ごとに最終値を一度だけ`set`する`。
   - Profileごとに個別Ruleを出さない。合流点をコンパイラーへ集約する。
   - `modifyHeaders`のoperationは`set`のみを使う。Cookieに対する`append`と`remove`は使わない。
2. URL領域はTarget Origin単位で「origin全体」と「Excluded Path glob別」の2階層で扱う。
   - 全Profileの候補を統合したbase値を`priority: 200`でorigin全体に一度だけ`set`する。
   - 有効な各Excluded Path globについて、そのglobを除外しないProfileだけを合成したreduced値を`priority: 300`でglobに一致するURLへ`set`する。base値と等しい場合はoverrideを省略する。
   - **単一Profile除外時の安全fallback**: origin上のcontributing Profileが1つで、そのProfileがExcluded Pathを持ちreduced値が0候補になる場合、DNRのSETは非可逆でRE2に否定path matcherがないためChrome既存Cookieを復元できない。この場合はそのoriginのCookie Ruleを**全て省略**し、`cookie-exclusion-cannot-preserve` warningをRuntime StatusとURL Probeへ返す。FR-13/FR-14を守る代わりに、非除外パスのCookie送信機能を失う。
   - 合成結果が0候補のoriginではRuleを一切生成しない(FR-13、AC-24)。
3. partition方式(path globの完全な集合演算 → 一意正規表現)は初回リリースでは実装しない。
   - `src/lib/dnr/cookie-path-partition.ts`は未作成(=フォローアップ)。
   - 現方式は「複数Profile + 一方のみ除外」(AC-10)と「単一Profile + 除外(=fallback)」(AC-23の除外部分)を扱えるが、「単一Profileで非除外パスにも送りたい」ケースは失う。将来partition moduleを追加した時点で本ADRを再改訂する。
   - Excluded Path globは`*`(1 segment内0文字以上)、`**`(`/`を含む0文字以上)、`?`(`/`以外1文字)のみを解釈する。生成正規表現は`isRegexSupported()`へ渡して事前検証する(既存の`createDnrExcludedPathRegex`を再利用)。
4. DNRのRule priorityはCookie専用に独立範囲を持たせる。
   - Cookie base `set`は`priority: 200`、per-glob override `set`は`priority: 300`(一般Headerの`SET_PRIORITY=1`、`REMOVE_PRIORITY=100`と衝突しない)。
   - 同一origin上で複数のglobが同一URLに重複一致した場合、両override(priority 300)が同時発火し勝者が非決定的になる既知の未対応ケース(**フォローアップ**)。当面は単一glob overrideの一般ケースのみ正しく扱える。
5. DNRヘッダー名は小文字の`cookie`へ固定する(append allowlist準拠)。
   - `Set-Cookie`はレスポンス側で受信するのみで、DNR書き換えの対象にしない。
6. Cookie Ruleの意味的識別子は`(profileIdSet, originId, urlRegionKey, cookieNames)`から生成する。
   - Cookie値の変更ではID不変(remove→addの二重更新を避ける)。
   - Cookie名または送信範囲の縮小でID廃止(mustRemove対象)。
   - 意味的識別子からowned Rule ID空間へ決定的に割り当てる(既存`rule-id.ts`と同じ方式)。
7. Rule数と正規表現の上限は事前検査で失敗させる。
   - 更新後のRule数 = 既存non-owned Session Rule数 + 一般Header Rule数 + Cookie Rule数 - 同じ更新で削除される既存owned Rule数。
   - 1000正規表現Rule上限、5000 Session Rule上限、2KB正規表現上限を`updateSessionRules()`呼び出し前に検査。
   - 超過時は型付きエラーとしてRuntime StatusとURL Probeへ表示し、部分適用しない。
8. 大小文字を区別するpathは`isUrlFilterCaseSensitive: true`を明示する。
   - 既存のExcluded Pathと整合するよう、pathを含む全Cookie RuleにはtrueをsetしURL Probeも同じ判定を行う。
9. 非ASCIIのExcluded Pathは、UTF-8 percent-encodedへ保存時に正規化する。
   - URLと同一エンコーディングで比較するため。実ブラウザで区別できないケース(復号後大小文字違いなど)は入力エラーとして拒否する。

# 却下した案

- **案 A: Profileごとに`set`と`append`を組み合わせる。**
  複数Profileが同名Cookieを持たない前提でしか成立せず、高優先度の`set`が他Profileの`set`を全て潰す。partitionの合成ができない。
- **案 B: 高優先度の`remove`で除外Pathを扱う。**
  Chromeが生成した既存値を復元できないため、Excluded PathでChromeの`Cookie`をそのまま通すAC-23、AC-24を満たせない。
- **案 C: 除外Pathを負の正規表現(lookaround)で表現する。**
  RE2非対応で`isRegexSupported()`が失敗する。
- **案 D: Cookie値の変更ごとにRule IDを更新する。**
  同期のたびにDNRが原子的にremove+addを行い、その間短時間だけCookieが消える。値だけの変更でID不変にする。

# 実装への影響

- `src/lib/domain/types.ts`にCookie設定(`FixedCookie`、`TrackedCookie`、`TrackedCookieValue`、`MigrationIssue`)を追加。
- `src/lib/domain/cookie-policy.ts`を新設しRFC 6265bisに沿った検証を集約(Cookie名の大小文字保持、値の検証)。
- `src/lib/cookie-emulation/core.ts`を新設し、`Set-Cookie`解析、Session State更新、送信候補作成を担う。
- `src/lib/compiler/compile-config.ts`にCookie partition結果を含める。既存の一般Header責務と直交させる。
- `src/lib/dnr/cookie-path-partition.ts`は未作成(フォローアップ、決定3参照)。
- `src/lib/dnr/header-rule-builder.ts`にCookie Rule生成(`set`、base priority 200 / override priority 300、`isUrlFilterCaseSensitive: true`)を追加。
- `src/lib/dnr/rule-id.ts`にCookie owned range(`COOKIE_SET_BASE=100_000`、`RANGE=29_000` → 100,000〜128,999)を追加。既存owned range(10,000〜99,999)と衝突しないため`OWNED_MAX`は`129_999`へ拡張。
- `src/lib/dnr/rule-sync.ts`に事前上限検査を追加し、超過時は型付きエラーへ変換。

# 非ASCII pathと上限到達時の扱い

- 非ASCIIは保存時にUTF-8 percent-encodedへ変換。復号後に大小文字違いのみが残る場合(例: `/A`と`/a`)は入力エラー。
- Rule数、正規表現長、`isRegexSupported()`失敗は`CookieRuleLimitError`型として`syncDnrRules()`から返し、Runtime StatusとURL Probeへ表示。部分適用は行わず、直前に成功したRulesetを維持する(FR-24)。

# フォローアップ

- `e2e/cookie-dnr-capability.spec.ts`で下記4条件を実Chromiumで再検証(未実施)。
  1. 候補ありのURLでChrome既存Cookieが残らずHeader RelayのCookieだけ送る。
  2. 候補0件のURLでChrome既存Cookieが残る。
  3. 単独除外で別ProfileのCookieが残る。
  4. 除外の重なりで残ったProfileだけから最終ヘッダーを作る。
- `src/lib/dnr/cookie-path-partition.ts`と`.test.ts`を実装し、単一Profile除外時のfallback(現状はorigin全体で機能停止)を「非除外パスだけpartitionしてbase送信を維持」へ差し替える。実装後は本ADRの決定2/3を再改訂し、`cookie-exclusion-cannot-preserve` warningを撤去する。
- 同一origin上での複数glob重複一致 → priority 300 override同士の非決定的勝者問題(決定4参照)を、意味的識別子順の副priority付与またはpartitionで解消する。
