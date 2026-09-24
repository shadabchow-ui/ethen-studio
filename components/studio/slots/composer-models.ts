import type { V2ModelOption } from "@ethen/ui/design-system/v2/composer/ModelPicker";
import { getRegistryModelOptions } from "@/lib/media/models";

/**
 * Studio V3 Job 2 — registry-backed composer model wiring.
 *
 * The single mapping from a Studio capability to composer models, used by
 * both the Composer slot implementation and the generator workbench dock.
 * Auto leads; explicit endpoints follow with honest support states (only
 * eligible + schema-supported endpoints are selectable, and executability
 * itself stays gated by Job 3 qualification). Unmapped capabilities yield
 * Auto alone — never an empty or invented list.
 */
export function qualifiedComposerModels(capability: string): V2ModelOption[] {
  return getRegistryModelOptions({ task: capability }).map((option) => ({
    id: option.id,
    label: option.label,
    provider: option.provider,
    capabilities: [...option.capabilities],
    recommended: option.recommended,
    disabled: option.disabled,
    unavailableReason: option.unavailableReason,
  }));
}
