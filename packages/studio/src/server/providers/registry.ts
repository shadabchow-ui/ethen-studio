/** Studio V5 providers — registry-driven provider extension (STUDIO_06). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { ProviderAdapterPort } from "../ports/provider-adapter";
import { ProviderError } from "./types";

export interface ProviderRegistration {
  adapterName: string;
  adapterVersion: string;
  supportedTasks: readonly TaskName[];
  create: () => ProviderAdapterPort;
}

/**
 * Registry-driven extension: deployments register additional providers
 * without touching the kernel. Unknown adapters fail closed — lookup never
 * invents an adapter.
 */
export class ProviderRegistry {
  private readonly entries = new Map<string, ProviderRegistration>();
  private readonly instances = new Map<string, ProviderAdapterPort>();

  register(entry: ProviderRegistration): void {
    if (this.entries.has(entry.adapterName)) {
      throw new ProviderError(
        "PROVIDER_FAILED",
        `Provider adapter ${entry.adapterName} is already registered.`,
      );
    }
    this.entries.set(entry.adapterName, entry);
  }

  has(adapterName: string): boolean {
    return this.entries.has(adapterName);
  }

  require(adapterName: string): ProviderAdapterPort {
    const cached = this.instances.get(adapterName);
    if (cached) return cached;
    const entry = this.entries.get(adapterName);
    if (!entry) {
      throw new ProviderError(
        "NOT_FOUND",
        `Provider adapter ${adapterName} is not registered; refusing to invent one.`,
      );
    }
    // One instance per registry: operation records submitted through one
    // call must be visible to later query/reconcile calls. Fresh registries
    // (tests, redeploys) start with empty instance state.
    const instance = entry.create();
    this.instances.set(adapterName, instance);
    return instance;
  }

  list(): ProviderRegistration[] {
    return [...this.entries.values()];
  }

  adaptersFor(task: TaskName): ProviderRegistration[] {
    return this.list().filter((entry) => entry.supportedTasks.includes(task));
  }
}

let defaultRegistry: ProviderRegistry | null = null;

/** Default process registry; deployments register real adapters on boot. */
export function getDefaultProviderRegistry(): ProviderRegistry {
  if (!defaultRegistry) defaultRegistry = new ProviderRegistry();
  return defaultRegistry;
}

/** Test seam: replace the default registry with an isolated instance. */
export function resetDefaultProviderRegistry(): ProviderRegistry {
  defaultRegistry = new ProviderRegistry();
  return defaultRegistry;
}
