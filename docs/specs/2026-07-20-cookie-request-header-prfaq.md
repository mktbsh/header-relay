---
created_at: 2026-07-20
updated_at: 2026-07-21
updated_by: codex-gpt-5
status: draft
---

# Cookieリクエストヘッダー機能 PR/FAQ

## 文書の目的

この文書は、Header Relayへ追加するCookieリクエストヘッダー機能について、利用者が得る結果から必要な動作を定義する。

対象となる利用者は、ローカル環境または検証環境でCookie認証を使うWebアプリケーションとAPIの開発者である。

## 将来の発表文

### Header Relay、固定Cookieと追跡Cookieに対応

Header Relayは、対象オリジンへ送信するCookieをProfile単位で設定し、レスポンスによるCookieの更新を自動追跡できるようになりました。

Cookie認証を使うWebアプリケーションやAPIの検証では、開発者がレスポンスの`Set-Cookie`を確認し、その値を後続リクエストの`Cookie`ヘッダーへ転記することがあります。
ログインし直した場合やセッションが更新された場合には同じ作業が繰り返し発生し、古い値を送って検証結果を誤る原因にもなります。

新しいCookie機能では、Profileに固定Cookieと追跡するCookie名を登録できます。
Header Relayは、対象オリジンのレスポンスに含まれる`Set-Cookie`から登録済みCookieの値を取得し、次回以降の対象リクエストへ自動的に送信します。
固定Cookieと追跡Cookieは一つの`Cookie`ヘッダーへまとめられ、同じ名前がある場合は固定Cookieが優先されます。

Cookieの設定と追跡値は管理画面とPopupで確認できます。
固定CookieはPopupから変更でき、追跡CookieはCookieごと、またはProfile単位で消去できます。
URL Probeでは、リクエストを送る前にProfileごとのCookieと最終的な`Cookie`ヘッダーを確認できます。

Header RelayはChromeのCookieストアを参照または変更しません。
対象Profileが有効な間だけ、Header Relayが管理するCookieによって対象リクエストの`Cookie`ヘッダーを置き換えます。
追跡値は現在のブラウザセッション内だけに保持され、ブラウザの再起動、Profileの無効化、設定変更、権限取消、または手動消去によって削除されます。

利用を始めるには、既存のProfileで固定Cookieまたは追跡するCookie名を追加し、Profileを有効にします。
以後はCookie値を手作業で転記せずに、Cookie認証を使うリクエストを検証できます。

## 利用者から想定される質問

### 何を設定できますか

Profileごとに、固定Cookieと追跡Cookieを設定できます。

固定Cookieには、Cookie名と常に送信する値を設定します。
追跡Cookieには、レスポンスから取得するCookie名を設定します。

### 追跡Cookieはどのように更新されますか

Header Relayは、有効なProfileのTarget Originから受信した`Set-Cookie`を確認します。
登録済みのCookie名が含まれていた場合は値を取得し、次回以降の対象リクエストへ送信します。

登録していないCookieは追跡しません。
一つのレスポンスに同名の`Set-Cookie`が複数ある場合は、最後の指定を採用します。

### Cookieを削除するレスポンスはどう扱われますか

有効な`Max-Age`が0以下の場合、または有効な`Max-Age`がなく過去の`Expires`が指定された場合は、同名の追跡Cookieを削除します。
両方が指定されている場合は`Max-Age`を優先します。

不正な形式の`Set-Cookie`はその1件だけを無視します。
同じレスポンスに含まれる正常なCookieは追跡を続けます。

### Chromeが管理するCookieはどうなりますか

Header RelayはChromeのCookieストアを参照または変更しません。

送信できる固定Cookieまたは追跡Cookieが一つ以上ある対象リクエストでは、Chromeが生成した`Cookie`ヘッダーを、Header Relayが管理するCookieで完全に置き換えます。
Profileを無効にしたリクエストやTarget Originに一致しないリクエストには、この置き換えを行いません。

対象リクエストに送信できる固定Cookieまたは追跡Cookieが一つもない場合も、`Cookie`ヘッダーを変更しません。
追跡値をまだ取得していない場合は、Chromeが生成した既存の`Cookie`ヘッダーをそのまま送信します。

### `Set-Cookie`の属性は再現されますか

再現されません。
追跡時に使うのはCookie名と値、および削除を判断する`Max-Age`と`Expires`だけです。

`Domain`、`Path`、`Secure`、`HttpOnly`、`SameSite`などの属性に基づく送信制御は行いません。
送信先はProfileのTarget OriginとExcluded Pathによって決まります。

### 固定Cookieと追跡Cookieに同じ名前を登録した場合はどうなりますか

同一Profile内では固定Cookieを優先します。
レスポンスによって追跡値が更新されても、固定Cookieの送信値は変わりません。

Cookie名では大文字と小文字を区別します。
たとえば`SID`と`sid`は別のCookieとして扱います。

### 複数のProfileが同じリクエストに一致した場合はどうなりますか

異なる名前のCookieは一つの`Cookie`ヘッダーへまとめます。

同じTarget Originに対して複数の有効なProfileが同名Cookieを設定している場合は競合エラーになります。
競合中はHeader Relayが管理するリクエストヘッダーを送信しません。
Header RelayのDNR Session Ruleが適用されないため、Chromeが生成した本来のリクエストヘッダーは変更されません。

一つのProfileで追跡したCookieは、そのProfileに登録されたすべてのTarget Originで共有します。
共有したくない場合はProfileを分けます。

