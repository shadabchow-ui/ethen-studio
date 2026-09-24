"use client";

/**
 * Studio V3 Job 4 — thin client hooks over the pure Job 4 libs.
 * Settings subscribe live (no reload); switches own one coordinator cleared
 * on unmount; focus helper moves focus to a destination landmark after
 * navigation without stealing it after user movement.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_STUDIO_SETTINGS,
  loadStudioSettings,
  subscribeStudioSettings,
  type StudioSettings,
} from "@ethen/ui/settings/studio-settings";
import { StudioSwitchCoordinator } from "./studio-switch-coordinator";

let cachedSettings: StudioSettings | null = null;

function getSettingsSnapshot(): StudioSettings {
  if (!cachedSettings) cachedSettings = loadStudioSettings();
  return cachedSettings;
}

function subscribeSettings(listener: () => void): () => void {
  return subscribeStudioSettings((next) => {
    cachedSettings = next;
    listener();
  });
}

function getSettingsServerSnapshot(): StudioSettings {
  return DEFAULT_STUDIO_SETTINGS;
}

export function useStudioSettingsValue(): StudioSettings {
  return useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getSettingsServerSnapshot);
}

export function useStudioSwitches(): StudioSwitchCoordinator {
  const [coordinator] = useState(() => new StudioSwitchCoordinator());
  useEffect(() => () => coordinator.clearAll(), [coordinator]);
  return coordinator;
}

/**
 * Focus the destination landmark after navigation. No-ops when the user
 * already moved focus (active element is inside the destination) or when
 * the landmark is missing — focus is never stolen.
 */
export function useDestinationFocus() {
  return useCallback((landmarkId: string) => {
    if (typeof document === "undefined") return;
    const landmark = document.getElementById(landmarkId);
    if (!landmark) return;
    const active = document.activeElement;
    if (active && landmark.contains(active) && active !== document.body) return;
    const target = landmark.matches("main, [tabindex]") ? landmark : landmark.querySelector<HTMLElement>("[data-autofocus], h1, h2, button, a, input, select");
    if (target instanceof HTMLElement) {
      if (!target.hasAttribute("tabindex") && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    }
  }, []);
}
