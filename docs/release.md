# リリースフロー

このリポジトリは [changesets](https://github.com/changesets/changesets) でバージョン管理とリリースを行います。
パッケージは npm には公開せず、Git タグと GitHub Release(拡張機能の zip 付き)を作成します。

## 全体の流れ

```
機能開発 PR(changeset を含める)
        │  merge
        ▼
main への push ── Release ワークフローが「chore: release」PR を自動作成・更新
        │  merge
        ▼
main への push ── Release ワークフローが以下を実行
                  1. v{version} タグを作成
                  2. CHANGELOG を本文にした GitHub Release を作成
                  3. 拡張機能の zip をビルドして Release に添付
```

## 開発者がやること

### 1. 変更に changeset を添える

リリースノートに載せたい変更(機能追加・バグ修正など)を含む PR では、changeset を作成してコミットします:

```sh
pnpm changeset
```

対話形式で以下を入力します:

- **バージョンの種類**: `major` / `minor` / `patch`
- **変更内容の説明**: CHANGELOG にそのまま載る文章

`.changeset/` 配下に Markdown ファイルが生成されるので、変更と一緒にコミットしてください。

リリース不要な変更(CI 修正、ドキュメントのみ等)には changeset は不要です。

### 2. リリース PR をマージする

changeset を含む PR が main にマージされると、Release ワークフローが
「**chore: release**」という PR を自動で作成(既にあれば更新)します。この PR は:

- `package.json` の version を bump
- 溜まっている changeset を `CHANGELOG.md` に反映して削除

リリースしたいタイミングでこの PR をマージしてください。マージすると自動で:

1. `v{version}` タグが作成される
2. GitHub Release が作成される(本文は CHANGELOG のエントリ)
3. `wxt zip` でビルドした拡張機能の zip が Release に添付される

## バージョンと manifest

拡張機能の manifest version は `package.json` の `version` から自動で設定されます
(WXT のデフォルト挙動)。`wxt.config.ts` にバージョンをハードコードしないでください。

## 補足・注意点

- **リリース PR には CI が走りません**: デフォルトの `GITHUB_TOKEN` で作成された PR は
  `pull_request` ワークフローをトリガーしないという GitHub の仕様によるものです。
  リリース PR の内容は version bump と CHANGELOG のみなのでリスクは低いですが、
  ブランチ保護で CI を必須にする場合は PAT か GitHub App トークンを
  `changesets/action` の checkout に渡す構成への変更が必要です。
- **Chrome Web Store への提出は手動です**: Release に添付された zip をダウンロードして
  ダッシュボードからアップロードしてください(`docs/chrome-web-store/` 参照)。
- 次のリリースに含まれる変更を確認するには `pnpm changeset status` を実行します。
