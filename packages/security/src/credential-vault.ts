import "server-only";

import { randomUUID } from "node:crypto";

export type CredentialSecretKind = "provider" | "connector" | "webhook" | "desktop";
export type CredentialSecretStatus = "staged" | "active" | "superseded" | "revoked";

export interface CredentialSecretReference {
  id: string;
  projectId: string;
  kind: CredentialSecretKind;
  version: number;
}

export interface CredentialVaultActor {
  id: string;
  projectId: string;
}

export interface CredentialVaultAuditEvent {
  action: "created" | "read" | "rotated" | "revoked";
  actorId: string;
  projectId: string;
  purpose: string;
  referenceId: string;
  version: number;
  occurredAt: string;
}

interface StoredSecret {
  reference: CredentialSecretReference;
  status: CredentialSecretStatus;
  externalRef: string;
}

/**
 * This is the only interface that may hold secret values. Production adapters
 * must be backed by a managed KMS/vault; database records hold `externalRef`
 * and never the value. The in-memory implementation exists solely as a test
 * seam and is never selected by the application runtime.
 */
export interface CredentialVaultBackend {
  put(input: { externalRef: string; secret: string }): Promise<void>;
  get(externalRef: string): Promise<string | null>;
  remove(externalRef: string): Promise<void>;
}

export interface CredentialVaultAuditSink {
  append(event: CredentialVaultAuditEvent): Promise<void>;
}

export interface CredentialVaultRecordStore {
  put(record: StoredSecret): Promise<void>;
  get(referenceId: string): Promise<StoredSecret | null>;
  update(record: StoredSecret): Promise<void>;
}

export interface DesktopKeychain {
  isAvailable(): Promise<boolean>;
  store(reference: CredentialSecretReference, secret: string): Promise<void>;
  resolve(reference: CredentialSecretReference): Promise<string | null>;
  revoke(reference: CredentialSecretReference): Promise<void>;
}

/**
 * Deliberately unavailable until deployment registers a managed KMS/Vault
 * adapter. It prevents accidental selection of memory, disk, or legacy
 * application-encryption storage for new production credentials.
 */
export function isManagedCredentialVaultConfigured(): boolean {
  return managedCredentialVault !== null;
}

export class CredentialVaultService {
  constructor(
    private readonly backend: CredentialVaultBackend,
    private readonly audit: CredentialVaultAuditSink,
    private readonly records: CredentialVaultRecordStore,
  ) {}

  async create(input: {
    actor: CredentialVaultActor;
    kind: CredentialSecretKind;
    secret: string;
    purpose: string;
    /** Optional deterministic reference id (e.g. one connector per project). Defaults to a random id. */
    referenceId?: string;
  }): Promise<CredentialSecretReference> {
    assertSecret(input.secret);
    return this.write(input, "active");
  }

  /**
   * Stores a replacement secret without making it resolvable. Callers use this
   * during a multi-resource rotation so a failed metadata switch can be
   * compensated without affecting the currently selected secret.
   */
  async createStaged(input: {
    actor: CredentialVaultActor;
    kind: CredentialSecretKind;
    secret: string;
    purpose: string;
    referenceId?: string;
  }): Promise<CredentialSecretReference> {
    return this.write(input, "staged");
  }

  async activate(input: {
    actor: CredentialVaultActor;
    reference: CredentialSecretReference;
    purpose: string;
  }): Promise<boolean> {
    const stored = await this.records.get(input.reference.id);
    if (!stored || stored.status !== "staged" || !sameReference(stored.reference, input.reference)) return false;
    if (input.actor.projectId !== stored.reference.projectId) return false;
    stored.status = "active";
    await this.records.update(stored);
    await this.audit.append(event("created", input.actor, input.purpose, stored.reference));
    return true;
  }

