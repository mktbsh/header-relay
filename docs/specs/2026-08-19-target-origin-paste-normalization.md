---
title: Target Origin貼り付け時の正規化
created_at: 2026-08-19
updated_at: 2026-08-19
updated_by: codex-gpt-5
status: accepted
---

# Target Origin貼り付け時の正規化

## Problem Statement

利用者がTarget Originを登録するとき、Webページからコピーした完全なURLを貼り付けると、パス、クエリ、フラグメントを手作業で削除しなければ保存できない。

## Solution

Target Origin入力欄へ有効なHTTPまたはHTTPSの絶対URLを貼り付けた場合、その入力欄全体をURLのoriginへ置き換える。
たとえば、`https://example.com/xxxxx/cccc`は`https://example.com`になる。

## User Stories

1. Target Originを登録する利用者として、完全なWeb URLをそのまま貼り付けたい。手作業でパスを削除せずに設定できるためである。
2. Target Originを登録する利用者として、ポートを含むURLを貼り付けたい。`http://localhost:3000`のような開発環境のoriginを正しく保持できるためである。
3. Target Originを編集する利用者として、無効なURLを貼り付けたときは入力を失いたくない。従来どおり自分で修正できるためである。
4. Target Originを手入力する利用者として、入力途中の値を自動変換されたくない。意図した文字列を最後まで入力できるためである。

## Implementation Decisions

- 正規化はTarget Origin入力欄の貼り付け操作だけで行う。
- 貼り付けた文字列全体が有効なHTTPまたはHTTPSの絶対URLである場合だけ、標準URLパーサーが返すoriginへ変換する。
- 変換結果は選択範囲への部分挿入ではなく、対象入力欄の値全体を置き換える。
- 無効なURLとHTTP／HTTPS以外のURLでは貼り付けの既定動作を維持する。
- 手入力、JSON Editor、Config migration、保存時のスキーマ検証は変更しない。
- 新しい永続状態、設定項目、翻訳文言、依存パッケージは追加しない。

## Testing Decisions

- 入力欄の貼り付けシームを通して、パス付きHTTPS URLがoriginへ置き換わる外部挙動を確認する。
- ポート付きHTTP URLがポートを保持することを確認する。
- 無効なURLとHTTP／HTTPS以外のURLが自動変換されないことを確認する。
- 既存のManage画面テストと同じブラウザ操作の検証方法を再利用する。

## Out of Scope

- 手入力中、blur時、保存時の自動正規化。
- 相対URLやHTTP／HTTPS以外のURLの変換。
- JSON Editorやインポート経路の値の自動修正。
- 重複originの自動統合。

## Further Notes

URLのorigin化にはブラウザ標準の`URL`を使う。
標準挙動によりホスト名の大文字小文字、既定ポート、認証情報などもorigin表現へ正規化される。
