---
title: ManageのViewed ProfileをURLで識別する
date: 2026-08-05
status: accepted
agent_model: codex-gpt-5
supersedes_in_part: 2026-07-15-multi-profile-compiler
---

# ManageのViewed ProfileをURLで識別する

Manage画面が表示するProfileを、永続Configの`selectedProfileId`ではなく`#/profiles/:profileId/*`のURLで識別する。
Profileへの直接リンク、Profile間で同じタブを移動する操作、ブラウザ履歴を一つの状態表現で扱えるためである。

`selectedProfileId`はManageで最後に編集したProfileを記憶する役割しか持たず、RuntimeとPopupは参照していないため削除する。
Runtimeの適用対象は引き続き`Profile.enabled`だけで決める。

Profileを含まない入口URLはConfig順の先頭ProfileのOverviewへ転送する。
存在しないProfile IDは同じProfileタブを保って先頭Profileへ転送し、タブも不正な場合はOverviewへ転送する。
この決定により、Manageを閉じた後に最後のViewed Profileを復元する機能は持たない。

このADRは[複数の有効Profileをコンパイルし単一のDNR rulesetへ適用する](./2026-07-15-multi-profile-compiler.md)の`selectedProfileId`に関する決定だけを置き換える。
複数のEnabled Profileを単一RulesetへコンパイルするRuntimeの決定は変更しない。