  private async write(input: {
    actor: CredentialVaultActor;
    kind: CredentialSecretKind;
    secret: string;
    purpose: string;
    referenceId?: string;
  }, status: "staged" | "active"): Promise<CredentialSecretReference> {
    assertSecret(input.secret);
    const reference: CredentialSecretReference = {
      id: input.referenceId ?? randomUUID(),
      projectId: input.actor.projectId,
      kind: input.kind,
      version: 1,
    };
    const externalRef = `credential/${reference.id}/v${reference.version}`;
    await this.backend.put({ externalRef, secret: input.secret });
    await this.records.put({ reference, status, externalRef });
    await this.audit.append(event("created", input.actor, input.purpose, reference));
    return { ...reference };
  }

  async resolve(input: {
    actor: CredentialVaultActor;
    reference: CredentialSecretReference;
    purpose: string;
  }): Promise<string | null> {
    const stored = await this.records.get(input.reference.id);
    if (!stored || stored.status !== "active" || !sameReference(stored.reference, input.reference)) return null;
    if (input.actor.projectId !== stored.reference.projectId) return null;
    const value = await this.backend.get(stored.externalRef);
    if (value === null) return null;
    await this.audit.append(event("read", input.actor, input.purpose, stored.reference));
    return value;
  }

  async resolveActiveReference(input: {
    actor: CredentialVaultActor;
    referenceId: string;
    kind: CredentialSecretKind;
    purpose: string;
  }): Promise<string | null> {
    const stored = await this.records.get(input.referenceId);
    if (
      !stored ||
      stored.status !== "active" ||
      stored.reference.kind !== input.kind ||
      stored.reference.projectId !== input.actor.projectId
    ) {
      return null;
    }
    const value = await this.backend.get(stored.externalRef);
    if (value === null) return null;
    await this.audit.append(event("read", input.actor, input.purpose, stored.reference));
    return value;
  }

  async rotate(input: {
    actor: CredentialVaultActor;
    reference: CredentialSecretReference;
    secret: string;
    purpose: string;
  }): Promise<CredentialSecretReference | null> {
    assertSecret(input.secret);
    const stored = await this.records.get(input.reference.id);
    if (!stored || stored.status !== "active" || !sameReference(stored.reference, input.reference)) return null;
    if (input.actor.projectId !== stored.reference.projectId) return null;

    stored.status = "superseded";
    await this.records.update(stored);
    await this.backend.remove(stored.externalRef);
    const next: CredentialSecretReference = { ...stored.reference, id: randomUUID(), version: stored.reference.version + 1 };
    const externalRef = `credential/${next.id}/v${next.version}`;
    await this.backend.put({ externalRef, secret: input.secret });
    await this.records.put({ reference: next, status: "active", externalRef });
    await this.audit.append(event("rotated", input.actor, input.purpose, stored.reference));
    return { ...next };
  }

  async replaceSecret(input: {
    actor: CredentialVaultActor;
    reference: CredentialSecretReference;
    secret: string;
    purpose: string;
  }): Promise<CredentialSecretReference | null> {
    assertSecret(input.secret);
    const stored = await this.records.get(input.reference.id);
    if (!stored || stored.status !== "active" || !sameReference(stored.reference, input.reference)) return null;
    if (input.actor.projectId !== stored.reference.projectId) return null;

    // Same-reference value swap: keeps id/kind/version stable so existing
    // version-1 resolve contracts keep working; the old value is removed and
    // the replacement is audited as a rotation.
    await this.backend.remove(stored.externalRef);
    const externalRef = `credential/${stored.reference.id}/v${stored.reference.version}`;
    await this.backend.put({ externalRef, secret: input.secret });
    await this.records.put({ reference: stored.reference, status: "active", externalRef });
    await this.audit.append(event("rotated", input.actor, input.purpose, stored.reference));
    return { ...stored.reference };
  }

