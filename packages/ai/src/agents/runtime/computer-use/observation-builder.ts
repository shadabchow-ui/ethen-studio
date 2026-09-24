import type {
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseReplayEvent,
  ComputerUseObservation,
  BrowserSessionMode,
  ObservationAvailability,
  ObservationSource,
  ObservationBlockerFlags,
  ObservationSensitiveFlags,
  ObservationElementCategories,
  ObservationElementExcerpt,
  ObservationBuilderResult,
} from "./types";
import type { BrowserSession } from "./actions";

const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_\s-]?key/i,
  /credential/i,
  /credit[_\s-]?card/i,
  /card[_\s-]?number/i,
  /cvv/i,
  /ssn/i,
  /social[_\s-]?security/i,
  /date[_\s-]of[_\s-]birth/i,
  /bank[_\s-]account/i,
  /routing[_\s-]number/i,
];

const PII_KEYWORD_PATTERNS: RegExp[] = [
  /\bSSN\b/i,
  /\bSocial Security\b/i,
  /\bdate of birth\b/i,
  /\bdob\b/i,
  /\bpassport\b/i,
  /\bdriver.?s? license\b/i,
  /\btax id\b/i,
  /\bnational id\b/i,
];

const BLOCKER_URL_PATTERNS: Array<{ key: keyof ObservationBlockerFlags; pattern: RegExp }> = [
  { key: "login", pattern: /\/(login|signin|auth|sign_in|log_in)/i },
  { key: "payment", pattern: /\/(checkout|payment|billing|subscribe|upgrade|pricing)/i },
  { key: "mfa", pattern: /\/(mfa|2fa|verify|authenticator|otp|two[_-]?factor)/i },
  { key: "captcha", pattern: /(captcha|recaptcha|hcaptcha|turnstile)/i },
];

const BLOCKER_TEXT_PATTERNS: Array<{ key: keyof ObservationBlockerFlags; patterns: RegExp[] }> = [
  { key: "login", patterns: [/\bsign in\b/i, /\blog in\b/i, /\blogin\b/i] },
  { key: "mfa", patterns: [/\bmulti[_-]?factor\b/i, /\btwo[_-]?factor\b/i, /\bverification code\b/i, /\bauthenticator\b/i] },
  { key: "captcha", patterns: [/\bcaptcha\b/i, /\brecaptcha\b/i, /\bI.?m not a robot\b/i, /\bverify you are human\b/i] },
  { key: "payment", patterns: [/\bcheckout\b/i, /\bpayment\b/i, /\bcredit card\b/i, /\bbilling\b/i] },
  { key: "cookieBanner", patterns: [/\bwe use cookies\b/i, /\bcookie policy\b/i, /\baccept cookies\b/i, /\bcookie consent\b/i, /\bthis site uses cookies\b/i] },
  { key: "modal", patterns: [/\bdialog\b/i, /\bpopup\b/i, /\bmodal\b/i] },
  { key: "filePicker", patterns: [/\bchoose file\b/i, /\bupload file\b/i, /\bselect file\b/i, /\bdrag and drop\b/i] },
];

export interface BuildObservationInput {
  run: ComputerUseRun;
  steps: ComputerUseStep[];
  screenshots: ComputerUseScreenshot[];
  events: ComputerUseReplayEvent[];
  observations?: ComputerUseObservation[];
  session?: BrowserSession;
}

function nullBlockerFlags(): ObservationBlockerFlags {
  return {
    login: null,
    mfa: null,
    captcha: null,
    payment: null,
    cookieBanner: null,
    modal: null,
    filePicker: null,
  };
}

function nullSensitiveFlags(): ObservationSensitiveFlags {
  return {
    passwordFieldsDetected: null,
    paymentFieldsDetected: null,
    piiLikelyVisible: null,
    redactionRecommended: null,
  };
}

function nullElementCategories(): ObservationElementCategories {
  return {
    forms: [],
    links: [],
    buttons: [],
    headings: [],
    tables: [],
    iframes: null,
    shadowDomDetected: null,
  };
}

function detectBlockerFlags(
  currentUrl: string | null,
  pageTitle: string | null,
  visibleText: string | null,
  domElements: Array<{ tag: string; text?: string }> | null,
): ObservationBlockerFlags {
  const flags = nullBlockerFlags();

  const urlStr = currentUrl ?? "";
  const pageText = [pageTitle, visibleText].filter(Boolean).join(" ");
  const domText = domElements?.map((el) => el.text).filter(Boolean).join(" ") ?? "";

  for (const { key, pattern } of BLOCKER_URL_PATTERNS) {
    if (pattern.test(urlStr)) {
      flags[key] = true;
    }
  }

  for (const { key, patterns } of BLOCKER_TEXT_PATTERNS) {
    if (flags[key] === true) continue;
    for (const p of patterns) {
      if (p.test(pageText) || p.test(domText)) {
        flags[key] = true;
        break;
      }
    }
  }

  // For unavailable session, all flags are null
  return flags;
}

