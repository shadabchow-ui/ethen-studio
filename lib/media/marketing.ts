import type { MediaProjectKind } from "./types";

export type MarketingStudioPanelId = "product-ad" | "marketing";

export type MarketingSourceKind = "description" | "url_text";

export type MarketingClaimReviewStatus = "needs_review";

export interface MarketingClaimReview {
  status: MarketingClaimReviewStatus;
  label: string;
  notes: string[];
  sourceVerification: "user_provided_unverified";
}

export interface MarketingStoryboardBeat {
  id: string;
  title: string;
  detail: string;
}

export interface MarketingPromptVariant {
  id: string;
  title: string;
  channelLabel: string;
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "16:9" | "9:16";
  emphasis: string;
}

export interface MarketingPromptPack {
  heroImagePrompt: string;
  socialVariantPrompt: string;
  productLifestylePrompt: string;
  shortMotionPrompt: string | null;
  storyboardBeats: MarketingStoryboardBeat[];
  claimReviewNotes: string[];
  variants: MarketingPromptVariant[];
}

export interface MarketingStudioBrief {
  panelId: MarketingStudioPanelId;
  projectKind: MediaProjectKind;
  title: string;
  productSource: string;
  sourceKind: MarketingSourceKind;
  sourceHandlingNote: string;
  sourceDescription: string;
  platform: string;
  audience: string;
  tone: string;
  format: string;
  hook: string;
  cta: string;
  brandDirection: string;
  referenceImageUrl: string | null;
  claimReview: MarketingClaimReview;
}

