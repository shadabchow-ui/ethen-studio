/**
 * Studio V5 policy — legal configuration schemas (STUDIO_03, server-only).
 *
 * Defines the shape of disclosure text references, channel legal configs,
 * and terms versions. These schemas never fabricate approval evidence:
 * missing legal text resolves to null (blocked), never to invented copy.
 */
import "server-only";
import { policyError } from "./types";

export interface DisclosureConfig {
  version: string;
  label: string;
  channels: readonly string[];
  /** Reference to operator-provided legal text (never inline invented copy). */
  legalTextRef: string;
  tosVersion: string;
}

export interface ChannelLegalConfig {
  channel: string;
  requiresDisclosure: boolean;
  disclosureConfigVersion: string | null;
  commercialAllowed: boolean | null;
}

export interface LegalConfigBundle {
  disclosures: readonly DisclosureConfig[];
  channels: readonly ChannelLegalConfig[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, what: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw policyError("BAD_REQUEST", `${what}.${key} is required.`);
  }
  return value;
}

function stringArray(record: Record<string, unknown>, key: string, what: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw policyError("BAD_REQUEST", `${what}.${key} must be a string array.`);
  }
  return [...value];
}

/** Validate operator-supplied disclosure config. Unknown fields are ignored. */
export function validateDisclosureConfig(input: unknown): DisclosureConfig {
  if (!isRecord(input)) throw policyError("BAD_REQUEST", "disclosure config must be an object.");
  return {
    version: requiredString(input, "version", "disclosure"),
    label: requiredString(input, "label", "disclosure"),
    channels: stringArray(input, "channels", "disclosure"),
    legalTextRef: requiredString(input, "legalTextRef", "disclosure"),
    tosVersion: requiredString(input, "tosVersion", "disclosure"),
  };
}

export function validateChannelLegalConfig(input: unknown): ChannelLegalConfig {
  if (!isRecord(input)) throw policyError("BAD_REQUEST", "channel legal config must be an object.");
  const requiresDisclosure = input.requiresDisclosure;
  if (typeof requiresDisclosure !== "boolean") {
    throw policyError("BAD_REQUEST", "channel.requiresDisclosure must be a boolean.");
  }
  const version = input.disclosureConfigVersion;
  if (version !== null && (typeof version !== "string" || version.trim().length === 0)) {
    throw policyError("BAD_REQUEST", "channel.disclosureConfigVersion must be null or a non-empty string.");
  }
  const commercial = input.commercialAllowed;
  if (commercial !== null && typeof commercial !== "boolean") {
    throw policyError("BAD_REQUEST", "channel.commercialAllowed must be null or a boolean.");
  }
  return {
    channel: requiredString(input, "channel", "channel"),
    requiresDisclosure,
    disclosureConfigVersion: version,
    commercialAllowed: commercial,
  };
}

export function validateLegalConfigBundle(input: unknown): LegalConfigBundle {
  if (!isRecord(input)) throw policyError("BAD_REQUEST", "legal config bundle must be an object.");
  if (!Array.isArray(input.disclosures) || !Array.isArray(input.channels)) {
    throw policyError("BAD_REQUEST", "legal bundle needs disclosures[] and channels[].");
  }
  return {
    disclosures: input.disclosures.map(validateDisclosureConfig),
    channels: input.channels.map(validateChannelLegalConfig),
  };
}

/**
 * Resolve the disclosure text reference for a channel. Returns null when
 * unconfigured — callers must treat null as blocked, never invent text.
 */
export function resolveDisclosureRef(
  bundle: LegalConfigBundle,
  channel: string,
): { disclosureVersion: string; legalTextRef: string; tosVersion: string } | null {
  const channelConfig = bundle.channels.find((c) => c.channel === channel) ?? null;
  if (!channelConfig || !channelConfig.requiresDisclosure) return null;
  if (!channelConfig.disclosureConfigVersion) return null;
  const disclosure = bundle.disclosures.find((d) => d.version === channelConfig.disclosureConfigVersion) ?? null;
  if (!disclosure) return null;
  return {
    disclosureVersion: disclosure.version,
    legalTextRef: disclosure.legalTextRef,
    tosVersion: disclosure.tosVersion,
  };
}