function detectSensitiveFlags(
  domElements: Array<{ tag: string; text?: string; attributes?: Record<string, string> }> | null,
  visibleText: string | null,
): ObservationSensitiveFlags {
  const flags = nullSensitiveFlags();

  if (!domElements && !visibleText) return flags;

  flags.passwordFieldsDetected = false;
  flags.paymentFieldsDetected = false;
  flags.piiLikelyVisible = false;
  flags.redactionRecommended = false;

  if (domElements) {
    for (const el of domElements) {
      if (el.tag === "input") {
        const attrs = el.attributes ?? {};
        const type = (attrs.type as string) ?? "";
        const name = (attrs.name as string) ?? "";
        const placeholder = (attrs.placeholder as string) ?? "";
        const id = (attrs.id as string) ?? "";
        const combined = [type, name, placeholder, id].join(" ");

        if (/password/i.test(combined)) {
          flags.passwordFieldsDetected = true;
        }
        if (/credit[_\s-]?card|card[_\s-]?number|cc[_\s-]?num/i.test(combined)) {
          flags.paymentFieldsDetected = true;
        }
      }
      if (el.tag === "input" && /password/i.test((el.attributes as Record<string, string>)?.type ?? "")) {
        flags.passwordFieldsDetected = true;
      }
    }
  }

  if (visibleText && flags.piiLikelyVisible === false) {
    for (const p of PII_KEYWORD_PATTERNS) {
      if (p.test(visibleText)) {
        flags.piiLikelyVisible = true;
        break;
      }
    }
  }

  flags.redactionRecommended = flags.passwordFieldsDetected || flags.paymentFieldsDetected || flags.piiLikelyVisible;

  return flags;
}

function buildElementCategories(
  links: Array<{ href: string; text: string }> | null,
  headings: Array<{ level: number; text: string }> | null,
  domElements: Array<{ tag: string; text?: string; attributes?: Record<string, string> }> | null,
): ObservationElementCategories {
  const categories = nullElementCategories();

  if (links && links.length > 0) {
    categories.links = links.slice(0, 30);
  }

  if (headings && headings.length > 0) {
    categories.headings = headings.slice(0, 20);
  }

  if (domElements && domElements.length > 0) {
    const buttons: Array<{ text: string; ref?: string }> = [];
    const forms: Array<{ action?: string; method?: string; fieldCount: number; hasPassword: boolean; hasSubmit: boolean }> = [];

    for (const el of domElements) {
      const tag = el.tag.toLowerCase();
      if (tag === "button" || tag === "input" && ["submit", "button"].includes((el.attributes as Record<string, string>)?.type ?? "")) {
        buttons.push({
          text: el.text?.slice(0, 80) ?? "",
          ref: (el.attributes as Record<string, string>)?.id ?? undefined,
        });
      }
      if (tag === "form") {
        const attrs = el.attributes as Record<string, string> ?? {};
        forms.push({
          action: attrs.action,
          method: attrs.method,
          fieldCount: 0,
          hasPassword: false,
          hasSubmit: false,
        });
      }
    }

    categories.buttons = buttons.slice(0, 20);
    categories.forms = forms.slice(0, 5);
  }

  return categories;
}

function buildAccessibilitySnapshot(
  session: BrowserSession | undefined,
): { snapshotText: string | null; refs: ObservationBuilderResult["accessibilityRefs"] } {
  if (!session) {
    return { snapshotText: null, refs: null };
  }

  // Accessibility capture is attempted synchronously via getState extensions.
  // If the session has a getAccessibilitySnapshot method, use it.
  const extendedSession = session as BrowserSession & {
    getAccessibilitySnapshot?(): { snapshotText: string | null; refs: Array<{ ref: string; role: string; name: string }> } | null;
  };

  const snapshot = extendedSession.getAccessibilitySnapshot?.();
  if (snapshot && snapshot.snapshotText) {
    return {
      snapshotText: snapshot.snapshotText,
      refs: snapshot.refs.length > 0 ? snapshot.refs : null,
    };
  }

  return { snapshotText: null, refs: null };
}

