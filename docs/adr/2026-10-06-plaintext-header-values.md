---
created_at: 2026-10-06T00:00:00+09:00
updated_at: 2026-10-06T00:00:00+09:00
updated_by: claude-opus-5-5
status: accepted
issues: []
---

# Header値はどの種類でも拡張機能UI内で平文表示する

## 決定

Fixed Header、Captured Header、Cookie、Popupの各表示で、Header名による機密判定にかかわらず値を平文で表示する。
Captured Headerの値も既定で表示し、「表示/隠す」の切り替えは設けない。コピー操作は残し、成功を表示する。

Header Relayの利用者は、開発・検証のために値を中継していることとそのリスクを理解したうえで使っている。
値を確認すること自体が主要な用途なので、伏せ字は確認のたびに操作を増やすだけで保護として機能しない。
Fixed HeaderとCookieは既に平文表示であり、Captured Headerだけを伏せる不整合も解消する。

拡張機能の外へ値を出さない方針は変えない。監査ログへ値を記録しないこと、Exportは秘密値を既定で空にすること(ADR 2026-08-14-manage-productivity)、機密Header名への警告表示は維持する。

## 却下した選択肢

- **機密Header名の値だけを伏せ字にする**: 利用者は値を確かめるために画面を開くため、毎回の表示操作が増える。Header名による判定は網羅できず、伏せない値との境界も利用者に説明しにくい。
- **Captured Headerの伏せ字を既定のまま残す**: Fixed HeaderやCookieの平文表示と不整合のままになる。
