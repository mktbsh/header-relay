---
created_at: 2026-08-14
updated_at: 2026-08-14
updated_by: codex-gpt-5
status: accepted
issues: [122, 123, 124]
---

# Manageの反復操作は既存のConfig順、明示的な秘密値選択、Session状態を使う

## 決定

### Profile Order

Profileの並び替えは`AppConfig.profiles`の配列順を直接変更する。
配列順はSidebarの表示順だけでなく、複数のEnabled ProfileをRuntimeが評価し、Cookieを連結する順序だからである。
表示順専用の新しいフィールドは追加しない。

### Configuration Export

ExportはAppConfig全体のJSONとし、秘密値は既定で空にする。
利用者が「秘密値を含める」を明示した場合だけFixed Header、Fixed Cookie、Popup option、Migration Issueに残る値を含める。
Redacted Exportは空値を持つConfigとしてImportできるよう、空のFixed Cookieを無効化し、複数選択肢のPopup selectをtext入力へ変換する。Importは既存Config全体を置換する。

### Keyboard Shortcut

全Profile停止前のEnabled Profile IDは`storage.session`へ保存する。
Config Schemaへ一時状態を追加せず、ブラウザ再起動後に古い復元対象を残さないためである。
操作結果はAction badgeで示し、追加Permissionを要する通知は使わない。
ショートカットの既定キーは指定せず、利用者がブラウザのショートカット設定で割り当てる。

## 却下した選択肢

- 表示順と実行順を分ける：Cookieの実行順を別のConfig値で管理する必要があり、2つの順序がずれる余地を増やす。
- Export時に常に値を含める：バックアップファイルを意図せず共有したときに秘密値が漏れる。
- 秘密値をフィールド単位で選ぶ：複数のFixed Header/CookieとMigration Issueの値を個別に確認するUIが増える。
- Paused Profile SetをAppConfigへ保存する：一時的な操作状態にSchema Version、Migration、バックアップの責務を持ち込む。
- 通知で結果を伝える：通知Permissionと通知寿命を追加する。Action badgeで現在の停止状態を十分に示せる。
- Manifestへ既定キーを設定する：ブラウザや既存拡張機能との衝突を避けるため、割当は利用者に委ねる。

## 影響

- Profile Orderの変更は、Config保存後のRuntime同期結果にも反映される。
- Redacted Importは秘密値を空にしたConfigで全体置換するため、既存Configの秘密値を引き継がない。
- Shortcutの復元はProfile IDの集合だけを使い、Configの順序やRuntime Sessionを復元しない。
