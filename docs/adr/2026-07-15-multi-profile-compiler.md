---
title: 複数の有効Profileをコンパイルし単一のDNR rulesetへ適用する
date: 2026-07-15
status: accepted
issue: 53
agent_model: claude-opus-4-8
---

# 背景

`activeProfileId` が「管理画面で編集中のProfile」と「ブラウザへ適用するProfile」を兼ねており、
`Profile.enabled` と責務が重複していた。このため用途ごとにProfileを分割しても同時利用できず、
Common Headers / Local Development / OAuth Capture のような責務単位の分割が成立しなかった。

# 決定

Profileを「独立して有効化できる設定モジュール」として扱い、有効Profile群をコンパイルして
単一のDNR Session Rulesetへ反映する。

- Config: `activeProfileId` を `selectedProfileId` へ変更（schemaVersion 2 -> 3）。
  選択はUI状態のみを表し、Runtimeの適用対象は `profile.enabled` が単独で決める。
- Compiler: `src/lib/compiler/compile-config.ts` に `compileConfig(enabledProfiles, sessions)` を新設し、
  中間表現 `CompiledConfig`（rules / matchedProfiles / warnings / errors）を返す。
  DNR Builder、URL Probe、Runtime Status はこの結果のみを入力とする。
- DNR: `buildDnrRules(compiled)` は `CompiledConfig` の純変換に限定し、
  `syncDnrRules(compiled)` が単一の `updateSessionRules()` で owned range を丸ごと置換する。
- Runtime: Session を Profile 単位（`RuntimeState.sessions`）に変更。capture は一致した
  全 enabled Profile について独立に行い、その後に一度だけ再コンパイル+同期する。
- Conflict: 同一 Origin・同一 Header Name を複数の enabled Profile が付与する場合はコンパイルエラー。
  Priority は導入しない。

# 補足決定（issue に明記がなく、実装時に決めた事項）

- `syncDnrRules` の戻り値は `number[]` ではなく `{ ruleIds, ruleIdsByProfile }`。
  `SessionState.dnrRuleIds` を Profile 単位で保持する要件を満たすため、
  ID 重複解決後の最終 ID を Profile へ紐づける必要がある。ID 採番は Builder 側に集約した。
- 競合時は「何も適用しない」= owned rule を全削除する。ステイルなルールを残すと
  URL Probe の表示と実 Runtime が乖離し、issue の「Probeと実Runtimeが一致する」制約に反するため。
- `selectProfile`（選択変更）は Session を消さず DNR 同期も行わない。UI 状態と Runtime 状態の分離そのもの。
- `saveConfig` は「ルールに関わる内容が実際に変わった Profile」の Session だけをクリアする。
  全 Session を消すと、他 Profile の captured token が巻き添えになり複数 Profile 運用の価値が落ちる。
- Profile の enabled トグルは Sidebar に集約し即時永続化。Overview の basics セクションからは
  enabled を外した（draft 保存対象は name のみ）。同じ状態に二つの編集経路を作らないため。

## 後続決定（2026-07-22、gpt-5.6-sol）

enabledの編集経路を一つに保ったまま、トグルをSidebarからOverviewのProfile設定へ移動する。
Sidebarのプルダウンは利用可能な横幅いっぱいに表示し、新規作成はその直下の全幅ボタンにする。
削除はOverviewのProfile設定カード内の破壊的操作として配置する。
選択と状態変更を横並びにしたことで生じる不均衡を解消しつつ、選択肢を増やす操作をProfileメニューの近くに置くため。

# 影響

- 既存 config は `migrateAppConfig()` が v2 -> v3 へ移行する。旧 active 以外の Profile も
  既存の `enabled` 値を尊重するため、v2 で enabled かつ非 active だった Profile は移行後に適用対象となる。
  これは issue の Migration 方針に従った意図的な挙動。
- Session storage キーは `session:auth-session` -> `session:runtime`。session storage は揮発性のため移行不要。
- メッセージ `SET_ACTIVE_PROFILE` -> `SELECT_PROFILE`、`GET_STATUS` は全 Profile / 全 Session /
  Runtime Status を返す形へ変更。
