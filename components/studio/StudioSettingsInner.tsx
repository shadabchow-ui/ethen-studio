"use client";

/**
 * Studio V3 Job 1 — Studio settings composition (inline /studio/settings).
 *
 * Same shared SettingsShell, nav, search, primitives, schema and sync as
 * Chat: shared sections (General, Account, Privacy, Billing, Capabilities,
 * Memory, Developer, Browser, Extension, Skills, Connectors, Plugins) reuse
 * the identical components and persistence; Studio sections (Generation,
 * Routing, Assets, Video, Export, Keyboard) use the versioned Studio
 * preference store. Studio prefs persist now; their effects connect in Job 4
 * (each row says so — never fake-successful).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveSettingsSectionId } from "@/lib/studio-v5/route-map";
import { GatewaySettings } from "./v5/gateway/GatewaySettings";
import { useStudioSignOut } from "./auth/use-studio-sign-out";
import {
  UserSettingsProvider,
  useUserSettings,
  SettingsShell,
  SettingsSaveState,
  buildSettingsSearchIndex,
  searchSettings,
  sectionsForProduct,
  GeneralSection,
  AccountSection,
  PrivacySection,
  BillingSection,
  CapabilitiesSection,
  MemorySection,
  DeveloperSection,
  BrowserSection,
  ExtensionSection,
  SkillsSection,
  ConnectorsSection,
  PluginsSection,
  StudioGenerationSection,
  StudioRoutingSection,
  StudioAssetsSection,
  StudioVideoSection,
  StudioExportSection,
  StudioKeyboardSection,
  getStudioSettingsServerSnapshot,
  getStudioSettingsSnapshot,
  saveStudioSettings,
  subscribeStudioSettings,
  type StudioSettings,
} from "@ethen/ui/settings/index";

const subscribeStudio: (onChange: () => void) => () => void = (onChange) =>
  subscribeStudioSettings(() => onChange());

/**
 * STUDIO_19 — Studio-local gateway section. Appended here (not in the
 * shared registry) so Chat/Designer nav is untouched; the shared shell
 * renders it like any other section.
 */
const GATEWAY_SECTION = {
  id: "api-access",
  label: "API access",
  group: "studio",
  product: "studio",
  keywords: ["api", "keys", "tokens", "scopes", "revoke", "webhooks", "byok", "deliveries"],
} as const;

// RC5 — valid section ids for the shared resolver (registry + gateway).
const VALID_IDS: readonly string[] = [...sectionsForProduct("studio").map((s) => s.id), GATEWAY_SECTION.id];

