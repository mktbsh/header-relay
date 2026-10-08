import { createResource, For, Show } from "solid-js";

import { buildHeaderRelayURL } from "@/const";

import { Toggle } from "../../../components/Toggle";
import type { ProfileMoveDirection } from "../../../lib/domain/profile-operations";
import type { Profile } from "../../../lib/domain/types";
import { t } from "../../../lib/i18n";
import { STORE_REVIEW_URL } from "../../../lib/review-prompt/state";
import { resolveFeedbackFormUrl } from "../feedback-url";
import { profileSwitchPath } from "../navigation";
import { ReviewPromptCard } from "./ReviewPromptCard";

export function ProfileSidebar(props: {
  profiles: () => Profile[];
  selectedId: () => string;
  currentPathname: () => string;
  profileDirty: (profileId: string) => boolean;
  onSelectProfile: (profileId: string) => void;
  onToggleProfile: (profileId: string, enabled: boolean) => void;
  onMoveProfile: (profileId: string, direction: ProfileMoveDirection) => void;
  onAddProfile: () => void;
}) {
  // The hidden fields need the installation id from storage, so the href only exists
  // once that read resolves.
  const [feedbackUrl] = createResource(() => resolveFeedbackFormUrl("int-bottom-nav"));

  return (
    <aside
      class="flex min-h-0 flex-col border-b p-4 lg:overflow-y-auto lg:border-r lg:border-b-0"
      style={{ "border-color": "var(--ios-separator)", background: "var(--ios-card)" }}
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <h2 class="hr-section-label">{t("profilesLabel")}</h2>
        <button
          type="button"
          class="hr-btn h-8 w-8 justify-center p-0"
          aria-label={t("createProfileTitle")}
          title={t("createProfileTitle")}
          onClick={props.onAddProfile}
        >
          +
        </button>
      </div>

      <nav
        class="mb-3 flex min-w-0 gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:pb-0"
        aria-label={t("profilesLabel")}
        data-testid="profile-list"
      >
        <For each={props.profiles()}>
          {(profile, index) => {
            const isActive = () => props.selectedId() === profile.id;
            const isFirst = () => index() === 0;
            const isLast = () => index() === props.profiles().length - 1;
            return (
              <div
                class={`hr-nav-item hr-profile-item shrink-0 gap-2 ${
                  isActive() ? "hr-nav-item-active" : ""
                }`}
                data-testid={`profile-${profile.id}`}
              >
                <a
                  class="flex min-w-0 flex-1 items-center gap-2 self-stretch"
                  href={`#${profileSwitchPath(profile.id, props.currentPathname())}`}
                  aria-current={isActive() ? "page" : undefined}
                  onClick={() => props.onSelectProfile(profile.id)}
                >
                  <span class="min-w-0 flex-1 truncate text-left">{profile.name}</span>
                  <Show when={props.profileDirty(profile.id)}>
                    <span
                      class="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                      aria-label={t("unsavedChanges")}
                    />
                  </Show>
                </a>
                <Toggle
                  checked={profile.enabled}
                  label={`${t("profileEnabledLabel")}: ${profile.name}`}
                  onChange={(enabled) => props.onToggleProfile(profile.id, enabled)}
                />
                <div class="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-[var(--ios-fill)] disabled:opacity-30"
                    aria-label={t("moveProfileUp", profile.name)}
                    title={t("moveProfileUp", profile.name)}
                    disabled={isFirst()}
                    onClick={() => props.onMoveProfile(profile.id, "up")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-[var(--ios-fill)] disabled:opacity-30"
                    aria-label={t("moveProfileDown", profile.name)}
                    title={t("moveProfileDown", profile.name)}
                    disabled={isLast()}
                    onClick={() => props.onMoveProfile(profile.id, "down")}
                  >
                    ↓
                  </button>
                </div>
              </div>
            );
          }}
        </For>
      </nav>

      <ReviewPromptCard />

      <a
        href="#/settings"
        class={`hr-nav-item mt-3 ${
          props.currentPathname().startsWith("/settings") ? "hr-nav-item-active" : ""
        }`}
        data-testid="settings-link"
        aria-current={props.currentPathname().startsWith("/settings") ? "page" : undefined}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
        <span>{t("settingsTitle")}</span>
      </a>

      <footer
        class="mt-5 flex shrink-0 items-center gap-1.5 border-t pt-3"
        style={{ "border-color": "var(--ios-separator)" }}
        data-testid="bottom-nav"
      >
        <a
          class="hr-sidebar-link"
          href={buildHeaderRelayURL().home()}
          target="_blank"
          rel="noreferrer"
          aria-label={t("homepage")}
          title={t("homepage")}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m3 11 9-8 9 8" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </a>
        <a
          class="hr-sidebar-link"
          href="https://buymeacoffee.com/hsb_horse"
          target="_blank"
          rel="noreferrer"
          aria-label={t("buyMeACoffee")}
          title={t("buyMeACoffee")}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z" />
            <path d="M17 10h1a2.5 2.5 0 0 1 0 5h-1" />
            <path d="M8 3v2M12 3v2" />
          </svg>
        </a>
        <a
          class="hr-sidebar-link"
          href={STORE_REVIEW_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t("rateOnStore")}
          title={t("rateOnStore")}
          data-testid="sidebar-review-link"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 20l1-6L3.3 9.9l6-.9L12 3.5Z" />
          </svg>
        </a>
        <Show when={feedbackUrl()}>
          {(url) => (
            <a
              class="hr-sidebar-link"
              href={url()}
              target="_blank"
              rel="noreferrer"
              aria-label={t("reviewPromptFeedbackAction")}
              title={t("reviewPromptFeedbackAction")}
              data-testid="sidebar-feedback-link"
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 4H4v12h4v4l5-4h7V4Z" />
              </svg>
            </a>
          )}
        </Show>
      </footer>
    </aside>
  );
}
