import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-solid"],
  srcDir: "src",

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    icons: {
      16: "icon-16.png",
      24: "icon-24.png",
      48: "icon-48.png",
      96: "icon-96.png",
      128: "icon-128.png",
    },
    permissions: [
      "storage",
      "webRequest",
      "declarativeNetRequest",
      "declarativeNetRequestWithHostAccess",
    ],
    // Local HTTP development works without an extra permission prompt. Access to
    // every other host remains opt-in: the manage page requests it when a Target
    // Origin is saved.
    // E2E builds keep the old required grant (HR_E2E=1) because Chrome's permission
    // dialog cannot be automated from Playwright.
    ...(process.env.HR_E2E === "1"
      ? { host_permissions: ["<all_urls>"] }
      : {
          host_permissions: ["http://localhost/*"],
          optional_host_permissions: ["http://*/*", "https://*/*"],
        }),
    action: {
      default_title: "Header Relay",
      default_icon: {
        16: "icon-16.png",
        24: "icon-24.png",
        48: "icon-48.png",
        96: "icon-96.png",
        128: "icon-128.png",
      },
    },
    commands: {
      "toggle-all-profiles": {
        description: "__MSG_commandToggleAllProfiles__",
      },
    },
    options_ui: {
      page: "manage.html",
      open_in_tab: true,
    },
  },
});
