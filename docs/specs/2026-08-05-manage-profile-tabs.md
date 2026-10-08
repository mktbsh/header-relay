---
title: Manage画面のProfileリストとタブナビゲーション
created_at: 2026-08-05
updated_at: 2026-08-05
updated_by: codex-gpt-5
status: accepted
---

# Manage画面のProfileリストとタブナビゲーション

## 文書の目的

この文書は、Manage画面の情報設計、URL、Profile作成、Popupからの遷移を定義する。

## 目的と非目的

### 目的

- SidebarをProfileの選択と有効化に使い、Profile内の項目移動をMainのタブへ移す。
- Viewed Profileと表示中の項目をURLで表現し、直接遷移とブラウザ履歴を成立させる。
- Profileに属する画面と拡張機能全体のSettingsを分離する。
- Popupが現在のタブに一致するProfileから、そのProfileのManage画面を直接開けるようにする。

### 非目的

- Headerの配置と操作は変更しない。
- ProfileのRuntime適用条件は変更しない。
- 旧Manage URLとの互換routeは維持しない。
- Profile項目の保存単位とRuntime Sessionの寿命は変更しない。

## 用語と不変条件

Manageが表示するProfileを**Viewed Profile**と呼ぶ。
Viewed ProfileはURLの`profileId`から決まり、永続Configには保存しない。

次の不変条件を保つ。

- Profileは一件以上存在する。
- Profile IDはConfig内で一意であり、URLからProfileを特定する識別子になる。
- Profile名は後述の比較キーでConfig内に一意である。
- Runtimeへ参加するProfileは`Profile.enabled`だけで決まり、Viewed Profileには依存しない。
- Profileごとの未保存draftは、タブ移動とProfile切替では破棄しない。
- 保存は現行どおりProfileのセクション単位で行う。

## URL

Chrome拡張ページにはserver rewriteがないため、hash historyを維持する。

| 領域     | タブ           | URL                                    |
| -------- | -------------- | -------------------------------------- |
| Profile  | Overview       | `#/profiles/:profileId`                |
| Profile  | Target Origins | `#/profiles/:profileId/origins`        |
| Profile  | Headers        | `#/profiles/:profileId/headers`        |
| Profile  | Excluded Paths | `#/profiles/:profileId/excluded-paths` |
| Profile  | Cookies        | `#/profiles/:profileId/cookies`        |
| Profile  | URL Probe      | `#/profiles/:profileId/url-probe`      |
| Settings | General        | `#/settings`                           |
| Settings | Audit Logs     | `#/settings/audit-logs`                |
| Settings | JSON Editor    | `#/settings/json-editor`               |

`#/`とhashのない`manage.html`は、Config順の先頭ProfileのOverviewへ転送する。
存在しないProfile IDは、Profileタブが有効なら同じタブの先頭Profileへ転送する。
Profileタブも不正なURLは、先頭ProfileのOverviewへ転送する。
`#/origins`や`#/advanced/url-probe`を含む旧URLは変換せず、先頭ProfileのOverviewへ転送する。

## 状態遷移

| Event                       | Before              | After                       | 永続化           |
| --------------------------- | ------------------- | --------------------------- | ---------------- |
| Profile名を選択             | Profile Aの任意タブ | Profile Bの同じタブ         | なし             |
| SettingsからProfile名を選択 | Settingsの任意タブ  | ProfileのOverview           | なし             |
| Profileタブを選択           | Profileの任意タブ   | 同じProfileの選択タブ       | なし             |
| Settingsを選択              | Profileの任意タブ   | SettingsのGeneral           | なし             |
| Profileを作成               | 作成Modal           | 新しいProfileのOverview     | Configへ即時保存 |
| Profileを削除               | ProfileのOverview   | 先頭の存続ProfileのOverview | Configへ即時保存 |
| enabledを切り替え           | ProfileList         | 同じURL                     | Configへ即時保存 |

タブ移動とProfile切替は未保存draftを保持する。
Reloadと画面を閉じる操作は、未保存draftがある場合だけ現行の確認を行う。

## Sidebar

DesktopのSidebar幅は260pxを維持し、上から次の順序で構成する。

1. ProfileList
2. ReviewPromptCard
3. Settings
4. BottomNav

ProfileListの見出しは`Profiles`とし、右側にProfile作成ボタンを置く。
ProfileListは残りの高さを使って縦スクロールする。

各Profile行は次を持つ。

- Profile名を表示するリンク
- Profileに未保存draftがあることを示すドット
- `Profile.enabled`を即時変更するスイッチ
- Viewed Profileを示す選択状態

