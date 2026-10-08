import { describe, expect, it } from "vitest";

import de from "../../public/_locales/de/messages.json";
import en from "../../public/_locales/en/messages.json";
import es from "../../public/_locales/es/messages.json";
import fr from "../../public/_locales/fr/messages.json";
import ja from "../../public/_locales/ja/messages.json";
import ko from "../../public/_locales/ko/messages.json";
import zhCN from "../../public/_locales/zh_CN/messages.json";
import zhTW from "../../public/_locales/zh_TW/messages.json";

describe("UI locales", () => {
  it("keeps every locale on the English message key contract", () => {
    const expectedKeys = Object.keys(en).sort();
    const locales = { de, es, fr, ja, ko, zhCN, zhTW };

    for (const messages of Object.values(locales)) {
      expect(Object.keys(messages).sort()).toEqual(expectedKeys);
    }
  });
});