### Excluded Pathではどうなりますか

一致したExcluded Pathでは、そのProfileが管理するCookieを送信しません。
同じリクエストに別のProfileも一致している場合は、別のProfileが管理するCookieを残します。

Excluded Pathは既存機能と同じ完全一致のpath globとして評価します。
`*`は一つのpath segment内の0文字以上、`**`は`/`を含む0文字以上、`?`は`/`以外の1文字に一致します。
大文字と小文字、および末尾の`/`を区別します。
URLのpathnameに含まれるpercent-encodingは復号せずに比較します。
query stringとfragmentは評価に含めません。

### Cookie値はどこで確認できますか

管理画面、Popup、URL Probeで確認できます。
値は伏せ字にせず、常に表示します。

固定Cookieは設定した項目だけをPopupから変更できます。
追跡Cookieは管理画面とPopupから個別に消去でき、Profile内の追跡値をまとめて消去することもできます。

### 追跡Cookieはいつまで保持されますか

現在のブラウザセッション内だけ保持します。

追跡Cookieは、ブラウザの再起動、拡張機能の無効化、再読み込み、更新、Profileの無効化、Cookie設定またはTarget Originの変更、ホスト権限の取消、手動消去によって削除されます。

### Cookieの名前や値はログへ保存されますか

監査ログには、Cookie名と取得、更新、削除、解析失敗の結果を記録します。
Cookie値は記録しません。

監査ログはIndexedDBへ最大1000件、最長7日間保存されます。
ログ表示用のリクエストURLは現在のブラウザセッション内だけに保持されます。

分析イベントにはCookie名とCookie値のどちらも記録しません。

### 既存の`Cookie`ヘッダー設定はどうなりますか

Fixed Headerに設定されている`Cookie`は、更新時に専用の固定Cookieへ変換します。
正しく分解できない設定は自動変換せず、修正が必要な設定として管理画面に表示します。

Captured Headerに登録されている`Cookie`は、追跡対象となるCookie名を特定できないため変換しません。
管理画面で削除し、追跡するCookie名を登録し直す必要があります。

専用Cookie機能への移行後は、Fixed HeaderまたはCaptured Headerへ`Cookie`を登録できません。

変換できない旧設定は送信または追跡に使用せず、移行時の問題として設定内に保持します。
利用者が専用Cookieへ変換するか削除するまで、元の値を失わずに表示します。

## 開発と運用で確認する質問

### ChromeのCookieストアを使わずに実現できますか

実現できます。

登録済みCookieの取得には、現在もCaptured Headerの取得に使っている`webRequest.onHeadersReceived`を使います。
Chromeは`Set-Cookie`の参照に`extraHeaders`の指定を要求しており、現行リスナーはすでに`responseHeaders`と`extraHeaders`を指定しています。

送信時は`declarativeNetRequest`の`modifyHeaders`で`Cookie`ヘッダーを`set`します。
`set`は同名の既存ヘッダーを削除して新しい値を設定するため、Chromeが生成した`Cookie`ヘッダーを完全に置き換える要件と一致します。

参照資料：

