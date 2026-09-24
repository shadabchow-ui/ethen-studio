import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ProofPersistenceError } from "./errors";
import type { ProofObjectStore } from "./object-store";

export const PROOF_OBJECT_BUCKET = "project-objects";

export class SupabaseProofObjectStore implements ProofObjectStore {
  constructor(private readonly client: SupabaseClient) {}

  async put(
    key: string,
    bytes: Uint8Array,
    mediaType: string,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(PROOF_OBJECT_BUCKET)
      .upload(key, bytes, { contentType: mediaType, upsert: false });
    if (error) {
      throw new ProofPersistenceError("put_object", error.message);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage
      .from(PROOF_OBJECT_BUCKET)
      .download(key);
    if (error) {
      if (error.message.toLowerCase().includes("not found")) return null;
      throw new ProofPersistenceError("get_object", error.message);
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.client.storage
      .from(PROOF_OBJECT_BUCKET)
      .remove([key]);
    if (error) {
      throw new ProofPersistenceError("remove_object", error.message);
    }
  }
}
