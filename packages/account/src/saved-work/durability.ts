import type { Durability, DurabilityInfo } from "./types";
import type { StatusTone } from "@ethen/ui/status-badge";
import { hasSupabaseEnv, isMockMode } from "@ethen/config/runtime-flags";

const DURABILITY_INFO: Record<Durability, DurabilityInfo> = {
  durable: {
    durability: "durable",
    label: "Durable (Supabase)",
    shortLabel: "durable",
    description: "Persisted to Supabase. Survives restarts and syncs across devices.",
    isDurable: true,
    isPersistent: true,
  },
  local_file: {
    durability: "local_file",
    label: "Local file",
    shortLabel: "local",
    description: "Persisted to local disk. Survives server restarts but does not sync across devices.",
    isDurable: false,
    isPersistent: true,
  },
  local_storage: {
    durability: "local_storage",
    label: "Browser localStorage",
    shortLabel: "local",
    description: "Stored in your browser. May be lost if cache is cleared. Does not sync.",
    isDurable: false,
    isPersistent: true,
  },
  in_memory: {
    durability: "in_memory",
    label: "In memory only",
    shortLabel: "memory",
    description: "Only stored in server memory. Lost on process restart or refresh.",
    isDurable: false,
    isPersistent: false,
  },
  mock: {
    durability: "mock",
    label: "Mock / test data",
    shortLabel: "mock",
    description: "Mock data for development and testing. Not real user data.",
    isDurable: false,
    isPersistent: false,
  },
  not_saved: {
    durability: "not_saved",
    label: "Not saved",
    shortLabel: "unsaved",
    description: "This item has not been saved to any storage layer.",
    isDurable: false,
    isPersistent: false,
  },
};

export function getDurabilityInfo(durability: Durability): DurabilityInfo {
  return DURABILITY_INFO[durability];
}

export function getDurabilityTone(durability: Durability): StatusTone {
  switch (durability) {
    case "durable":
      return "success";
    case "local_file":
    case "local_storage":
      return "info";
    case "in_memory":
      return "warning";
    case "mock":
      return "neutral";
    case "not_saved":
      return "danger";
  }
}

export function getDurabilityBadgeLabel(durability: Durability): string {
  const info = DURABILITY_INFO[durability];
  return info.shortLabel;
}

export function getSessionDurability(
  isServerSession: boolean,
  isMock: boolean,
  supabaseAvailable: boolean,
): Durability {
  if (isServerSession && supabaseAvailable) return "durable";
  if (isMock) return "mock";
  if (supabaseAvailable) return "local_storage";
  if (isMock) return "mock";
  return "not_saved";
}

export function getProjectDurability(
  isMock: boolean,
  supabaseAvailable: boolean,
): Durability {
  if (isMock) return "mock";
  return "not_saved";
}

export function getSystemDurability(): Durability {
  if (hasSupabaseEnv()) return "durable";
  if (isMockMode) return "mock";
  return "in_memory";
}