Profile名を選ぶとURLだけを変更する。
スイッチ操作はURLを変更せず、Profile名の選択を発火させない。
enabledスイッチはOverviewから削除し、編集経路をProfileListへ一本化する。
Profile削除はOverviewに残す。

ReviewPromptCardの表示条件と状態遷移は変更しない。
ReviewPromptCardはProfileListとSettingsの間へ置く。

Settingsは歯車アイコンとラベルを持つ全幅の行にする。
Settings表示中はSettings行だけを選択状態にし、Profile行は選択状態にしない。

BottomNavはHomepage、Buy Me a Coffee、Chrome Web Storeレビュー、Feedbackの外部リンクだけを持つ。
SettingsはBottomNavに含めない。

## Main

Profile領域のMainは、Viewed Profile名、Profileタブ、選択中タブの内容を順に表示する。
タブ内容の見出しはProfile名より一段下の階層にする。

Profileタブは次の順序に固定する。

1. Overview
2. Target Origins
3. Headers
4. Excluded Paths
5. Cookies
6. URL Probe

未保存draftがあるタブは、ラベル横のドットと支援技術向けの未保存状態を持つ。

Settings領域のMainは、`Settings`見出し、Settingsタブ、選択中タブの内容を順に表示する。
SettingsタブはGeneral、Audit Logs、JSON Editorの順序に固定する。
GeneralはCompact設定とPrivacyリンクを持つ。

## モバイル

Headerは変更しない。
Sidebar領域はMainの上へ配置し、ProfileListを横スクロールへ切り替える。
Profile数によってMainが縦方向へ押し下げられない高さに制限する。

ProfileタブとSettingsタブは一行の横スクロールにし、折り返さない。

## Profile作成Modal

Profile作成ボタンはModalを開き、Profile名入力とEnabled checkboxを表示する。
Profile名は空欄で自動フォーカスし、Enabledの初期値はOFFにする。

Createは入力が有効な場合だけ実行でき、Enterでも実行できる。
Escape、Cancel、背景クリックはProfileを作成せずModalを閉じる。
Modalを閉じた場合は入力内容を破棄する。
入力エラーはProfile名フィールドの直下へ表示する。

CreateはProfileをConfigへ即時保存し、新しいProfileのOverviewへ遷移する。

## Profile名

Profile名の保存値は前後の空白を除く。
比較キーは、前後空白の除去、Unicode NFKC正規化、小文字化の順に作る。
比較キーが既存Profileと一致する新規作成と名前変更を拒否する。

schemaVersionを7へ更新し、v6からの移行で`selectedProfileId`を削除する。
移行はConfig順でProfile名を処理し、正規化後の重複へ` (2)`、` (3)`のような最小の連番を付ける。
移行はProfile IDとProfile内の設定を変更しない。

Advanced JSONから入力したConfigにも同じ一意制約を適用する。

## Popup

Popup右上のSettingsボタンは`manage.html#/settings`を新しいタブで開く。

PopupのProfile一覧は、現在開いているタブのURLに一致するProfileだけを現行どおり表示する。
各Profile名は`manage.html#/profiles/:profileId`を新しいタブで開くリンクにする。
Profile行のenabledスイッチは遷移せず、現行どおりその場で切り替える。

## Analytics

Manageの`page_view`は新URLを、値を限定した既存のroute分類へ変換して送る。
Profile名とProfile IDはAnalyticsへ送らない。
Profileのリンク遷移は既存の`profile_selected`を送るが、永続Configは変更しない。

## 受け入れ条件

- [x] Profileの全タブを新URLから直接開ける。
- [x] Settingsの全タブを新URLから直接開ける。
- [x] Profile切替が同じProfileタブを維持し、Settingsからの切替はOverviewを開く。
- [x] 不正なProfile IDと不正なrouteが定義済みのfallbackへ転送される。
- [x] `selectedProfileId`がConfig、migration後の保存値、messaging、Runtime statusからなくなる。
- [x] enabled操作がSidebarだけにあり、操作時にProfile遷移を起こさない。
- [x] ProfileとProfileタブの未保存表示がdraft状態と一致する。
- [x] タブ移動とProfile切替後も未保存draftが残る。
- [x] Profile作成Modalが名前の必須、一意性、Enabled初期値OFFを守る。
- [x] v6の重複Profile名がデータを失わず一意な名前へ移行する。
- [x] PopupのSettingsとProfile名が定義済みの新URLを開く。
- [x] DesktopとモバイルでProfileList、Settings、ReviewPromptCard、BottomNavへ到達できる。
- [x] 8ロケールが同一キー構成を保つ。
- [x] changesetを同梱する。
