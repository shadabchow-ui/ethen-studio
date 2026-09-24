import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROOF_OBJECT_BUCKET } from "../proof/supabase-object-store";
import { GovernanceError } from "./errors";
import type { TenantObjectDeletionStore } from "./repository";

export class SupabaseTenantObjectDeletionStore implements TenantObjectDeletionStore {
  constructor(private readonly client: SupabaseClient) {}

  async listProjectKeys(projectId: string): Promise<readonly string[]> {
    const root = `projects/${projectId}/objects`;
    const keys: string[] = [];
    const walk = async (prefix: string): Promise<void> => {
      let offset = 0;
      while (true) {
        const { data, error } = await this.client.storage.from(PROOF_OBJECT_BUCKET)
          .list(prefix, { limit: 100, offset });
        if (error) throw new GovernanceError("PERSISTENCE_ERROR", `list_objects: ${error.message}`);
        for (const item of data ?? []) {
          const key = `${prefix}/${item.name}`;
          if (item.id) keys.push(key);
          else await walk(key);
        }
        if (!data || data.length < 100) break;
        offset += data.length;
      }
    };
    await walk(root);
    return keys;
  }

  async remove(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 100) {
      const { error } = await this.client.storage.from(PROOF_OBJECT_BUCKET)
        .remove([...keys.slice(start, start + 100)]);
      if (error) throw new GovernanceError("PERSISTENCE_ERROR", `remove_objects: ${error.message}`);
    }
  }
}