function buildConsoleAndNetworkSummaries(
  session: BrowserSession | undefined,
): { consoleErrorSummary: string[] | null; networkFailureSummary: string[] | null } {
  if (!session) {
    return { consoleErrorSummary: null, networkFailureSummary: null };
  }

  const extendedSession = session as BrowserSession & {
    getConsoleErrors?(): string[];
    getNetworkFailures?(): Array<{ url: string; error: string }>;
  };

  const consoleErrors = extendedSession.getConsoleErrors?.() ?? [];
  const networkFailures = extendedSession.getNetworkFailures?.() ?? [];

  return {
    consoleErrorSummary: consoleErrors.length > 0 ? consoleErrors.slice(0, 10) : null,
    networkFailureSummary: networkFailures.length > 0 ? networkFailures.map((f: { url: string; error: string }) => `${f.error}: ${f.url}`).slice(0, 10) : null,
  };
}

export function buildObservation(input: BuildObservationInput): ObservationBuilderResult {
  const { run, steps, screenshots, observations, session } = input;

  const stepIndex = steps.length > 0 ? steps[steps.length - 1].index : 0;
  const capturedAt = new Date().toISOString();

  const sessionState = session?.getState?.();
  const currentUrl = sessionState?.url ?? run.sandbox?.url ?? null;
  const pageTitle = sessionState?.title ?? null;
  const browserSessionMode: BrowserSessionMode = run.sandbox?.browserSessionMode ?? session?.mode ?? "simulation";

  // Build truthful availability flags
  const isLiveBrowser = browserSessionMode === "live_browser";
  const latestScreenshot = screenshots.length > 0 ? screenshots[screenshots.length - 1] : null;
  const hasScreenshot = isLiveBrowser && latestScreenshot !== null && latestScreenshot.imageUri.startsWith("data:image/");
  const hasUrl = !!currentUrl;
  const hasTitle = !!pageTitle;
  const hasDom = isLiveBrowser;

  // Check accessibility availability from session
  const hasAccessibility = isLiveBrowser && !!(session as unknown as Record<string, unknown>)["getAccessibilitySnapshot"];

  // Capture element ref map from live browser session
  let refMapResult: ReturnType<NonNullable<BrowserSession["getElementRefMap"]>> = null;
  if (isLiveBrowser && typeof session?.getElementRefMap === "function") {
    try {
      refMapResult = session.getElementRefMap();
    } catch {
      // Non-fatal.
    }
  }
  const hasBoundingBoxes = refMapResult !== null && refMapResult.elements.length > 0;

  const availability: ObservationAvailability = {
    screenshot: hasScreenshot,
    url: hasUrl,
    title: hasTitle,
    dom: hasDom,
    accessibility: hasAccessibility,
    viewport: true,
    boundingBoxes: hasBoundingBoxes,
  };

  const source: ObservationSource = {
    provider: isLiveBrowser ? "playwright" : browserSessionMode === "simulation" ? "mock" : "none",
    sessionMode: browserSessionMode,
    capabilities: availability,
    unavailableReason: browserSessionMode === "simulation"
      ? "Simulation session — no real browser observations."
      : browserSessionMode === "unavailable"
        ? "Live browser session is unavailable."
        : !hasAccessibility
          ? "Playwright accessibility snapshot is not yet wired."
          : undefined,
  };

  // Recent extraction results from steps
  const lastDomInspect = steps.slice().reverse().find((s) => s.action.type === "inspectDom" && s.result?.success);
  const lastTextExtract = steps.slice().reverse().find((s) => s.action.type === "extractText" && s.result?.success);
  const lastLinksExtract = steps.slice().reverse().find((s) => s.action.type === "extractLinks" && s.result?.success);
  const lastHeadingsExtract = steps.slice().reverse().find((s) => s.action.type === "extractHeadings" && s.result?.success);
  const lastTableExtract = steps.slice().reverse().find((s) => s.action.type === "extractTable" && s.result?.success);

  const MAX_VISIBLE_TEXT = 1500;
  const rawExtractedText = lastTextExtract?.result?.data?.text ?? null;
  const visibleTextSummary = rawExtractedText
    ? (rawExtractedText.length > MAX_VISIBLE_TEXT ? `${rawExtractedText.slice(0, MAX_VISIBLE_TEXT)}…` : rawExtractedText)
    : null;

  const MAX_INTERACTIVE_ELEMENTS = 30;
  const interactiveElements = lastDomInspect?.result?.data?.elements ?? null;
  const domSummary = interactiveElements
    ? interactiveElements
        .slice(0, MAX_INTERACTIVE_ELEMENTS)
        .map((el) => `${el.tag}${el.text ? `:"${el.text.slice(0, 40)}"` : ""}`)
    : null;

  // Blocker and sensitive flags
  const blockerFlags = detectBlockerFlags(currentUrl, pageTitle, visibleTextSummary, interactiveElements);
  const sensitiveFlags = detectSensitiveFlags(interactiveElements, visibleTextSummary);

  // Element categories
  const extractedLinks = lastLinksExtract?.result?.data?.links ?? null;
  const extractedHeadings = lastHeadingsExtract?.result?.data?.headings ?? null;
  const elementCategories = buildElementCategories(extractedLinks, extractedHeadings, interactiveElements);

  // Accessibility snapshot
  const accessibility = buildAccessibilitySnapshot(session);

  // Console / network summaries
  const logSummaries = buildConsoleAndNetworkSummaries(session);

  // Build honest blocker hints
  const blockerHints: string[] = [];

  if (browserSessionMode === "simulation") {
    blockerHints.push("Browser session is explicit simulation — extractText/extractLinks/extractHeadings/extractTable return no data.");
  } else if (browserSessionMode === "unavailable") {
    blockerHints.push("Live browser session is unavailable — no page observations can be captured.");
  }

  if (!hasScreenshot && isLiveBrowser) {
    blockerHints.push("Screenshot capture not yet available — page may still be loading.");
  }

  if (!hasAccessibility) {
    if (isLiveBrowser) {
      blockerHints.push("Playwright accessibility snapshot is not yet wired.");
    }
  }

  if (!hasDom) {
    blockerHints.push("DOM inspection is not available — session is not live.");
  }

  if (!availability.boundingBoxes) {
    blockerHints.push("Element bounding boxes are not available — coordinate provider not wired.");
  }

  // Confidence
  const latestObservation = observations && observations.length > 0
    ? observations[observations.length - 1]
    : null;

  const confidence: "high" | "medium" | "low" = browserSessionMode === "unavailable"
    ? "low"
    : browserSessionMode === "simulation"
      ? "low"
      : hasScreenshot && hasUrl && hasDom
        ? "high"
        : "medium";

  return {
    runId: run.id,
    stepId: steps.length > 0 ? steps[steps.length - 1].id : undefined,
    stepIndex,
    capturedAt,
    currentUrl,
    pageTitle,
    browserSessionMode,
    viewport: {
      width: session?.viewport?.width ?? 1280,
      height: session?.viewport?.height ?? 720,
      deviceScaleFactor: latestScreenshot?.devicePixelRatio,
    },
    screenshot: latestScreenshot ? {
      id: latestScreenshot.id,
      width: latestScreenshot.originalWidth,
      height: latestScreenshot.originalHeight,
      scaleX: latestScreenshot.scaleX,
      scaleY: latestScreenshot.scaleY,
      devicePixelRatio: latestScreenshot.devicePixelRatio,
      label: latestScreenshot.label ?? undefined,
    } : undefined,
    visibleTextSummary,
    domSummary,
    elementCategories,
    elementBoundingBoxes: latestObservation?.elementBoundingBoxes ?? null,
    elementRefs: latestObservation?.elementRefs ?? (refMapResult?.elements
      ? refMapResult.elements.map((el) => ({ ...el, snapshotId: refMapResult.snapshotId }))
      : null),
    coordinateMetadata: latestObservation?.coordinateMetadata ?? (latestScreenshot ? {
      viewportWidth: session?.viewport?.width ?? 1280,
      viewportHeight: session?.viewport?.height ?? 720,
      screenshotOriginalWidth: latestScreenshot.originalWidth,
      screenshotOriginalHeight: latestScreenshot.originalHeight,
      sentWidth: latestScreenshot.sentWidth,
      sentHeight: latestScreenshot.sentHeight,
      scaleX: latestScreenshot.scaleX,
      scaleY: latestScreenshot.scaleY,
      devicePixelRatio: latestScreenshot.devicePixelRatio,
    } : null),
    accessibilitySnapshotText: accessibility.snapshotText,
    accessibilityRefs: accessibility.refs,
    consoleErrorSummary: logSummaries.consoleErrorSummary,
    networkFailureSummary: logSummaries.networkFailureSummary,
    blockerFlags,
    sensitiveFlags,
    availability,
    source,
    blockerHints: blockerHints.length > 0 ? blockerHints : null,
    trustLabels: {
      userInstruction: "trusted",
      pageContent: "untrusted",
      domContent: "untrusted",
      screenshotContent: "untrusted",
      toolOutput: "untrusted",
      modelOutput: "untrusted",
    },
    confidence,
  };
}
