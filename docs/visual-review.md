# UI visual review

AI Agent が UI を変更した後、人間が Playwright の HTML レポートで画面を確認する。
スクリーンショットとレポートは `test-results/` と `playwright-report/` に生成され、どちらも Git 管理外とする。

## 実行方法

```sh
pnpm visual:review
pnpm visual:review:open
```

`visual:review` は拡張機能をビルドした後、manage 画面の全セクションを次の viewport で撮影する。
ブラウザは拡張機能を利用できる Chromium の新しい headless mode (`channel: "chromium"`) で起動する。

- desktop: 1440 x 900
- mobile: 390 x 844

撮影対象はProfileのOverview、Target Origins、Headers、Excluded Paths、Cookies、URL Probeと、SettingsのGeneral、Audit Logs、JSON Editor。

## AI Agent の完了条件

UI を変更した場合は、通常のテストとビルドに加えて `pnpm visual:review` を実行する。
最終報告には `playwright-report/index.html` へのローカルリンクを記載し、人間が各スクリーンショットを確認できる状態にする。

スクリーンショットを visual regression の baseline としてコミットする `toHaveScreenshot()` は使用しない。
確認用画像は `testInfo.attach()` で HTML レポートに添付する。