export interface MarketingBriefDraft {
  sourceText: string;
  platform: string;
  audience: string;
  tone: string;
  format: string;
  hook: string;
  cta: string;
  brandDirection: string;
  referenceImageUrl?: string | null;
  claimNotes?: string;
  panelId: MarketingStudioPanelId;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function titleFromSource(sourceDescription: string, platform: string): string {
  const compact = sourceDescription
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .slice(0, 48);

  return compact.length > 0
    ? `${compact} · ${platform} brief`
    : `${platform} campaign brief`;
}

function platformAspectRatio(platform: string, format: string): "1:1" | "4:5" | "16:9" | "9:16" {
  const platformKey = platform.toLowerCase();
  const formatKey = format.toLowerCase();

  if (formatKey.includes("video") || formatKey.includes("story") || platformKey.includes("tiktok")) {
    return "9:16";
  }
  if (platformKey.includes("youtube")) return "16:9";
  if (platformKey.includes("amazon") || platformKey.includes("email") || platformKey.includes("linkedin")) {
    return "1:1";
  }
  if (formatKey.includes("carousel")) return "4:5";
  return "4:5";
}

function buildClaimNotes(claimNotes: string | undefined, sourceKind: MarketingSourceKind): string[] {
  const notes = [
    "Needs review before publishing or external distribution.",
    "Do not claim benefits, certifications, pricing, or outcomes unless you can substantiate them.",
    "Generated copy and visuals are not publish-ready by default.",
  ];

  if (sourceKind === "url_text") {
    notes.push("User-provided URL was treated as source text only. No scraping or verification was performed.");
  }

  if (claimNotes?.trim()) {
    notes.push(`User review focus: ${claimNotes.trim()}`);
  }

  return notes;
}

export function buildMarketingStudioBrief(draft: MarketingBriefDraft): MarketingStudioBrief {
  const sourceText = normalizeText(draft.sourceText, "Untitled product or campaign");
  const sourceKind: MarketingSourceKind = looksLikeUrl(sourceText) ? "url_text" : "description";
  const sourceDescription =
    sourceKind === "url_text"
      ? `User-provided URL reference: ${sourceText}`
      : sourceText;

  const platform = normalizeText(draft.platform, "Instagram");
  const audience = normalizeText(draft.audience, "Broad audience");
  const tone = normalizeText(draft.tone, "Premium");
  const format = normalizeText(draft.format, draft.panelId === "product-ad" ? "Static" : "Campaign concept");
  const hook = normalizeText(draft.hook, "Lead with a clear first-frame product hook.");
  const cta = normalizeText(draft.cta, "Learn more");
  const brandDirection = normalizeText(
    draft.brandDirection,
    draft.panelId === "product-ad" ? "Product solo" : "Campaign-led creative",
  );

  return {
    panelId: draft.panelId,
    projectKind: "ad_creative_set",
    title: titleFromSource(sourceDescription, platform),
    productSource: sourceText,
    sourceKind,
    sourceHandlingNote:
      sourceKind === "url_text"
        ? "URL treated as user-provided source text only. No scraping, extraction, or verification performed."
        : "Source description provided directly by the user.",
    sourceDescription,
    platform,
    audience,
    tone,
    format,
    hook,
    cta,
    brandDirection,
    referenceImageUrl: draft.referenceImageUrl?.trim() ? draft.referenceImageUrl.trim() : null,
    claimReview: {
      status: "needs_review",
      label: "Needs review",
      notes: buildClaimNotes(draft.claimNotes, sourceKind),
      sourceVerification: "user_provided_unverified",
    },
  };
}

export function buildMarketingPromptPack(brief: MarketingStudioBrief): MarketingPromptPack {
  const aspectRatio = platformAspectRatio(brief.platform, brief.format);
  const promptGuardrail =
    "Keep representations realistic, avoid unverifiable claims, and leave room for human review before publishing.";
  const baseContext = [
    `Product or campaign source: ${brief.sourceDescription}.`,
    `Audience: ${brief.audience}.`,
    `Platform: ${brief.platform}.`,
    `Tone: ${brief.tone}.`,
    `Format: ${brief.format}.`,
    `Hook: ${brief.hook}.`,
    `CTA: ${brief.cta}.`,
    `Brand direction: ${brief.brandDirection}.`,
  ].join(" ");

  const heroImagePrompt = [
    "Create a premium hero ad image.",
    baseContext,
    "Frame the primary product or offer with clean focal hierarchy, sharp lighting, and ad-ready negative space.",
    promptGuardrail,
  ].join(" ");

  const socialVariantPrompt = [
    "Create a social-first variant optimized for thumb-stop performance.",
    baseContext,
    "Make the first read immediate, reinforce the hook, and keep the CTA visually obvious without implying unsupported results.",
    promptGuardrail,
  ].join(" ");

  const productLifestylePrompt = [
    "Create a product-in-context lifestyle concept.",
    baseContext,
    "Show believable everyday usage, tactile detail, and environment cues that match the audience.",
    promptGuardrail,
  ].join(" ");

  const shortMotionPrompt =
    aspectRatio === "9:16" || brief.format.toLowerCase().includes("video")
      ? [
          "Create a short motion handoff prompt.",
          `Start with ${brief.hook.toLowerCase()}.`,
          "Animate from a strong hero frame into one clear benefit beat, then land on the CTA end card.",
          "Use subtle motion only; do not imply that text-to-video is required if an image reference is missing.",
        ].join(" ")
      : null;

  const storyboardBeats: MarketingStoryboardBeat[] = [
    { id: "beat-1", title: "Hook frame", detail: `${brief.hook} with immediate visual clarity for ${brief.platform}.` },
    { id: "beat-2", title: "Proof beat", detail: `Show one believable product attribute for ${brief.audience} without adding unverified claims.` },
    { id: "beat-3", title: "Lifestyle beat", detail: `Place the product in a ${brief.tone.toLowerCase()} setting that reinforces ${brief.brandDirection.toLowerCase()}.` },
    { id: "beat-4", title: "CTA close", detail: `End on ${brief.cta} with clear brand ownership and review-ready copy.` },
  ];

  return {
    heroImagePrompt,
    socialVariantPrompt,
    productLifestylePrompt,
    shortMotionPrompt,
    storyboardBeats,
    claimReviewNotes: brief.claimReview.notes,
    variants: [
      {
        id: "hero-image",
        title: "Hero image prompt",
        channelLabel: `${brief.platform} hero`,
        prompt: heroImagePrompt,
        aspectRatio,
        emphasis: "Primary conversion-ready visual",
      },
      {
        id: "social-variant",
        title: "Social variant prompt",
        channelLabel: `${brief.platform} social`,
        prompt: socialVariantPrompt,
        aspectRatio,
        emphasis: "Thumb-stop social variation",
      },
      {
        id: "product-lifestyle",
        title: "Product / lifestyle prompt",
        channelLabel: `${brief.platform} lifestyle`,
        prompt: productLifestylePrompt,
        aspectRatio,
        emphasis: "Believable product-in-context concept",
      },
    ],
  };
}
