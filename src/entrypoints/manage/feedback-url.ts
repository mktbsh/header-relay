import { analyticsClientIdItem } from "../../lib/adapters/browser-ports";
import { buildFeedbackFormUrl, type FeedbackReferrer } from "../../lib/review-prompt/state";

export const resolveFeedbackFormUrl = async (ref: FeedbackReferrer): Promise<string> =>
  buildFeedbackFormUrl({
    version: browser.runtime.getManifest().version,
    clientId: await analyticsClientIdItem.getValue(),
    ref,
  });