export function StudioSettingsInner() {
  const state = useUserSettings();
  const { signOut } = useStudioSignOut();
  // RC5 — the URL is the single source of truth for the open section: one
  // resolver (aliases + validation) reacts to initial load, in-page
  // clicks, and external client navigation alike.
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const section = resolveSettingsSectionId(requestedSection, VALID_IDS);
  // Canonicalize aliased/unknown section params in place (replace, so
  // legacy ?section=plan bookmarks settle on ?section=billing).
  React.useEffect(() => {
    if (requestedSection !== null && requestedSection !== section) {
      router.replace(`/studio/settings?section=${section}`, { scroll: false });
    }
  }, [requestedSection, section, router]);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const studioPrefs = React.useSyncExternalStore(
    subscribeStudio,
    getStudioSettingsSnapshot,
    getStudioSettingsServerSnapshot,
  );
  const [studioError, setStudioError] = React.useState<string | null>(null);

  const index = React.useMemo(
    () => [
      ...buildSettingsSearchIndex("studio"),
      {
        sectionId: GATEWAY_SECTION.id,
        label: GATEWAY_SECTION.label,
        group: GATEWAY_SECTION.group,
        product: GATEWAY_SECTION.product,
        keywords: [...GATEWAY_SECTION.keywords],
      },
    ],
    [],
  );
  const results = React.useMemo(() => searchSettings(index, query), [index, query]);
  const sections = React.useMemo(
    () => [...sectionsForProduct("studio"), { ...GATEWAY_SECTION, keywords: [...GATEWAY_SECTION.keywords] }],
    [],
  );

  const goSection = React.useCallback((id: string) => {
    const next = resolveSettingsSectionId(id, VALID_IDS);
    setQuery("");
    router.replace(`/studio/settings?section=${next}`, { scroll: false });
  }, [router]);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      document.getElementById(`settings-section-${section}`)?.scrollIntoView({ block: "start" });
    });
  }, [section]);

  const onSearchSelect = React.useCallback(
    (entry: { sectionId: string }) => {
      goSection(entry.sectionId);
      setHighlight(entry.sectionId);
      window.setTimeout(() => setHighlight(null), 1700);
    },
    [goSection],
  );

  const saveStudio = React.useCallback((next: StudioSettings) => {
    const problem = saveStudioSettings(next);
    setStudioError(problem);
    return problem;
  }, []);

  const studioData = React.useMemo(
    () => ({ prefs: studioPrefs, save: saveStudio }),
    [studioPrefs, saveStudio],
  );

  const ctx = React.useMemo(
    () => ({ state, onNavigate: goSection, onDirty: () => {} }),
    [state, goSection],
  );

  return (
    <div data-eds data-highlight-section={highlight ?? undefined}>
      <SettingsShell
        title="Studio settings"
        titleRouteMarker="/studio/settings"
        product="studio"
        sections={sections}
        active={section}
        onActive={goSection}
        query={query}
        onQuery={setQuery}
        searchResults={results}
        onSearchSelect={onSearchSelect}
        backHref="/studio"
        backLabel="← Back to Studio"
        status={
          <>
            <SettingsSaveState
              phase={state.phase}
              error={state.error}
              persistence={state.persistence}
              onRetry={() => void state.refresh()}
            />
            {studioError ? <span role="alert">{studioError}</span> : null}
          </>
        }
      >
        {section === "general" ? <GeneralSection ctx={ctx} /> : null}
        {section === "account" ? <AccountSection ctx={ctx} onSignOut={signOut} /> : null}
        {section === "privacy" ? <PrivacySection ctx={ctx} /> : null}
        {section === "billing" ? <BillingSection ctx={ctx} product="studio" /> : null}
        {section === "capabilities" ? <CapabilitiesSection ctx={ctx} /> : null}
        {section === "memory" ? (
          <MemorySection
            ctx={ctx}
            areas={[]}
            areasLoading={false}
            areasError={null}
            onRefreshAreas={() => {}}
            onImport={async () => "Memory import is not connected in Studio yet (Job 4)."}
            importLabel="Import as context area"
          />
        ) : null}
        {section === "developer" ? <DeveloperSection ctx={ctx} /> : null}
        {section === "browser" ? <BrowserSection ctx={ctx} /> : null}
        {section === "extension" ? <ExtensionSection /> : null}
        {section === "skills" ? <SkillsSection ctx={ctx} product="studio" /> : null}
        {section === "connectors" ? <ConnectorsSection ctx={ctx} product="studio" /> : null}
        {section === "plugins" ? <PluginsSection /> : null}
        {section === "generation" ? <StudioGenerationSection data={studioData} /> : null}
        {section === "routing" ? <StudioRoutingSection data={studioData} /> : null}
        {section === "assets" ? <StudioAssetsSection data={studioData} /> : null}
        {section === "video" ? <StudioVideoSection data={studioData} /> : null}
        {section === "export" ? <StudioExportSection data={studioData} /> : null}
        {section === "keyboard" ? <StudioKeyboardSection data={studioData} /> : null}
        {section === "api-access" ? (
          <div id="settings-section-api-access">
            <GatewaySettings />
          </div>
        ) : null}
      </SettingsShell>
    </div>
  );
}

export function StudioSettingsClient() {
  return (
    <UserSettingsProvider>
      <StudioSettingsInner />
    </UserSettingsProvider>
  );
}
