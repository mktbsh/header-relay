import { Navigate, Outlet, useLocation } from "@tanstack/solid-router";
import { createEffect, For, Show } from "solid-js";

import { t } from "../../../lib/i18n";
import { useManageRouteContext } from "../App";
import type { ProfileSectionKey } from "../editor-state";
import { profilePath, profileTabs, type ProfileTab, viewedProfileLocation } from "../navigation";

const sectionKeysByTab: Record<ProfileTab, ProfileSectionKey[]> = {
  overview: ["basics"],
  origins: ["origins"],
  headers: ["fixed", "capture"],
  exclude: ["exclude"],
  cookies: ["cookies"],
  probe: [],
};

export function ProfileLayout(props: { profileId: string }) {
  const context = useManageRouteContext();
  const location = useLocation();
  const active = () => context.profiles().find((profile) => profile.id === props.profileId);
  const fallbackProfile = () => context.profiles()[0];
  const fallbackPath = () => {
    const profile = fallbackProfile();
    if (!profile) return undefined;
    return profilePath(profile.id, viewedProfileLocation(location().pathname)?.tab);
  };
  const tabDirty = (tab: ProfileTab) =>
    sectionKeysByTab[tab].some((key) => context.profileSectionDirty(props.profileId, key));

  return (
    <Show
      when={active()}
      fallback={<Show when={fallbackPath()}>{(path) => <Navigate to={path()} replace />}</Show>}
    >
      {(profile) => (
        <section class="space-y-5">
          <div>
            <h2 class="hr-title truncate">{profile().name}</h2>
          </div>

          <nav
            class="flex overflow-x-auto border-b whitespace-nowrap"
            style={{ "border-color": "var(--ios-separator)" }}
            aria-label={profile().name}
          >
            <For each={profileTabs}>
              {(tab) => {
                const path = () => profilePath(profile().id, tab.id);
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
                    class={`hr-tab flex shrink-0 items-center gap-1.5 ${
                      isActive() ? "hr-tab-active" : ""
                    }`}
                    aria-current={isActive() ? "page" : undefined}
                    data-testid={`profile-tab-${tab.id}`}
                  >
                    <span>{tab.label}</span>
                    <Show when={tabDirty(tab.id)}>
                      <span
                        class="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                        aria-label={t("unsavedChanges")}
                      />
                    </Show>
                  </a>
                );
              }}
            </For>
          </nav>

          <div class="min-w-0">
            <Outlet />
          </div>
        </section>
      )}
    </Show>
  );
}
