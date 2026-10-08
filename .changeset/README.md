# Changesets

このディレクトリは [changesets](https://github.com/changesets/changesets) が管理しています。

リリースに含めたい変更を加えたら、次のコマンドで changeset を作成してください:

```sh
pnpm changeset
```

バージョンの種類(major / minor / patch)と変更内容の説明を対話形式で入力すると、
`.changeset/` 配下に Markdown ファイルが生成されます。これを変更と一緒にコミットしてください。

リリースフローの詳細は `docs/release.md` を参照してください。
