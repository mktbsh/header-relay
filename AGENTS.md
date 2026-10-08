# Agent Instructions

## 公開リポジトリ

- このリポジトリは public。コミット、コミットメッセージ、PR 本文に、トークン・秘密鍵・ローカルの絶対パス・エージェントのセッション URL を含めない。

## 検証

- CI(`.github/workflows/ci.yml`)は `pnpm lint` / `pnpm compile` / `pnpm test` / `pnpm build` を実行する。変更後はこれらと `pnpm fmt:check` をローカルで通す。
- UI の変更は `pnpm e2e` で確認する。画面の目視確認の手順は [docs/visual-review.md](docs/visual-review.md)。

## ドキュメント

- 維持する仕様は `docs/specs/`、設計判断は `docs/adr/`、ドメイン用語は [CONTEXT.md](CONTEXT.md) に置く。
- 作業途中のメモや下書きは Git 管理外の `.context/` に置く。

## changeset(必須ルール)

このリポジトリは changesets 前提で運用する。詳細は [docs/release.md](docs/release.md)。

- 拡張機能の挙動に影響する変更(機能追加・修正・依存更新による挙動変化)を含むコミット/PR には、必ず changeset を同梱する。
- `pnpm changeset` は対話式なので、エージェントは `.changeset/<適当なケバブケース名>.md` を直接作成する:

  ```md
  ---
  "header-relay": patch
  ---

  変更内容の説明(日本語。CHANGELOG にそのまま載る)
  ```

  バージョン種別は `patch` / `minor` / `major` から変更内容に応じて選ぶ。

- changeset 不要なのは、CI・ドキュメント・テストのみなどリリースノートに載せない変更だけ。不要と判断した場合はその旨を作業報告に一言添える。
- `CHANGELOG.md` と `package.json` の `version` は手動で編集しない。`changeset version` / `changeset tag` をローカルで実行しない(Release ワークフローが行う)。
- `wxt.config.ts` にバージョンをハードコードしない(manifest version は `package.json` から自動設定)。

## i18n(UIロケール)

- 翻訳の正は `public/_locales/en/messages.json`。他ロケール(ja / ko / es / fr / de / zh_CN / zh_TW)は同一キー構成で全キーを翻訳する。
- 翻訳は API による自動化は行わず、AI エージェントがローカルで直接作成・更新する(2026-07 判断。自動化パイプラインは時期尚早として見送り)。
- en のキーを追加・変更したら、同じコミットで全ロケールへ反映する。`$1` 等のプレースホルダーと `\n` は原文どおり保持する。
- `extDescription` は Chrome Web Store の制限(132文字以内)を守る。
