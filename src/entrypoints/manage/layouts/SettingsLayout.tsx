import { Outlet, useLocation } from "@tanstack/solid-router";
import { createEffect, For } from "solid-js";

import { t } from "../../../lib/i18n";
import { settingsPath, settingsTabs } from "../navigation";

export function SettingsLayout() {
  const location = useLocation();

  return (
    <section class="space-y-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <h2 class="hr-title">{t("settingsTitle")}</h2>

      <nav
        class="flex overflow-x-auto border-b whitespace-nowrap"
        style={{ "border-color": "var(--ios-separator)" }}
        aria-label={t("settingsTitle")}
      >
        <For each={settingsTabs}>
          {(tab) => {
            const path = () => settingsPath(tab.id);
            const isActive = () => location().pathname === path();
            return (
              <a
                ref={(element) => {
                  createEffect(() => {
                    if (isActive()) {
                      element.scrollIntoView({ block: "nearest", inline: "nearest" });
                    }
                  });
                }}
                href={`#${path()}`}
                class={`hr-tab shrink-0 ${isActive() ? "hr-tab-active" : ""}`}
                aria-current={isActive() ? "page" : undefined}
                data-testid={`settings-tab-${tab.id}`}
              >
                {tab.label}
              </a>
            );
          }}
        </For>
      </nav>

      <div class="min-h-0 min-w-0 lg:flex-1">
        <Outlet />
      </div>
    </section>
  );
}
