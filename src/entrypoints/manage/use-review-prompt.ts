import { createSignal, onMount } from "solid-js";

import { browserStorage } from "../../lib/adapters/browser-ports";
import type { AnalyticsEvent } from "../../lib/analytics/events";
import { extensionClient } from "../../lib/messaging/client";
import {
  completeReviewPrompt,
  initialReviewPromptState,
  type ReviewPromptState,
  shouldShowReviewPrompt,
  snoozeReviewPrompt,
  STORE_REVIEW_URL,
} from "../../lib/review-prompt/state";
import { resolveFeedbackFormUrl } from "./feedback-url";

// Which panel of the card is on screen. Only "hidden" is persisted (as done/snoozed);
// leaving the page mid-answer starts over at "ask".
export type ReviewPromptStep = "hidden" | "ask" | "rate" | "feedback";

type ReviewPromptAction = Extract<AnalyticsEvent, { name: "review_prompt" }>["params"]["action"];

const item = browserStorage.defineItem<ReviewPromptState>("local:review-prompt", {
  fallback: initialReviewPromptState,
});

export const useReviewPrompt = () => {
  const [step, setStep] = createSignal<ReviewPromptStep>("hidden");

  const track = (action: ReviewPromptAction) =>
    void extensionClient.trackAnalyticsEvent({
      name: "review_prompt",
      params: { surface: "manage", action },
    });

  const update = async (next: (state: ReviewPromptState) => ReviewPromptState) => {
    await item.setValue(next(await item.getValue()));
  };

  const finish = (action: ReviewPromptAction, url?: string) => {
    setStep("hidden");
    track(action);
    void update(completeReviewPrompt);
    if (url) void browser.tabs.create({ url });
  };

  onMount(() => {
    void (async () => {
      if (!shouldShowReviewPrompt(await item.getValue(), Date.now())) return;
      setStep("ask");
      track("shown");
    })();
  });

  return {
    step,
    answerPositive: () => {
      setStep("rate");
      track("positive");
    },
    answerNegative: () => {
      setStep("feedback");
      track("negative");
    },
    snooze: () => {
      setStep("hidden");
      track("snoozed");
      void update((state) => snoozeReviewPrompt(state, Date.now()));
    },
    openReview: () => finish("rated", STORE_REVIEW_URL),
    openFeedback: () =>
      void resolveFeedbackFormUrl("int-review-card").then((url) => finish("feedback", url)),
    dismiss: () => finish("dismissed"),
  };
};
