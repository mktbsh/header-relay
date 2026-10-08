import { createSignal, type Accessor } from "solid-js";

import {
  compileConfig,
  probeUrl,
  selectEnabledProfiles,
  type ProbeResult,
} from "../../lib/compiler/compile-config";
import type { AppConfig, SessionState } from "../../lib/domain/types";
import { extensionClient } from "../../lib/messaging/client";
import { validateProbeUrlInput } from "./view-model";

export const useUrlProbe = (
  config: Accessor<AppConfig | undefined>,
  sessions: Accessor<Record<string, SessionState>>,
) => {
  const [testUrl, setTestUrl] = createSignal("");
  const [testResult, setTestResult] = createSignal<ProbeResult>();
  const [testError, setTestError] = createSignal("");

  const canRun = () => validateProbeUrlInput(testUrl()).ok;

  const updateUrl = (value: string) => {
    setTestUrl(value);
    setTestResult(undefined);
    if (!value.trim()) {
      setTestError("");
      return;
    }
    const validation = validateProbeUrlInput(value);
    setTestError(validation.ok ? "" : validation.error);
  };

  const run = () => {
    const current = config();
    if (!current) return;
    const validation = validateProbeUrlInput(testUrl());
    if (!validation.ok) {
      setTestError(validation.error);
      setTestResult(undefined);
      return;
    }
    setTestUrl(validation.value);
    setTestError("");
    const compiled = compileConfig(selectEnabledProfiles(current.profiles), sessions());
    const result = probeUrl(compiled, validation.value);
    setTestResult(result);
    void extensionClient.trackAnalyticsEvent({
      name: "url_probe_run",
      params: {
        surface: "manage",
        allowed: result.effectiveHeaders.length > 0,
        matched_profile_count: result.matches.length,
        effective_header_count: result.effectiveHeaders.length,
      },
    });
  };

  const reset = () => {
    setTestResult(undefined);
    setTestError("");
  };

  return { testUrl, testResult, testError, canRun, updateUrl, run, reset };
};
