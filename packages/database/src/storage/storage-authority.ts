/**
 * lib/storage/storage-authority.ts
 *
 * JOB 7 — durable private storage authority per asset class.
 *
 * Single checked-in record of which storage backend is the production
 * authority for each asset class. Validators and behavioral tests assert
 * against this table; change the table — not the tests — when the owner
 * selects a new authority.
 *
 * Statuses:
 * - "private-supabase": durable private authority. Bytes live in the private
 *   `project-objects` Supabase Storage bucket via tenant-object-storage,
 *   with project authorization, content scanning, size/MIME limits,
 *   same-origin authorized download (or short-TTL signed access), and
 *   deletion. No public bucket URL is ever served to the browser.
 * - "not-authority": explicitly NOT a production storage authority.
 *   Must remain unreachable from production Chat/Console surfaces and
 *   must not appear in the production CSP.
 *
 * Authority decision (owner waiver, Job 7): Chat and Console attachments
 * ship on Supabase private buckets — the same settled authority as Studio,
 * Voice, Computer Use, and Code evidence. No new bucket, scanner, or R2
 * provisioning was required. Production requires ATTACHMENT_SCANNER_URL
 * (fail-closed when absent). Remaining owner follow-ups:
 * 1. Studio jobs/projects metadata and Designer metadata still rest on the
 *    local file-backed store (.local/ethen-media-store, private-beta only).
 *    Bytes are durable-private, but the metadata layer needs a production
 *    database decision before launch.
 */

export type StorageAuthorityStatus =
  | "private-supabase"
  | "not-authority";

export interface StorageAuthorityEntry {
  /** Asset class, e.g. "chat-attachments". */
  assetClass: string;
  status: StorageAuthorityStatus;
  /** Durable backend, or null when none ships. */
  backend: string | null;
  /** How production reads bytes, or null when nothing ships. */
  productionReadPath: string | null;
  note: string;
}

export const STORAGE_AUTHORITY: readonly StorageAuthorityEntry[] = [
  {
    assetClass: "studio-media",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "same-origin /api/media/assets/[assetId] (authorized proxy)",
    note: "Validated by pnpm validate:studio-upload-security.",
  },
  {
    assetClass: "voice-audio",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "same-origin /api/voice/assets/[assetId] (authorized, short-TTL)",
    note: "Validated by pnpm validate:voice-storage.",
  },
  {
    assetClass: "designer-blobs",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "server-side downloadTenantObject after scope check",
    note: "Designer metadata rests on the local file store; bytes are durable-private.",
  },
  {
    assetClass: "computer-use-artifacts",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "server-side tenant-object-storage access",
    note: "Screenshots and evidence bundles; never public buckets.",
  },
  {
    assetClass: "code-evidence",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "server-side tenant-object-storage access",
    note: "Code evidence bundles; never public buckets.",
  },
  {
    assetClass: "chat-attachments",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "same-origin /api/attachments/[assetId] (authorized proxy) + short-TTL signed URL",
    note: "Validated by tests/behavioral/job07-attachments-storage-authority.test.ts.",
  },
  {
    assetClass: "console-attachments",
    status: "private-supabase",
    backend: "project-objects (Supabase Storage, private)",
    productionReadPath: "same-origin /api/attachments/[assetId] (authorized proxy) + worker-resolved model context",
    note: "Envelope carries durable assetRefs; the console worker resolves them at execution.",
  },
  {
    assetClass: "showcase-r2-public",
    status: "not-authority",
    backend: "public r2.dev bucket (mock-preview only)",
    productionReadPath: null,
    note: "Showcase sample media only. Blocked by production CSP; never an attachment authority.",
  },
  {
    assetClass: "local-private-beta-store",
    status: "not-authority",
    backend: ".local/ethen-media-store (git-ignored local disk)",
    productionReadPath: null,
    note: "Private-beta durability only. Not production storage; Chat/Console production paths must not import it.",
  },
] as const;

export function storageAuthorityFor(assetClass: string): StorageAuthorityEntry | null {
  return STORAGE_AUTHORITY.find((entry) => entry.assetClass === assetClass) ?? null;
}

/** True only when the asset class ships on durable private storage. */
export function isProductionDurableStorage(assetClass: string): boolean {
  return storageAuthorityFor(assetClass)?.status === "private-supabase";
}
