// The review prompt has no engagement trigger: it is visible from the first run and
// stays until the user answers. "Later" pushes it out; every other answer ends it.

export type ReviewPromptState = {
  done: boolean;
  // Epoch ms the prompt may reappear. 0 means it was never snoozed.
  snoozedUntil: number;
};

export const initialReviewPromptState: ReviewPromptState = { done: false, snoozedUntil: 0 };

export const REVIEW_PROMPT_SNOOZE_DAYS = 30;

const SNOOZE_MS = REVIEW_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

export const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/olmfkdclaloaacojbgaabokehlbphilf/reviews";

const FEEDBACK_FORM_URL = "https://tally.so/r/VLBgdj";

// Which entry point sent the user to the form. "int" is the unattributed fallback.
export type FeedbackReferrer = "int" | "int-bottom-nav" | "int-review-card";

// `version`, `c` and `ref` are hidden fields on the Tally form: without them a report
// cannot be tied to a build, to the rest of that installation's reports, or to the
// entry point it came from.
export const buildFeedbackFormUrl = (context: {
  version: string;
  clientId: string;
  ref?: FeedbackReferrer;
}): string => {
  const url = new URL(FEEDBACK_FORM_URL);
  url.searchParams.set("version", context.version);
  url.searchParams.set("c", context.clientId);
  url.searchParams.set("ref", context.ref ?? "int");
  return url.toString();
};

export const shouldShowReviewPrompt = (state: ReviewPromptState, now: number): boolean =>
  !state.done && now >= state.snoozedUntil;

export const snoozeReviewPrompt = (state: ReviewPromptState, now: number): ReviewPromptState => ({
  ...state,
  snoozedUntil: now + SNOOZE_MS,
});

export const completeReviewPrompt = (state: ReviewPromptState): ReviewPromptState => ({
  ...state,
  done: true,
});
