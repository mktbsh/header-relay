import { readFileSync } from "fs";
import path from "path";

import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";

import { openManagePage } from "./pages/manage";
import { openPopupPage } from "./pages/popup";

const pathToExtension = path.resolve(".output/chrome-mv3");
const assetDir = path.resolve("docs/chrome-web-store/assets");

const screenshot = (page: Page, name: string) =>
  page.screenshot({
    path: path.join(assetDir, `${name}.png`),
    animations: "disabled",
    caret: "hide",
  });

const centerPopupCss = `
  html { height: 100%; }
  body {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ios-bg, #f2f2f7);
  }
`;

function loadMessages(lang: string): Record<string, { message: string }> {
  const filePath = path.resolve(`public/_locales/${lang}/messages.json`);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

async function createExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    args: [
      "--disable-gpu",
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  let background: { url(): string };
  [background] = context.serviceWorkers();
  if (!background) background = await context.waitForEvent("serviceworker");
  const extensionId = background.url().split("/")[2];

  return { context, extensionId };
}

async function injectLocale(context: BrowserContext, lang: string) {
  const messages = loadMessages(lang);
  await context.addInitScript((msgs) => {
    if (typeof chrome !== "undefined" && chrome.i18n) {
      const original = chrome.i18n.getMessage.bind(chrome.i18n);
      chrome.i18n.getMessage = (key: string, substitutions?: string | string[]) => {
        const entry = (msgs as Record<string, { message: string }>)[key];
        if (!entry) return original(key, substitutions);
        const subs = typeof substitutions === "string" ? [substitutions] : (substitutions ?? []);
        return entry.message.replace(
          /\$(\d)/g,
          (_, index: string) => subs[Number(index) - 1] ?? "",
        );
      };
    }
  }, messages);
}

async function ensureProfileEnabled(manage: Awaited<ReturnType<typeof openManagePage>>) {
  const toggle = manage.profileToggle();
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
}

async function captureOverview(ctx: BrowserContext, extId: string, suffix: string) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const manage = await openManagePage(page, extId);

  await ensureProfileEnabled(manage);
  await expect(manage.statusTiles()).toHaveCount(8);

  await screenshot(page, `screenshot-01-overview${suffix}`);
  await page.close();
}

async function capturePopupEnabled(ctx: BrowserContext, extId: string, suffix: string) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const manage = await openManagePage(page, extId);
  await ensureProfileEnabled(manage);

  const popupPage = await ctx.newPage();
  await popupPage.setViewportSize({ width: 1280, height: 800 });
  const popup = await openPopupPage(popupPage, extId);
  await expect(popup.title()).toHaveText("Header Relay");
  await popupPage.addStyleTag({ content: centerPopupCss });

  await screenshot(popupPage, `screenshot-02-popup${suffix}`);
  await popupPage.close();
  await page.close();
}

async function captureUrlProbe(ctx: BrowserContext, extId: string, suffix: string) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const manage = await openManagePage(page, extId);

  await ensureProfileEnabled(manage);

  await page.goto(`chrome-extension://${extId}/manage.html#/profiles/profile-local-dev/url-probe`);
  await page.waitForTimeout(300);

  const input = manage.mainContent().getByRole("textbox");
  await input.fill("http://localhost:3000/api/me");
  await manage
    .mainContent()
    .getByRole("button", { name: /Run probe|プローブを実行|프로브 실행/ })
    .click();

  await expect(manage.mainContent().locator(".grid .hr-card").first()).toBeVisible();

  await screenshot(page, `screenshot-03-url-probe${suffix}`);
  await page.close();
}

async function captureHeaders(ctx: BrowserContext, extId: string, suffix: string) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const manage = await openManagePage(page, extId);

  await page.goto(`chrome-extension://${extId}/manage.html#/profiles/profile-local-dev/headers`);
  await page.waitForTimeout(300);

  const content = manage.mainContent();
  const addBtn = content.getByRole("button", {
    name: /Add fixed header|固定ヘッダーを追加|고정 헤더 추가/,
  });

  const headers = [
    { name: "X-Request-ID", value: "req_a1b2c3d4e5f6" },
    { name: "X-Trace-ID", value: "trace-20260713-001" },
    { name: "Authorization", value: "Bearer eyJhbGciOiJIUzI1NiIs..." },
  ];

  for (const h of headers) {
    await addBtn.click();
    const nameInput = content.getByPlaceholder("x-session-token", { exact: true }).last();
    const row = nameInput.locator("..");
    await nameInput.fill(h.name);
    await row.getByRole("textbox").nth(1).fill(h.value);
    await row.getByRole("switch").click();
  }

  await screenshot(page, `screenshot-04-headers${suffix}`);
  await page.close();
}

async function capturePopupDisabled(ctx: BrowserContext, extId: string, suffix: string) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const popup = await openPopupPage(page, extId);

  await expect(popup.root()).toBeVisible();
  await page.addStyleTag({ content: centerPopupCss });

  await screenshot(page, `screenshot-05-i18n-privacy${suffix}`);
  await page.close();
}

const test = base.extend({});

const locales = [
  { lang: "en", suffix: "" },
  { lang: "ja", suffix: "-ja" },
  { lang: "ko", suffix: "-ko" },
] as const;

for (const { lang, suffix } of locales) {
  test.describe(`Chrome Web Store Screenshots (${lang})`, () => {
    test.describe.configure({ mode: "serial" });

    let ctx: BrowserContext;
    let extId: string;

    test.beforeAll(async () => {
      ({ context: ctx, extensionId: extId } = await createExtensionContext());
      await injectLocale(ctx, lang);
    });
    test.afterAll(async () => {
      await ctx?.close();
    });

    test("01: overview", () => captureOverview(ctx, extId, suffix));
    test("02: popup enabled", () => capturePopupEnabled(ctx, extId, suffix));
    test("03: url-probe", () => captureUrlProbe(ctx, extId, suffix));
    test("04: headers", () => captureHeaders(ctx, extId, suffix));
    test("05: popup disabled", () => capturePopupDisabled(ctx, extId, suffix));
  });
}
