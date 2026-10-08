import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetDir = path.join(rootDir, "docs", "chrome-web-store", "assets");
const sourceDir = path.join(assetDir, "source");

mkdirSync(sourceDir, { recursive: true });

// --- Icon copy ---
const publicIcon = path.join(rootDir, "public", "icon-128.png");
const publicMascot = path.join(rootDir, "public", "header-relay-mascot.png");
const mascotAsset = path.join(assetDir, "header-relay-mascot.png");
const storeIcon = path.join(assetDir, "store-icon-128.png");

if (!existsSync(mascotAsset)) {
  if (existsSync(publicMascot)) {
    copyFileSync(publicMascot, mascotAsset);
  } else if (existsSync(publicIcon)) {
    copyFileSync(publicIcon, mascotAsset);
  } else {
    throw new Error(
      "Missing mascot source. Expected public/header-relay-mascot.png or public/icon-128.png.",
    );
  }
}

if (!existsSync(publicIcon)) {
  throw new Error("Missing public/icon-128.png. Generate extension icons before store assets.");
}
copyFileSync(publicIcon, storeIcon);

// --- Chrome finder ---
const findChrome = () => {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Chrome executable not found. Set CHROME_BIN to generate promo tiles.");
};

const chrome = findChrome();
const mascotUrl = pathToFileURL(mascotAsset).href;

// --- Shared HTML shell (iOS-style from DESIGN.md) ---
const shell = (content, { width, height, title }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      font-family: system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      color: #1c1c1e; background: #f2f2f7;
      -webkit-font-smoothing: antialiased;
    }
    .screen { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .eyebrow { color: #007aff; font-size: 13px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
    h1 { font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; }
    p { color: rgba(60,60,67,0.6); font-size: 13px; line-height: 1.3; }
  </style>
</head>
<body>${content}</body>
</html>`;

const renderPng = ({ name, width, height, title, content }) => {
  const htmlPath = path.join(sourceDir, `${name}.html`);
  const pngPath = path.join(assetDir, `${name}.png`);
  writeFileSync(htmlPath, shell(content, { width, height, title }));
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
  return pngPath;
};

// --- Promo tiles only ---
const smallPromo = `<main class="screen" style="padding:24px 28px;gap:18px">
  <img src="${mascotUrl}" alt="" style="width:100px;height:100px;border-radius:24px;box-shadow:0 8px 24px rgba(0,0,0,.12)" />
  <div>
    <div class="eyebrow" style="font-size:11px">Header Relay</div>
    <h1 style="margin-top:4px;max-width:220px;line-height:1.05">HTTP headers, relayed.</h1>
    <p style="margin-top:6px;max-width:200px">Capture, attach, and test locally.</p>
  </div>
</main>`;

const marquee = `<main class="screen" style="padding:48px 72px;gap:48px">
  <img src="${mascotUrl}" alt="" style="width:200px;height:200px;border-radius:44px;box-shadow:0 16px 40px rgba(0,0,0,.12)" />
  <div>
    <div class="eyebrow">Header Relay</div>
    <h1 style="font-size:56px;max-width:800px">Capture once. Relay to matching requests.</h1>
    <p style="font-size:20px;max-width:700px;margin-top:12px">A developer extension for HTTP headers, trace IDs, gateway metadata, and internal testing. Local-only. Multilingual.</p>
  </div>
</main>`;

const outputs = [
  renderPng({
    name: "small-promo-tile-440x280",
    width: 440,
    height: 280,
    title: "Small Promo",
    content: smallPromo,
  }),
  renderPng({
    name: "marquee-promo-tile-1400x560",
    width: 1400,
    height: 560,
    title: "Marquee Promo",
    content: marquee,
  }),
];

console.log(`Generated ${outputs.length} promo tile(s) + store-icon-128.png`);
for (const output of outputs) console.log(path.relative(rootDir, output));
