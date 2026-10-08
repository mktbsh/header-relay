---
title: browser 依存を3つの Port に切り出し、in-memory で拡張全体を駆動できるようにする
date: 2026-07-15
status: accepted
agent_model: claude-opus-4-8
---

# 背景

`compileConfig` / `header-emulation` / `matching` / `runtime-session` は既に browser グローバルを
実行時に触っていない。一方で `rule-sync` / `config-store` / `session-store` はモジュールスコープで
`browser.*` や `storage.defineItem` を掴んでいたため、単体テストは `vi.mock("#imports")` や
`globalThis.browser` スタブに依存し、「設定 → capture → コンパイル → DNR 適用」を
通しで動かす手段がなかった。

# 決定

実行時に browser を触る箇所だけを Port として切り出す。層全体をヘキサゴナルにはしない。

- Port は3つのみ: `StoragePort` / `DnrPort` / `AuditPort`(`src/lib/ports.ts`)。
- **型は借りる、実行時依存だけ切る**。`Browser.declarativeNetRequest.Rule` などの型は
  コンパイル時に消えるので Port の型としてそのまま使う。独自 Rule 型を再定義すると
  並行メンテのコストだけが増えて何も得られない。
- `rule-sync` / `config-store` / `session-store` を `createX(deps)` に変更(既存の
  `createRuntimeSession` / `createExtensionCommands` と同じ形)。モジュールスコープの
  singleton は廃止。
- 合成点を2段に分ける:
  - `src/lib/header-relay.ts` … `createHeaderRelay(ports)`。browser を一切 import しない。
  - `src/lib/lifecycle/engine.ts` … browser adapter を渡す production 実体。
    この分離が肝で、同一ファイルにすると test から import した瞬間に `#imports` を
    引き込んでしまい、Port 化の意味が消える。
- `auditDb` は既に `AuditPort` の形だったので型注釈のみ。移動しない。
- in-memory audit は retention / URL sanitize を `audit-retention.ts`(純粋)と共有する。
  fake が本物と別ポリシーになるのを防ぐため。

# 対象外

background の listener 登録 / messaging / i18n / `tabs.create` / UI は Port 化しない。
実装より配線が増えるだけで、実挙動は e2e が見ている。

# 得られたもの(変異テストで実測)

ハーネスの価値は「ユニットテストが構造上見られないものを見られるか」だけ。実測した:

| 変異                                    | ハーネス | ハーネス以外(126件) |
| --------------------------------------- | -------- | ------------------- |
| 競合時のガードを外す                    | 検知     | **検知**            |
| owned rule を削除せず追記               | 検知     | **検知**            |
| saveConfig が全 session を消す          | 検知     | **検知**            |
| config-store が migration を呼ばない    | 検知     | **素通り**          |
| 配線ミス(enabled 無視で全 Profile 適用) | 検知     | **素通り**          |
| 配線ミス(session を保存しない)          | 検知     | **素通り**          |

固有の価値は**継ぎ目のバグ**だけ。すなわち (a) あるモジュールが呼ぶべき相手を呼んでいない、
(b) 合成点の配線ミス。ユニットテストは継ぎ目を fake で置き換えるので構造上見られない。

裏を返せば、**それ以外はユニットテストの重複**である。そのためハーネスのシナリオテストは
3 本に絞る(通し1本 / 競合と復帰 / migration-on-load)。同じ挙動を2箇所で assert すると
変更のたびに2箇所直すことになり、それは負債でしかない。

副産物:

- `vi.mock` が 6 箇所 → 2 箇所(messaging のみ)に減少。`engine.test.ts` は削除。
- `header-rule-builder.test.ts` から browser スタブを撤去。スタブが無い状態で通ること自体が
  「builder は実行時に browser を読まない」の証明になる(DNR enum は SW cold start で
  参照できないため、これは実際に守る必要がある性質)。
- `config-store` の load 経路(v2 → v3 migration の実行)が初めてテストで踏まれるようになった。

# 天井(重要)

memory `DnrPort` は「適用された ruleset」を記録するだけで、Chrome の DNR を再現しない。
`attachedHeaders()` は priority 評価順のモデルであって Chrome そのものではない。
このハーネスが答えるのは「意図した ruleset を適用できたか」まで。
ruleset の意味論は `probe-parity.test.ts`、実挙動は e2e / 実ブラウザが担当する。
ここを混同すると「テストは通るが動かない」が起きる。

さらに、ruleset は同期時点のメモリ上の session から作られるため、**session を永続化し忘れても
ruleset は正しくなる**。`attachedHeaders()` だけを見ていると保存漏れを見逃す(実測で確認済み)。
永続化の確認は `getStatus()` 経由で別に assert すること。

# 挙動への影響

なし(内部リファクタ)。`config-store` のキャッシュがモジュールスコープから
インスタンススコープへ移るが、production は単一インスタンスのため同じ。
e2e 17件・unit 129件で確認済み。changeset は不要(リリースノートに載る挙動変化がないため)。