  async revoke(input: {
    actor: CredentialVaultActor;
    reference: CredentialSecretReference;
    purpose: string;
  }): Promise<boolean> {
    const stored = await this.records.get(input.reference.id);
    if (!stored || (stored.status !== "active" && stored.status !== "staged") || !sameReference(stored.reference, input.reference)) return false;
    if (input.actor.projectId !== stored.reference.projectId) return false;
    stored.status = "revoked";
    await this.records.update(stored);
    await this.backend.remove(stored.externalRef);
    await this.audit.append(event("revoked", input.actor, input.purpose, stored.reference));
    return true;
  }

  /**
   * One-way compatibility bridge for legacy encrypted stores. It reads the
   * legacy value only long enough to write it to the canonical backend, then
   * returns an opaque canonical reference. Callers must persist that reference
   * and stop using the legacy reader after reconciliation.
   */
  async migrateLegacySecret(input: {
    actor: CredentialVaultActor;
    kind: CredentialSecretKind;
    purpose: string;
    readLegacy: () => Promise<string | null>;
  }): Promise<CredentialSecretReference | null> {
    const secret = await input.readLegacy();
    if (secret === null) return null;
    return this.create({ actor: input.actor, kind: input.kind, secret, purpose: input.purpose });
  }

  async metadata(referenceId: string): Promise<Omit<StoredSecret, "externalRef"> | null> {
    const record = await this.records.get(referenceId);
    return record ? { reference: { ...record.reference }, status: record.status } : null;
  }
}

let managedCredentialVault: CredentialVaultService | null = null;

/**
 * Installs the deployment's managed vault adapter. Application code must not
 * substitute memory or disk adapters here; those implementations are test
 * seams only.
 */
export function installManagedCredentialVault(service: CredentialVaultService): void {
  if (managedCredentialVault && managedCredentialVault !== service) {
    throw new Error("A managed credential vault is already installed.");
  }
  managedCredentialVault = service;
}

export function getManagedCredentialVault(): CredentialVaultService | null {
  return managedCredentialVault;
}

export class InMemoryCredentialVaultBackend implements CredentialVaultBackend {
  private readonly values = new Map<string, string>();
  async put(input: { externalRef: string; secret: string }): Promise<void> { this.values.set(input.externalRef, input.secret); }
  async get(externalRef: string): Promise<string | null> { return this.values.get(externalRef) ?? null; }
  async remove(externalRef: string): Promise<void> { this.values.delete(externalRef); }
}

export class InMemoryCredentialVaultAuditSink implements CredentialVaultAuditSink {
  readonly events: CredentialVaultAuditEvent[] = [];
  async append(entry: CredentialVaultAuditEvent): Promise<void> { this.events.push({ ...entry }); }
}

/** Test-only record store. Production must implement this against Postgres. */
export class InMemoryCredentialVaultRecordStore implements CredentialVaultRecordStore {
  private readonly records = new Map<string, StoredSecret>();
  async put(record: StoredSecret): Promise<void> { this.records.set(record.reference.id, cloneRecord(record)); }
  async get(referenceId: string): Promise<StoredSecret | null> {
    const record = this.records.get(referenceId);
    return record ? cloneRecord(record) : null;
  }
  async update(record: StoredSecret): Promise<void> { this.records.set(record.reference.id, cloneRecord(record)); }
}

function assertSecret(secret: string): void {
  if (typeof secret !== "string" || secret.trim().length === 0) throw new Error("Credential secret is required.");
}

function sameReference(left: CredentialSecretReference, right: CredentialSecretReference): boolean {
  return left.id === right.id && left.projectId === right.projectId && left.kind === right.kind && left.version === right.version;
}

function event(action: CredentialVaultAuditEvent["action"], actor: CredentialVaultActor, purpose: string, reference: CredentialSecretReference): CredentialVaultAuditEvent {
  return { action, actorId: actor.id, projectId: actor.projectId, purpose, referenceId: reference.id, version: reference.version, occurredAt: new Date().toISOString() };
}

function cloneRecord(record: StoredSecret): StoredSecret {
  return { reference: { ...record.reference }, status: record.status, externalRef: record.externalRef };
}
