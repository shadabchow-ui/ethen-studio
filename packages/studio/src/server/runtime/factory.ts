/**
 * Studio V5 runtime — Studio factory (STUDIO_05). Server-only.
 *
 * Binds the persistent shared job repository. Unlike the platform factory
 * (which honestly falls back to memory in production), the Studio factory
 * REFUSES to serve memory in production: Studio production without a
 * persistent binding is a startup error, never silent amnesia.
 */
import "server-only";
import type { RuntimeRepository } from "./memory";
import { createMemoryRuntimeStore } from "./memory";
import { RuntimeError } from "./types";

export interface StudioRuntimeBinding {
  repository: RuntimeRepository;
  durable: boolean;
}

function mockModeAllowed(): boolean {
  if (process.env.NODE_ENV === "test") return true;
  const flag = process.env.ETHEN_MOCK_MODE ?? process.env.STUDIO_V5_MOCK_MODE;
  return flag === "1" || flag === "true";
}

/**
 * Resolve the Studio runtime repository. Production requires an injected
 * persistent binding (Supabase adapter); memory is served only when mock
 * mode is explicitly allowed (tests/dev). Legacy runs stay pinned to the
 * old executor until STUDIO_20 drains — this factory never double-dispatches.
 */
export function createStudioRuntimeRepository(input: {
  persistent?: RuntimeRepository;
  allowMemory?: boolean;
} = {}): StudioRuntimeBinding {
  if (input.persistent) {
    return { repository: input.persistent, durable: true };
  }
  const allowMemory = input.allowMemory ?? mockModeAllowed();
  if (!allowMemory) {
    throw new RuntimeError(
      "ADMISSION_CLOSED",
      "STUDIO_RUNTIME_REQUIRES_DURABLE_BINDING: no persistent job repository is bound.",
    );
  }
  return { repository: createMemoryRuntimeStore(), durable: false };
}

export function isStudioRuntimeDurable(binding: StudioRuntimeBinding): boolean {
  return binding.durable;
}
