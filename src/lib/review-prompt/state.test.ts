import { describe, expect, it } from "vitest";

import {
  buildFeedbackFormUrl,
  completeReviewPrompt,
  initialReviewPromptState,
  REVIEW_PROMPT_SNOOZE_DAYS,
  shouldShowReviewPrompt,
  snoozeReviewPrompt,
} from "./state";

const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("review prompt state", () => {
  it("shows on a fresh install", () => {
    expect(shouldShowReviewPrompt(initialReviewPromptState, NOW)).toBe(true);
  });

  it("hides for the whole snooze window and returns after it", () => {
    const snoozed = snoozeReviewPrompt(initialReviewPromptState, NOW);
    const window = REVIEW_PROMPT_SNOOZE_DAYS * DAY_MS;

    expect(shouldShowReviewPrompt(snoozed, NOW)).toBe(false);
    expect(shouldShowReviewPrompt(snoozed, NOW + window - 1)).toBe(false);
    expect(shouldShowReviewPrompt(snoozed, NOW + window)).toBe(true);
  });

  it("extends the window when snoozed again", () => {
    const twice = snoozeReviewPrompt(
      snoozeReviewPrompt(initialReviewPromptState, NOW),
      NOW + DAY_MS,
    );
    expect(shouldShowReviewPrompt(twice, NOW + REVIEW_PROMPT_SNOOZE_DAYS * DAY_MS)).toBe(false);
  });

  it("never shows again once completed", () => {
    const done = completeReviewPrompt(snoozeReviewPrompt(initialReviewPromptState, NOW));
    expect(shouldShowReviewPrompt(done, NOW + 10 * REVIEW_PROMPT_SNOOZE_DAYS * DAY_MS)).toBe(false);
  });

  it("carries the build, the installation id and the entry point into the feedback form", () => {
    expect(
      buildFeedbackFormUrl({
        version: "1.4.0",
        clientId: "0190d5d9-a9d2-7fff-bfff-ffffffffffff",
        ref: "int-bottom-nav",
      }),
    ).toBe(
      "https://tally.so/r/VLBgdj?version=1.4.0&c=0190d5d9-a9d2-7fff-bfff-ffffffffffff&ref=int-bottom-nav",
    );
  });

  it("falls back to an unattributed entry point", () => {
    expect(buildFeedbackFormUrl({ version: "1.4.0", clientId: "x" })).toContain("&ref=int");
  });
});
