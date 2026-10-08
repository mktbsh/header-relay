import { Show } from "solid-js";

import { t } from "../../../lib/i18n";
import { useReviewPrompt } from "../use-review-prompt";

export function ReviewPromptCard() {
  const prompt = useReviewPrompt();

  // Both answers lead to the same shape of panel: one sentence, one outbound action,
  // one way out. Only the wording and the destination differ.
  const panel = () =>
    prompt.step() === "rate"
      ? {
          body: t("reviewPromptRateBody"),
          action: t("reviewPromptRateAction"),
          onAction: prompt.openReview,
        }
      : {
          body: t("reviewPromptFeedbackBody"),
          action: t("reviewPromptFeedbackAction"),
          onAction: prompt.openFeedback,
        };

  return (
    <Show when={prompt.step() !== "hidden"}>
      <div class="hr-card mt-4 shrink-0 px-3 py-3" data-testid="review-prompt">
        <Show
          when={prompt.step() === "ask"}
          fallback={
            <>
              <p class="hr-footnote">{panel().body}</p>
              <button
                type="button"
                class="hr-btn hr-btn-filled mt-2 w-full justify-center"
                onClick={() => panel().onAction()}
              >
                {panel().action}
              </button>
              <button
                type="button"
                class="hr-footnote mt-2 w-full text-center underline"
                onClick={() => prompt.dismiss()}
              >
                {t("reviewPromptClose")}
              </button>
            </>
          }
        >
          <p class="text-[13px] font-medium">{t("reviewPromptAskTitle")}</p>
          <div class="mt-2 grid gap-1.5">
            <button
              type="button"
              class="hr-btn hr-btn-filled justify-center"
              onClick={() => prompt.answerPositive()}
            >
              {t("reviewPromptYes")}
            </button>
            <button
              type="button"
              class="hr-btn justify-center"
              onClick={() => prompt.answerNegative()}
            >
              {t("reviewPromptNo")}
            </button>
          </div>
          <button
            type="button"
            class="hr-footnote mt-2 w-full text-center underline"
            data-testid="review-prompt-later"
            onClick={() => prompt.snooze()}
          >
            {t("reviewPromptLater")}
          </button>
        </Show>
      </div>
    </Show>
  );
}
