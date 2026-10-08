const WEBSITE_ORIGIN = "https://webext.hsb.horse";

interface URLBuilderProps {
  params?: Record<string, string>;
  hash?: string;
}

interface HeaderRelayURLBuilder {
  withLang?: boolean;
}

const supportedLangs = ["de", "en", "es", "fr", "ja", "ko", "zh_CN", "zh_TW"];

function resolveLang(lang: string): string {
  if (!lang || lang === "en") return "";
  const normalized = lang.replace("-", "_");
  if (supportedLangs.includes(normalized)) {
    return normalized.replace("_", "-").toLowerCase();
  }
  const langPrefix = normalized.split("_")[0] || "";
  if (!langPrefix || langPrefix === "en") return "";
  if (supportedLangs.includes(langPrefix)) {
    return langPrefix;
  }
  return "";
}

export function buildHeaderRelayURL({ withLang = true }: HeaderRelayURLBuilder = {}) {
  const lang = resolveLang(withLang ? browser.i18n.getUILanguage() : "");
  const basePath = `${lang ? `/${lang}` : ""}/extensions/header-relay/`;

  const buildURL = (path: string, props: URLBuilderProps = {}) => {
    const fullPath = `${basePath}${path.startsWith("/") ? path.slice(1) : path}`;
    const url = new URL(fullPath, WEBSITE_ORIGIN);

    const { params, hash } = props;
    Object.entries(params || {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    if (hash) {
      url.hash = hash;
    }

    return url.toString();
  };

  const curry =
    (path: string) =>
    (props: URLBuilderProps = {}) =>
      buildURL(path, props);

  return {
    build: buildURL,
    home: curry(""),
    privacy: curry("privacy"),
  };
}