- [chrome.webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

### 新しい権限は必要ですか

新しい権限は追加しません。

ChromeのCookieストアを操作しないため、`cookies`権限は不要です。
既存の`webRequest`、`declarativeNetRequest`、`declarativeNetRequestWithHostAccess`、およびTarget Originに対するホスト権限を使います。

ホスト権限がないTarget Originでは、Cookieの取得と送信を行いません。

### Cookieをどの形式で保持しますか

永続設定には、固定Cookieの名前と値、および追跡対象のCookie名をProfile単位で保持します。
追跡した値は既存のSession StateへProfile単位で保持します。

Cookie名では大文字と小文字を区別します。
Cookie名とCookie値の検証、および`Set-Cookie`の解析は、Cookieの現行標準である[RFC 10025](https://www.rfc-editor.org/info/rfc10025)に従います。

ただし、Header RelayはCookieストアを再現しません。
解析した属性のうち動作へ反映するのは、追跡値の削除に使う`Max-Age`と`Expires`だけです。
両方がある場合は`Max-Age`を優先します。

### 不正な`Set-Cookie`はどこで処理しますか

ネットワークイベントを扱う処理へ渡す前に、1本の`Set-Cookie`を一つの解析結果へ変換します。
解析結果は、更新、削除、無視する不正値のいずれかです。

複数の`Set-Cookie`は1本ずつ解析します。
不正な1本があっても、同じレスポンスの正常な解析結果は適用します。

監査ログにはCookie名と処理結果を記録します。
不正値のCookie名を安全に特定できない場合は、Cookie名を記録せず解析失敗だけを記録します。
Cookie値と元の`Set-Cookie`文字列は記録しません。

### 複数ProfileのCookieをどこで統合しますか

有効なProfile、Session State、Target Origin、Excluded Pathから、対象URLへ送るCookie名と値をコンパイラーが決定します。
URL ProbeとDNRルール生成は同じコンパイル結果を使います。

DNRルールごとに`Cookie`ヘッダーを個別設定すると、複数ルールが同じヘッダーを変更して結果が優先度に依存します。
そのため、CookieはProfileごとのDNR変更へ直接変換せず、対象リクエストに対する最終的な`Cookie`ヘッダーを一度だけ`set`します。

送信候補が0件の場合は、`Cookie`に対するDNR変更を生成しません。
この場合はChromeが生成した既存の`Cookie`ヘッダーをそのまま送信します。

### Excluded Pathで別ProfileのCookieを残すにはどうしますか

Excluded Pathを適用した後のProfile集合から、最終的な`Cookie`ヘッダーを再計算します。

既存実装のようにProfile単位のremoveルールで`Cookie`ヘッダー全体を削除すると、別ProfileのCookieも消えます。
Cookie機能では、その方法を使いません。

URL Probeは同じ計算結果を表示し、DNRの実行結果と一致させます。

### Cookie競合時に全リクエストヘッダーを停止するにはどうしますか

コンパイラーは、同じTarget Originを対象とする有効なProfile間で、設定済みの同名Cookieを検出します。
追跡値をまだ取得していないCookieも競合判定に含めます。
Excluded Pathを適用する前にTarget Origin単位で判定するため、二つのProfileが同じURLで同時にCookieを送らない構成でも競合になります。
競合が一件でもあれば、既存のヘッダー競合と同じくDNR Session Rulesetを空にします。

Runtime Status、URL Probe、管理画面に、競合したTarget Origin、Cookie名、Profileを表示します。
Header RelayのDNR Session Ruleがない状態になるため、Chromeが生成した本来のリクエストヘッダーは変更されません。

競合中も登録済みCookieの追跡は続けます。
Profileの無効化、Cookie設定の変更、またはTarget Originの変更によって競合が解消した場合は、DNR Session Rulesetを再生成します。

### 同時に複数のレスポンスを受信した場合はどうしますか

現在のネットワークイベント処理は、Session Stateの更新とDNRルールの同期を直列に実行しています。
Cookieの更新も同じ処理へ含め、レスポンスを受け付けた順に適用します。

同じレスポンス内に同名の`Set-Cookie`が複数ある場合は、ヘッダーに現れた順に解析して最後の正常な更新または削除を採用します。
解析失敗は順序に参加しません。

### DNR同期に失敗した場合はどうしますか

DNR更新はChromeが提供する一回の原子的な更新として実行します。
更新に失敗した場合は、最後に正常適用されたDNR Session Rulesetを維持し、Runtime Statusと監査ログへ同期エラーを記録します。

競合、Profile無効化、権限取消などによってルールを削除する更新が失敗した場合は、対象となるowned rule IDだけを削除する更新を直ちに一度再試行します。
再試行にも失敗した場合は、Chrome側の旧Rulesetを拡張機能から停止できないため、削除要件の例外として扱います。
その間はRuntime Statusへ、旧ヘッダーが送信される可能性を示すエラーを表示します。

URL Probeは設定とSession Stateから計算した適用予定の結果を表示します。
同期エラー中は、表示結果が現在のDNR Session Rulesetへ適用されていないことを明示します。

次の設定変更、Session State更新、拡張機能起動時に同期を再試行します。

### Advanced JSONには何を含めますか

固定Cookieの名前と値、および追跡対象のCookie名を含めます。
現在の追跡値と監査ログは含めません。
未解決の移行時の問題は、元の旧設定を失わないために含めます。
移行時の問題は専用フィールドへ保存し、Advanced JSONの適用時には非実行データとして検証して再保存します。
汎用Headerまたは専用Cookieの設定としては解釈しません。

JSON適用時にも通常の設定画面と同じ検証を行い、不正なCookie名またはCookie値を含む設定は保存しません。

### 既存設定はどのように移行しますか

拡張機能更新後に旧スキーマを初めて読み込むとき、設定スキーマのバージョンを更新します。

Fixed Headerの`Cookie`値は、`;`で区切られたCookie名と値へ分解し、専用の固定Cookieへ変換します。
値に含まれる最初の`=`だけを名前との区切りとして扱います。
変換したCookieは、元のHeaderの有効状態と設定位置を引き継ぎ、一意な識別子を割り当てます。

Popup編集設定がないHeaderは、すべてのCookie pairを変換します。
Popup編集設定があるHeaderは、一つのCookie pairと、そのCookie名に対応するPopup設定へ損失なく変換できる場合だけ自動変換します。
複数のCookie pairを持つ場合、またはselectの選択肢を同じCookie名の値へ変換できない場合は自動変換しません。

同名Cookieの重複や不正な構文が一つでもあり、Header全体を損失なく変換できない場合は、そのHeaderを部分変換しません。
元のHeaderを汎用ヘッダー設定から取り除き、実行時に使われない移行時の問題としてProfileへ保持します。

一つのProfileに複数の旧Fixed Header `Cookie`があり、変換結果のCookie名が重複する場合は、該当する旧Headerをすべて部分変換せず移行時の問題へ保持します。

Captured Headerの`Cookie`は、追跡するCookie名を推測しません。
元のHeaderを汎用ヘッダー設定から取り除き、実行時に使われない移行時の問題としてProfileへ保持します。

移行時の問題が残っていてもスキーマ更新は完了とし、次回起動時に同じ移行を繰り返しません。
他の正常な設定は通常どおり保存、コンパイル、送信できます。
利用者が専用Cookieへ変換するか削除すると、移行時の問題をProfileから取り除きます。

移行時の問題はProfile ID、問題ID、旧設定の種類、元のHeader設定を持つ専用フィールドとして保持します。
コンパイラーはこのフィールドを参照しません。

### 監査ログと分析イベントには何を記録しますか

監査ログには、Cookieの取得、更新、削除、解析失敗、競合、DNR同期の結果を記録します。
Cookie名は記録しますが、Cookie値と元の`Set-Cookie`文字列は記録しません。
Cookie名を安全に解析できなかった場合は、Cookie名を省略して解析失敗だけを記録します。

分析イベントには、操作種別、画面、成否、対象件数を記録します。
Cookie名、Cookie値、Target Origin、入力文字列は記録しません。

### 公開文書では何を変更しますか

README、Privacy Policy、Chrome Web Storeの説明、審査用テスト手順をCookie機能に合わせて更新します。
Cookie値が画面では常に表示されること、追跡値はSession Stateだけに保持されること、監査ログには値を記録しないことを明記します。

利用者向け文言を英語で定義し、同じコミットですべての対応ロケールへ反映します。

### リリース時の変更種別は何ですか

利用者が使える機能を追加するため、`header-relay`のminor changesetを同梱します。
`CHANGELOG.md`と`package.json`のバージョンは手動で変更しません。

## 機能要件

### 設定

#### FR-01 Cookie専用設定

Profileに、固定Cookieと追跡Cookieの設定を追加する。

固定Cookieは、識別子、Cookie名、値、有効状態、Popupからの編集設定を持つ。
追跡Cookieは、識別子、Cookie名、有効状態を持つ。

固定Cookieと追跡Cookieは、汎用のFixed HeaderおよびCaptured Headerとは別の設定として管理する。

#### FR-02 汎用ヘッダーからの分離

Fixed HeaderまたはCaptured Headerへ`Cookie`を新規登録できないようにする。

設定画面とAdvanced JSONのどちらから入力した場合も、同じ検証結果にする。

#### FR-03 Cookie名とCookie値の検証

Cookie名では大文字と小文字を区別する。
空のCookie名と、RFC 10025の`cookie-name`に適合しないCookie名は保存しない。

固定Cookieの値は、RFC 10025の`cookie-value`に適合する場合だけ保存する。
不正な行には、修正対象を特定できるエラーを表示する。

同一Profileの固定Cookie内、または追跡Cookie内に、有効状態に関係なく同名の項目を複数登録できないようにする。
固定Cookieと追跡Cookieの間では同名項目を許可し、FR-10の優先規則で解決する。

### 追跡

#### FR-04 追跡対象

次の条件をすべて満たすレスポンスだけを追跡対象にする。

- Profileが有効である。
- レスポンスURLが有効なTarget Originに一致する。
- レスポンスURLがExcluded Pathに一致しない。
- Target Originに対するホスト権限がある。
- リソース種別が既存のHeader Relay対象である`main_frame`、`sub_frame`、`xmlhttprequest`のいずれかである。

登録されていないCookie名は追跡しない。

#### FR-05 `Set-Cookie`の解析

一つの`Set-Cookie`ヘッダーを一つの入力として解析する。
Cookie名とCookie値を取得し、属性名では大文字と小文字を区別しない。

不正な`Set-Cookie`はその1件だけを無視する。
同じレスポンス内の正常な`Set-Cookie`は処理する。

同じレスポンスに同名の`Set-Cookie`が複数ある場合は、ヘッダーに現れた順に処理し、最後の正常な更新または削除を採用する。
解析失敗は順序に参加しない。

#### FR-06 追跡値の更新と削除

登録済みのCookie名を含む正常な`Set-Cookie`を受信した場合は、Profileの追跡値を更新する。

有効な`Max-Age`が0以下の場合は追跡値を削除する。
有効な`Max-Age`がなく、`Expires`が受信時刻以前の場合も追跡値を削除する。
`Max-Age`と`Expires`の両方がある場合は`Max-Age`を優先する。

`Domain`、`Path`、`Secure`、`HttpOnly`、`SameSite`、およびその他の属性は送信条件へ反映しない。

#### FR-07 追跡値の保持範囲

追跡値はProfile単位でSession Stateに保持する。
一つのTarget Originで取得した値を、同じProfileに登録されたすべてのTarget Originで使用する。

追跡値は永続設定とAdvanced JSONへ含めない。

#### FR-08 追跡値の消去

次の場合に、対象Profileの追跡Cookieを消去する。

- ブラウザを再起動した場合。
- 拡張機能を無効化、再読み込み、更新した場合。
- Profileを無効化した場合。
- Cookie設定またはTarget Originを変更した場合。
- Target Originに対するホスト権限が取り消された場合。
- 利用者がProfile単位の消去を実行した場合。

利用者は、管理画面とPopupから追跡Cookieを個別に消去できる。

Cookie設定の変更には、固定Cookieまたは追跡Cookieの追加、編集、並べ替え、有効状態の変更、削除、Popup編集設定の変更を含む。
これらの変更時は、変更したProfileの追跡値をすべて消去する。
Popupからの固定Cookie値の変更も同じ扱いにする。

### 送信

#### FR-09 送信対象

有効なProfileのTarget Originに一致し、Excluded Pathに一致せず、ホスト権限があるリクエストだけをCookie送信の対象にする。

リソース種別は`main_frame`、`sub_frame`、`xmlhttprequest`に限定する。

#### FR-10 Profile内のCookie決定

有効な固定Cookieと、値を取得済みの有効な追跡Cookieを送信候補にする。

同一Profileで固定Cookieと追跡Cookieの名前が一致する場合は、固定Cookieだけを送信候補にする。

#### FR-11 複数Profileの統合

同じリクエストに一致する有効なProfileが、異なる名前のCookieを持つ場合は、一つの`Cookie`ヘッダーへ統合する。

Cookieの並び順は決定的にする。
有効なProfileの設定順を優先し、各Profile内では固定Cookieの設定順、追跡Cookieの設定順に並べる。
サーバーが並び順へ依存することは保証しない。

#### FR-12 Cookie競合

同じTarget Originを対象とする複数の有効なProfileが、同名の有効なCookie設定を持つ場合は競合エラーにする。
追跡値を取得していない追跡Cookieも競合判定に含める。
競合はExcluded Pathを適用する前にTarget Origin単位で判定する。

競合がある間は、Header Relayが管理するすべてのDNR Session Ruleを削除し、リクエストヘッダーを送信しない。
競合したTarget Origin、Cookie名、ProfileをRuntime Status、URL Probe、管理画面へ表示する。
Chromeが生成した本来のリクエストヘッダーは変更しない。

#### FR-13 `Cookie`ヘッダーの置換

送信候補を`name=value`形式へ変換し、`; `で連結した一つの`Cookie`ヘッダーを生成する。

送信候補が1件以上ある対象リクエストでは、Chromeが生成した既存の`Cookie`ヘッダーを、生成した値で完全に置き換える。
ChromeのCookieストアは参照または変更しない。

送信候補が0件の場合は`Cookie`ヘッダーを変更せず、Chromeが生成した既存の値をそのまま送信する。

#### FR-14 Excluded Path

Excluded Pathに一致したProfileのCookieだけを送信候補から除く。

同じリクエストに別のProfileも一致する場合は、別のProfileが管理するCookieを残して最終的な`Cookie`ヘッダーを生成する。

既存のExcluded Pathと同じ完全一致のpath globとして評価し、query stringとfragmentは評価に含めない。
`*`は一つのpath segment内の0文字以上、`**`は`/`を含む0文字以上、`?`は`/`以外の1文字に一致する。
大文字と小文字、および末尾の`/`を区別する。
URLのpathnameに含まれるpercent-encodingは復号せずに比較する。

### 画面

#### FR-15 管理画面

Profile管理にCookie専用画面を追加し、固定Cookieと追跡Cookieを分けて表示する。

固定Cookieでは、追加、編集、有効化、無効化、削除、Popupからの編集設定を操作できる。
追跡Cookieでは、追跡対象名の追加、編集、有効化、無効化、削除、現在値の個別消去、全件消去を操作できる。

固定Cookieと追跡Cookieの値は伏せ字にせず、常に表示する。

#### FR-16 Popup

現在のページに一致する有効なProfileについて、固定Cookieと追跡Cookieの名前と値を表示する。

Popupからの編集が有効な固定Cookieは、Popup上で値を変更できる。
追跡Cookieは個別消去でき、Profile単位の全件消去も実行できる。

値は伏せ字にせず、常に表示する。

#### FR-17 URL Probe

入力URLに一致したProfileごとに、送信候補となるCookie名と値、およびExcluded Pathによる除外結果を表示する。

最終的なCookie名と値、および送信する`Cookie`ヘッダー全体を表示する。
競合がある場合は、競合内容を表示し、ヘッダーが送信されないことを示す。

### ログと分析

#### FR-18 監査ログ

Cookieの取得、更新、削除、解析失敗、競合、DNR同期結果を監査ログへ記録する。

Cookie名と処理結果を記録する。
Cookie名を安全に解析できなかった場合はCookie名を省略する。
Cookie値と元の`Set-Cookie`文字列は記録しない。

監査ログはIndexedDBへ最大1000件、最長7日間保存する。
ログ表示用のリクエストURLは現在のブラウザセッション内だけに保持する。

#### FR-19 分析イベント

Cookie機能の操作種別、画面、成否、対象件数を分析イベントへ記録する。

Cookie名、Cookie値、Target Origin、利用者が入力した文字列は記録しない。

### 移行と公開情報

#### FR-20 Fixed Headerの移行

拡張機能更新後に旧スキーマを初めて読み込むときに移行を実行する。

既存のFixed Headerにある`Cookie`値をCookie pairへ分解し、専用の固定Cookieへ変換する。

最初の`=`をCookie名と値の区切りとして扱い、`;`でCookie pairを分ける。
変換したCookieは、元のHeaderの有効状態と設定位置を引き継ぎ、一意な識別子を持つ。

Popup編集設定がないHeaderは、すべてのCookie pairを変換する。
Popup編集設定があるHeaderは、一つのCookie pairと、そのCookie名に対応するPopup設定へ損失なく変換できる場合だけ自動変換する。
複数のCookie pairを持つ場合、またはselectの選択肢を同じCookie名の値へ変換できない場合は自動変換しない。

同名Cookieの重複または不正な構文が一つでもある場合は、そのHeaderを部分変換しない。
元のHeaderを汎用ヘッダー設定から取り除き、送信には使用しない移行時の問題としてProfileへ保持する。
元の入力を管理画面とAdvanced JSONへ表示し、利用者が専用Cookieへ変換するか削除できるようにする。

一つのProfileに複数の旧Fixed Header `Cookie`があり、変換結果のCookie名が重複する場合は、該当する旧Headerをすべて移行時の問題へ保持する。

#### FR-21 Captured Headerの移行

既存のCaptured Headerにある`Cookie`は自動変換しない。

元のHeaderを汎用ヘッダー設定から取り除き、追跡には使用しない移行時の問題としてProfileへ保持する。
元の入力を管理画面とAdvanced JSONへ表示し、利用者が旧設定を削除して追跡するCookie名を登録できるようにする。

移行時の問題が残っていてもスキーマ更新を完了し、他の正常な設定は通常どおり使用できるようにする。

移行時の問題はProfile ID、問題ID、旧設定の種類、元のHeader設定を持つ専用フィールドとして保持する。
コンパイラーはこのフィールドを参照しない。
Advanced JSONは、この専用フィールドを検証して損失なく再保存する。

#### FR-22 権限と公開情報

`cookies`権限を追加しない。

README、Privacy Policy、Chrome Web Storeの説明、審査用テスト手順を更新する。
利用者向け文言を英語で定義し、同じコミットですべての対応ロケールへ反映する。

#### FR-23 リリース管理

実装変更には`header-relay`のminor changesetを同梱する。
`CHANGELOG.md`と`package.json`のバージョンは手動で変更しない。

#### FR-24 DNR同期失敗

DNR更新に失敗した場合は、最後に正常適用されたDNR Session Rulesetを維持する。

Runtime Statusと監査ログへ同期エラーを記録する。
URL Probeには適用予定の結果を表示し、その結果が現在のDNR Session Rulesetへ未適用であることを明示する。

次の設定変更、Session State更新、拡張機能起動時に同期を再試行する。

ルール削除を含む更新が失敗した場合は、対象となるowned rule IDだけを削除する更新を直ちに一度再試行する。
再試行にも失敗した場合は削除要件の例外とし、旧ヘッダーが送信される可能性をRuntime Statusへ表示する。

## 対象外

- ChromeのCookieストアの参照、変更、削除。
- `chrome.cookies` APIと`cookies`権限の使用。
- `Domain`、`Path`、`Secure`、`HttpOnly`、`SameSite`などに基づくブラウザCookie動作の再現。
- 登録されていないCookieの自動追跡。
- Chromeが生成したCookieとの名前単位の統合。
- Profile間の同名Cookie競合の自動解決。
- Cookie値の伏せ字表示。
- 追跡Cookie値の永続保存とAdvanced JSONへの出力。
- Cookie名、Cookie値、Target Origin、利用者が入力した文字列の分析イベントへの記録。
- `main_frame`、`sub_frame`、`xmlhttprequest`以外のリソース種別へのCookie送信。

## 完了を判定する確認項目

| ID    | 確認内容                                                                                                                                                  | 期待する結果                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | 固定Cookieを登録し、Target Originへリクエストする                                                                                                         | Chromeが生成した`Cookie`を登録済み固定Cookieで置き換える                                                                                                         |
| AC-02 | 追跡対象名を登録し、正常な`Set-Cookie`を受信した後に次のリクエストを送る                                                                                  | 手動転記なしで取得値を`Cookie`へ含める                                                                                                                           |
| AC-03 | 登録していないCookieを含む`Set-Cookie`を受信する                                                                                                          | 未登録CookieをSession Stateと送信ヘッダーへ追加しない                                                                                                            |
| AC-04 | 同一Profileの固定Cookieと追跡Cookieへ同名Cookieを設定する                                                                                                 | 固定Cookieの値だけを送信する                                                                                                                                     |
| AC-05 | `Max-Age=0`と負数を持つ`Set-Cookie`をそれぞれ受信する                                                                                                     | どちらも同名の追跡Cookieを削除し、次のリクエストで送信しない                                                                                                     |
| AC-06 | 有効な`Max-Age`がなく、`Expires`が受信時刻以前の`Set-Cookie`を受信する                                                                                    | 同名の追跡Cookieを削除する                                                                                                                                       |
| AC-07 | 正常な`Set-Cookie`と不正な`Set-Cookie`を同じレスポンスで受信する                                                                                          | 正常なCookieだけを更新し、不正な1件の解析失敗を記録する                                                                                                          |
| AC-08 | 複数の有効なProfileが同じURLに異なるCookie名を設定する                                                                                                    | 一つの`Cookie`ヘッダーへ統合する                                                                                                                                 |
| AC-09 | 複数の有効なProfileが同じTarget Originに同名Cookieを設定する                                                                                              | Runtime Status、URL Probe、管理画面に競合内容を表示し、DNR Session Rulesetを空にする                                                                             |
| AC-10 | 一方のProfileだけがExcluded Pathに一致する                                                                                                                | 一致したProfileのCookieだけを除外し、別ProfileのCookieは送信する                                                                                                 |
| AC-11 | Profileに複数のTarget Originを登録し、一つでCookieを追跡する                                                                                              | 同じProfileの別Target Originにも追跡値を送信する                                                                                                                 |
| AC-12 | Profileを無効化する                                                                                                                                       | 対象Profileの追跡値とDNRルールを削除し、固定Cookie設定と追跡対象名は残す                                                                                         |
| AC-13 | ブラウザを再起動する                                                                                                                                      | 追跡値は消去され、固定Cookie設定と追跡対象名は残る                                                                                                               |
| AC-14 | 管理画面とPopupで取得済みCookieを確認する                                                                                                                 | 固定Cookieと追跡Cookieの値を伏せ字なしで表示する                                                                                                                 |
| AC-15 | Popup編集を有効にした固定CookieをPopupで変更する                                                                                                          | 設定を保存し、同じProfileの追跡値を消去して、次の対象リクエストへ新しい固定値を送信する                                                                          |
| AC-16 | Popupまたは管理画面で追跡Cookieを個別消去する                                                                                                             | 選択したCookieだけを消去してDNRルールを更新する                                                                                                                  |
| AC-17 | URL Probeへ、固定Cookie `fixed=1`と追跡Cookie `SID=tracked`を送る対象URLを入力する                                                                        | Profileごとの値と最終ヘッダー`fixed=1; SID=tracked`を表示する。同期エラーがない場合はDNR結果も一致する                                                           |
| AC-18 | Cookie取得、更新、削除、解析失敗を発生させる                                                                                                              | 解析できたCookie名と結果を記録する。名前を解析できない失敗では名前を省略し、すべてのケースでCookie値と元の`Set-Cookie`を記録しない                               |
| AC-19 | Cookie機能の分析イベントを確認する                                                                                                                        | 操作種別、画面、成否、対象件数を含み、Cookie名、Cookie値、Target Origin、入力文字列を含まない                                                                    |
| AC-20 | 有効かつPopup編集設定がないFixed Header `Cookie: a=1; token=x=y`を読み込む                                                                                | 順序と有効状態を引き継いだ`a=1`と`token=x=y`を一意な識別子で生成し、旧Headerを削除する                                                                           |
| AC-21 | 正常pairと不正pairが混在するFixed Header `Cookie`、またはCaptured Header `Cookie`を読み込む                                                               | 部分変換せず、旧Headerを実行対象から取り除いて移行時の問題へ保持する。スキーマ更新と他の正常設定の利用は継続する                                                 |
| AC-22 | Cookie名の大文字と小文字だけが異なる項目を設定する                                                                                                        | 別Cookieとして保持し、両方を送信する                                                                                                                             |
| AC-23 | 実ブラウザに`browser=1`を保存し、追跡Cookie `SID`だけを持つProfileで対象URL、`Set-Cookie: SID=tracked`を返すURL、Excluded Pathを順に開く                  | 取得前は`browser=1`、取得後の対象URLは`SID=tracked`、Excluded Pathでは`browser=1`を送信する                                                                      |
| AC-24 | 有効かつ非除外のProfileに追跡Cookieだけを設定し、値をまだ取得していない状態でリクエストする                                                               | `Cookie`を変更せず、Chromeが生成した既存値をそのまま送信する                                                                                                     |
| AC-25 | 設定画面とAdvanced JSONから汎用Fixed HeaderまたはCaptured Headerへ`Cookie`を新規登録する                                                                  | どちらも保存を拒否し、Cookie専用設定を使うよう同じ内容のエラーを表示する                                                                                         |
| AC-26 | 空名、RFCで禁止された文字、空値、引用値、`=`を含む値、同一種類内の無効項目を含む重複名を入力する                                                          | RFC 10025に適合する項目だけを保存し、重複は有効状態に関係なく拒否する。設定画面とAdvanced JSONの判定が一致する                                                   |
| AC-27 | Profile無効、Target Origin不一致、Excluded Path一致、権限なし、対象外リソース種別の各条件で`Set-Cookie`受信とリクエスト送信を試す                         | それぞれ追跡せず、Header Relayによる`Cookie`変更を行わない                                                                                                       |
| AC-28 | 同名Cookieについて更新、削除、不正値を異なる順序で同じレスポンスに含め、属性名の大文字と小文字も変える                                                    | 属性名の大小を区別せず、最後の正常な更新または削除を採用し、不正値は順序に参加させない                                                                           |
| AC-29 | 有効な正数`Max-Age`と過去`Expires`、0以下の`Max-Age`と未来`Expires`、不正な`Max-Age`と過去`Expires`をそれぞれ受信する                                     | 有効な`Max-Age`を優先し、不正な`Max-Age`は無視して`Expires`を評価する                                                                                            |
| AC-30 | Profile Aの固定Cookie、追跡Cookie、Profile Bの固定Cookieを複数ずつ設定する                                                                                | Profile設定順、各Profileの固定設定順、追跡設定順で`name=value`を`; `連結した一つのヘッダーを生成する                                                             |
| AC-31 | 同じTarget Originの二Profileに同名追跡Cookieを設定し、一方を未取得またはExcluded Path一致にする                                                           | 値とExcluded Pathに関係なく競合し、全DNR Session Ruleを削除する。Chromeが生成した本来のヘッダーは変更しない                                                      |
| AC-32 | `/assets/*.js`、`/static/**`、`/file?.txt`、`/API`、`/health`、`/%61`を設定し、階層、大小文字、末尾`/`、percent-encoding、query、fragmentを変えて確認する | `*`は`/`をまたがず、`**`はまたぎ、`?`は`/`以外の1文字だけに一致する。大小文字、末尾`/`、percent-encodingを区別し、queryとfragmentを無視する                      |
| AC-33 | 固定Cookieまたは追跡Cookieの追加、編集、並べ替え、有効状態、削除、Popup編集設定を変更する                                                                 | 変更したProfileの全追跡値を消去する                                                                                                                              |
| AC-34 | Cookie監査ログを1001件追加し、8日前のログを含め、ブラウザを再起動する                                                                                     | IndexedDBには最大1000件かつ7日以内だけが残り、ログ表示用URLは消える。Cookie値と元の`Set-Cookie`は残らない                                                        |
| AC-35 | Popup編集を無効にした固定Cookie、および現在ページに一致しないProfileをPopupで確認する                                                                     | 固定Cookieを編集できず、一致しないProfileのCookieを表示しない                                                                                                    |
| AC-36 | 管理画面とPopupからProfile単位の全件消去を実行する                                                                                                        | 対象Profileの追跡値をすべて消去し、固定Cookie設定と追跡対象名は残す                                                                                              |
| AC-37 | 固定Cookie、追跡対象名、追跡値、移行時の問題を持つ設定をAdvanced JSONで確認する                                                                           | 固定Cookie、追跡対象名、移行時の問題だけを含み、追跡値と監査ログを含まない                                                                                       |
| AC-38 | ビルド成果物と公開文書を確認する                                                                                                                          | `cookies`権限を含まず、README、Privacy Policy、Store説明、審査手順、英語と全対応ロケールがCookie仕様と一致する                                                   |
| AC-39 | 実装PRの変更ファイルを確認する                                                                                                                            | `header-relay`のminor changesetを含み、`CHANGELOG.md`と`package.json`のバージョンを手動変更していない                                                            |
| AC-40 | Cookie更新とowned rule削除を含むDNR同期をそれぞれ失敗させる                                                                                               | 最後に成功したRulesetを維持し、Runtime Statusと監査ログにエラーを表示する。削除失敗時はremove-only更新を一度再試行し、再失敗時は旧ヘッダー送信の可能性を表示する |
| AC-41 | 複数Target Originのうち一つのホスト権限を取り消す                                                                                                         | 対象Profileの追跡値をすべて消去し、許可済みOriginだけでDNRルールを再生成する                                                                                     |
| AC-42 | 拡張機能を無効化、再読み込み、更新する                                                                                                                    | 追跡値を消去し、固定Cookie設定と追跡対象名は残す                                                                                                                 |
| AC-43 | Popup編集設定がある単一pairのFixed Header `Cookie`と、複数pairまたは変換不能なselect選択肢を持つHeaderを移行する                                          | 単一pairと同じCookie名の選択肢だけを専用CookieのPopup設定へ変換し、それ以外は部分変換せず移行時の問題へ保持する                                                  |
| AC-44 | 追跡値を持つProfileのTarget Originを追加、編集、無効化、削除する                                                                                          | いずれの変更でも対象Profileの追跡値をすべて消去し、変更後の許可済みOriginだけでDNRルールを再生成する                                                             |
| AC-45 | 追跡Cookieへ送信先と一致しない`Domain`と`Path`、HTTP上の`Secure`、`HttpOnly`、`SameSite`を付けて値を設定する                                              | 各属性を送信条件へ反映せず、ProfileのTarget OriginとExcluded Pathだけで送信可否を決める                                                                          |
| AC-46 | Cookie競合とDNR同期の成功、失敗を発生させる                                                                                                               | 監査ログに競合したCookie名とProfile、およびDNR同期結果を記録し、Cookie値を記録しない                                                                             |
| AC-47 | 同期エラー後に設定変更、Session State更新、拡張機能起動を個別に発生させる                                                                                 | 三つの契機それぞれでDNR同期を再試行する                                                                                                                          |
| AC-48 | 一つのProfileに、個別には正常だが変換後のCookie名が重複する複数の旧Fixed Header `Cookie`を読み込む                                                        | 重複に関係する旧Headerをすべて部分変換せず、非実行の移行時の問題へ保持する                                                                                       |
| AC-49 | 移行時の問題を含むAdvanced JSONを表示し、そのまま適用する                                                                                                 | 専用フィールドを検証して損失なく再保存し、コンパイラーとDNRルール生成では参照しない                                                                              |
| AC-50 | `main_frame`、`sub_frame`、`xmlhttprequest`の各リソース種別で、登録済みCookieの`Set-Cookie`受信と次のリクエスト送信を行う                                 | 三つの種別それぞれで追跡値を更新し、対象リクエストの`Cookie`ヘッダーへ反映する                                                                                   |

## 要件と確認項目の対応

| 要件  | 確認項目                                                      |
| ----- | ------------------------------------------------------------- |
| FR-01 | AC-01、AC-02、AC-14、AC-15、AC-16、AC-36                      |
| FR-02 | AC-25                                                         |
| FR-03 | AC-04、AC-22、AC-26                                           |
| FR-04 | AC-02、AC-03、AC-27、AC-50                                    |
| FR-05 | AC-07、AC-28                                                  |
| FR-06 | AC-05、AC-06、AC-29、AC-45                                    |
| FR-07 | AC-11、AC-13、AC-37                                           |
| FR-08 | AC-12、AC-13、AC-15、AC-16、AC-33、AC-36、AC-41、AC-42、AC-44 |
| FR-09 | AC-01、AC-23、AC-24、AC-27、AC-50                             |
| FR-10 | AC-04、AC-24                                                  |
| FR-11 | AC-08、AC-30                                                  |
| FR-12 | AC-09、AC-31                                                  |
| FR-13 | AC-01、AC-23、AC-24、AC-30                                    |
| FR-14 | AC-10、AC-23、AC-32                                           |
| FR-15 | AC-14、AC-16、AC-25、AC-26、AC-33、AC-36                      |
| FR-16 | AC-14、AC-15、AC-16、AC-35、AC-36                             |
| FR-17 | AC-09、AC-10、AC-17、AC-40                                    |
| FR-18 | AC-07、AC-18、AC-34、AC-40、AC-46                             |
| FR-19 | AC-19                                                         |
| FR-20 | AC-20、AC-21、AC-37、AC-43、AC-48、AC-49                      |
| FR-21 | AC-21、AC-37、AC-49                                           |
| FR-22 | AC-38                                                         |
| FR-23 | AC-39                                                         |
| FR-24 | AC-40、AC-47                                                  |
