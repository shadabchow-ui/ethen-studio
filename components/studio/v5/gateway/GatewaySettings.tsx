/**
 * STUDIO_19 — gateway settings section (API keys, BYOK, webhooks).
 * Minimal management over existing settings composition: key metadata
 * with scope/revoke/rotate, BYOK vault references, webhook
 * subscriptions and delivery status. Secrets are revealed once on
 * user action (create/rotate/subscribe response) with a safe copy
 * button, then dropped from state — never re-fetched or logged.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StudioErrorState, StudioLoadingState } from "../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

interface KeyRow {
  keyId: string;
  name: string;
  prefix: string;
  scope: { projects: string[]; tasks: string[] };
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ByokRow {
  referenceId: string;
  provider: string;
  label: string;
  createdAt: string;
}

interface WebhookRow {
  subscriptionId: string;
  projectId: string | null;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
}

interface DeliveryRow {
  deliveryId: string;
  subscriptionId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface OnceSecret {
  kind: "key" | "webhook";
  label: string;
  secret: string;
}

async function readEnvelope(response: Response): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; message: string }> {
  let parsed: { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } } = {};
  try {
    parsed = (await response.json()) as typeof parsed;
  } catch {
    parsed = {};
  }
  return {
    ok: response.ok && parsed.ok === true,
    status: response.status,
    data: parsed.data ?? {},
    message: parsed.error?.message ?? `Request failed (${response.status}).`,
  };
}

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  return Promise.resolve(false);
}

const inputClass = `min-h-[44px] w-full max-w-full rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`;
const buttonClass = `inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`;
const primaryButtonClass = `inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] ${STUDIO_FOCUS_RING_CLASS}`;
const dangerButtonClass = `inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`;
const cardClass = "rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4";
const labelClass = "mb-1 block text-sm font-medium text-[var(--text-secondary)]";

export function GatewaySettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [byok, setByok] = useState<ByokRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<WebhookRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [onceSecret, setOnceSecret] = useState<OnceSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyProjects, setKeyProjects] = useState("*");
  const [keyTasks, setKeyTasks] = useState("*");
  const [byokProvider, setByokProvider] = useState("fal");
  const [byokVaultKeyId, setByokVaultKeyId] = useState("");
  const [byokLabel, setByokLabel] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState("job.completed,job.failed");
  const secretHeadingRef = useRef<HTMLHeadingElement>(null);

  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [keysRes, byokRes, subsRes, delRes] = await Promise.all([
          fetch("/api/studio/v1/gateway/keys", { cache: "no-store" }),
          fetch("/api/studio/v1/gateway/byok", { cache: "no-store" }),
          fetch("/api/studio/v1/gateway/webhooks", { cache: "no-store" }),
          fetch("/api/studio/v1/gateway/deliveries?limit=25", { cache: "no-store" }),
        ]);
        const parsed = await Promise.all([keysRes, byokRes, subsRes, delRes].map(readEnvelope));
        if (cancelled) return;
        if (parsed.some((p) => p.status === 401 || p.status === 403)) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        const failed = parsed.find((p) => !p.ok);
        if (failed) {
          setError(failed.message);
          setLoading(false);
          return;
        }
        setKeys((parsed[0].data.keys as KeyRow[] | undefined) ?? []);
        setByok((parsed[1].data.references as ByokRow[] | undefined) ?? []);
        setSubscriptions((parsed[2].data.subscriptions as WebhookRow[] | undefined) ?? []);
        setDeliveries((parsed[3].data.deliveries as DeliveryRow[] | undefined) ?? []);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Gateway settings are unreachable. Check your connection and retry.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (onceSecret) {
      secretHeadingRef.current?.focus();
    }
  }, [onceSecret]);

  const reveal = (next: OnceSecret) => {
    setNotice(null);
    setCopied(false);
    setOnceSecret(next);
  };

  const dismissSecret = () => {
    setOnceSecret(null);
    setCopied(false);
  };

  const onCopy = async () => {
    if (!onceSecret) return;
    const done = await copyText(onceSecret.secret);
    setCopied(done);
    if (!done) setNotice("Copy failed — select the secret text manually.");
  };

  const createKey = async () => {
    setNotice(null);
    const projects = keyProjects.split(",").map((s) => s.trim()).filter(Boolean);
    const tasks = keyTasks.split(",").map((s) => s.trim()).filter(Boolean);
    const response = await fetch("/api/studio/v1/gateway/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName.trim(), projects, tasks }),
    });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const key = parsed.data.key as KeyRow;
    const secret = parsed.data.secret as string | undefined;
    setKeys((current) => [key, ...current]);
    setKeyName("");
    if (secret) reveal({ kind: "key", label: `New key “${key.name}”`, secret });
    else setNotice("Key created.");
  };

  const revokeKey = async (keyId: string, name: string) => {
    setNotice(null);
    const response = await fetch(`/api/studio/v1/gateway/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const key = parsed.data.key as KeyRow;
    setKeys((current) => current.map((row) => (row.keyId === keyId ? key : row)));
    setNotice(`Key “${name}” revoked.`);
  };

  const rotateKey = async (keyId: string, name: string) => {
    setNotice(null);
    const response = await fetch(`/api/studio/v1/gateway/keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST" });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const key = parsed.data.key as KeyRow;
    const secret = parsed.data.secret as string | undefined;
    setKeys((current) => [key, ...current.map((row) => (row.keyId === keyId ? { ...row, revokedAt: new Date().toISOString() } : row))]);
    if (secret) reveal({ kind: "key", label: `Rotated key “${name}”`, secret });
    else setNotice(`Key “${name}” rotated.`);
  };

  const registerByok = async () => {
    setNotice(null);
    const response = await fetch("/api/studio/v1/gateway/byok", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: byokProvider, vaultKeyId: byokVaultKeyId.trim(), label: byokLabel.trim() }),
    });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const reference = parsed.data.reference as ByokRow;
    setByok((current) => [reference, ...current]);
    setByokVaultKeyId("");
    setByokLabel("");
    setNotice(`BYOK reference “${reference.label}” registered.`);
  };

  const subscribeWebhook = async () => {
    setNotice(null);
    const events = webhookEvents.split(",").map((s) => s.trim()).filter(Boolean);
    const response = await fetch("/api/studio/v1/gateway/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: webhookUrl.trim(), events }),
    });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const subscription = parsed.data.subscription as WebhookRow;
    const secret = parsed.data.secret as string | undefined;
    setSubscriptions((current) => [subscription, ...current]);
    setWebhookUrl("");
    if (secret) reveal({ kind: "webhook", label: `Webhook signing secret`, secret });
    else setNotice("Webhook subscribed.");
  };

  const deleteSubscription = async (subscriptionId: string) => {
    setNotice(null);
    const response = await fetch(`/api/studio/v1/gateway/webhooks/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    setSubscriptions((current) => current.filter((row) => row.subscriptionId !== subscriptionId));
    setNotice("Webhook subscription deleted.");
  };

  const redeliver = async (subscriptionId: string, deliveryId: string) => {
    setNotice(null);
    const response = await fetch(
      `/api/studio/v1/gateway/webhooks/${encodeURIComponent(subscriptionId)}/redeliver`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deliveryId }) },
    );
    const parsed = await readEnvelope(response);
    if (!parsed.ok) {
      setNotice(parsed.message);
      return;
    }
    const delivery = parsed.data.delivery as DeliveryRow;
    setDeliveries((current) => current.map((row) => (row.deliveryId === deliveryId ? delivery : row)));
    setNotice("Delivery queued for redelivery.");
  };

  if (loading) {
    return (
      <div data-testid="gateway-settings">
        <StudioLoadingState title="Loading API access…" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div data-testid="gateway-settings">
        <StudioErrorState
          title="API access needs a signed-in tenant member"
          description="Sign in with a Studio tenant account to manage keys and webhooks."
          testId="gateway-forbidden"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="gateway-settings">
        <StudioErrorState
          title="API access is unavailable"
          description={error}
          retryLabel="Retry"
          onRetry={retry}
          testId="gateway-error"
        />
      </div>
    );
  }

  const empty = keys.length === 0 && subscriptions.length === 0;

  return (
    <div data-testid="gateway-settings" className="flex w-full max-w-full flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">API keys and webhooks</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Scoped keys for the V1 gateway, BYOK vault references, and signed webhook deliveries.
        </p>
      </div>

      {notice ? (
        <div data-testid="gateway-notice" role="status" className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {onceSecret ? (
        <div data-testid="gateway-secret-once" role="alert" className={cardClass}>
          <h3 ref={secretHeadingRef} tabIndex={-1} className={`${STUDIO_FOCUS_RING_CLASS} text-base font-semibold`}>
            {onceSecret.label} — copy now, it is shown once
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            This secret is never stored in Studio. Copy it now; dismissing clears it.
          </p>
          <code className="mt-2 block max-w-full overflow-x-auto break-all rounded-[12px] bg-[var(--bg-inset)] p-3 font-mono text-[13px] text-[var(--text-primary)]">
            {onceSecret.secret}
          </code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass} onClick={() => void onCopy()}>
              {copied ? "Copied" : "Copy secret"}
            </button>
            <button type="button" className={buttonClass} onClick={dismissSecret}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {empty ? (
        <div data-testid="gateway-empty" className={cardClass}>
          <h3 className="text-base font-semibold">No API keys yet</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Mint a scoped key to call the V1 gateway, or register a webhook below.
          </p>
        </div>
      ) : null}

      <section data-testid="gateway-keys" aria-labelledby="gateway-keys-heading" className="flex flex-col gap-3">
        <h3 id="gateway-keys-heading" className="text-base font-semibold">
          API keys
        </h3>
        {keys.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No keys. Mint one to get started.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.map((key) => (
              <li key={key.keyId} data-testid={`gateway-key-${key.keyId}`} className={`${cardClass} flex flex-col gap-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{key.name}</strong>
                  <span className="text-xs text-[var(--text-secondary)]">…{key.prefix}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  projects: {key.scope.projects.join(", ")} · tasks: {key.scope.tasks.join(", ")}
                  {key.expiresAt ? ` · expires ${key.expiresAt.slice(0, 10)}` : " · no expiry"}
                  {key.revokedAt ? " · revoked" : ""}
                </p>
                {!key.revokedAt ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass} onClick={() => void rotateKey(key.keyId, key.name)}>
                      Rotate
                    </button>
                    <button type="button" className={dangerButtonClass} onClick={() => void revokeKey(key.keyId, key.name)}>
                      Revoke
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form
          data-testid="gateway-key-create"
          className={`${cardClass} flex flex-col gap-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void createKey();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="gateway-key-name">
              Key name
            </label>
            <input
              id="gateway-key-name"
              className={inputClass}
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="CI deploy key"
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="gateway-key-projects">
                Projects (comma-separated, or *)
              </label>
              <input
                id="gateway-key-projects"
                className={inputClass}
                value={keyProjects}
                onChange={(event) => setKeyProjects(event.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gateway-key-tasks">
                Tasks (comma-separated, or *)
              </label>
              <input
                id="gateway-key-tasks"
                className={inputClass}
                value={keyTasks}
                onChange={(event) => setKeyTasks(event.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <button type="submit" className={primaryButtonClass}>
              Mint key
            </button>
          </div>
        </form>
      </section>

      <section data-testid="gateway-byok" aria-labelledby="gateway-byok-heading" className="flex flex-col gap-3">
        <h3 id="gateway-byok-heading" className="text-base font-semibold">
          BYOK vault references
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Opaque vault pointers only — Studio never sees or stores provider secrets.
        </p>
        {byok.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {byok.map((row) => (
              <li key={row.referenceId} className={cardClass}>
                <strong className="text-sm">{row.label}</strong>
                <p className="text-xs text-[var(--text-secondary)]">
                  {row.provider} · registered {row.createdAt.slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form
          className={`${cardClass} flex flex-col gap-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void registerByok();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="gateway-byok-provider">
                Provider
              </label>
              <select
                id="gateway-byok-provider"
                className={inputClass}
                value={byokProvider}
                onChange={(event) => setByokProvider(event.target.value)}
              >
                <option value="fal">fal</option>
                <option value="openai">openai</option>
                <option value="elevenlabs">elevenlabs</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="gateway-byok-vault">
                Vault key id
              </label>
              <input
                id="gateway-byok-vault"
                className={inputClass}
                value={byokVaultKeyId}
                onChange={(event) => setByokVaultKeyId(event.target.value)}
                placeholder="vault key pointer"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gateway-byok-label">
                Label
              </label>
              <input
                id="gateway-byok-label"
                className={inputClass}
                value={byokLabel}
                onChange={(event) => setByokLabel(event.target.value)}
                placeholder="Team fal key"
                required
              />
            </div>
          </div>
          <div>
            <button type="submit" className={primaryButtonClass}>
              Register reference
            </button>
          </div>
        </form>
      </section>

      <section data-testid="gateway-webhooks" aria-labelledby="gateway-webhooks-heading" className="flex flex-col gap-3">
        <h3 id="gateway-webhooks-heading" className="text-base font-semibold">
          Webhooks
        </h3>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No subscriptions. Destinations must be HTTPS.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subscriptions.map((sub) => (
              <li key={sub.subscriptionId} className={`${cardClass} flex flex-col gap-2`}>
                <strong className="break-all text-sm">{sub.url}</strong>
                <p className="text-xs text-[var(--text-secondary)]">
                  {sub.events.join(", ")} · {sub.status}
                </p>
                <div>
                  <button type="button" className={dangerButtonClass} onClick={() => void deleteSubscription(sub.subscriptionId)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className={`${cardClass} flex flex-col gap-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void subscribeWebhook();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="gateway-webhook-url">
              Destination URL (HTTPS only)
            </label>
            <input
              id="gateway-webhook-url"
              className={inputClass}
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://example.com/studio-events"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="gateway-webhook-events">
              Events (comma-separated)
            </label>
            <input
              id="gateway-webhook-events"
              className={inputClass}
              value={webhookEvents}
              onChange={(event) => setWebhookEvents(event.target.value)}
              required
            />
          </div>
          <div>
            <button type="submit" className={primaryButtonClass}>
              Subscribe
            </button>
          </div>
        </form>
      </section>

      <section data-testid="gateway-deliveries" aria-labelledby="gateway-deliveries-heading" className="flex flex-col gap-3">
        <h3 id="gateway-deliveries-heading" className="text-base font-semibold">
          Delivery status
        </h3>
        {deliveries.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No deliveries yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {deliveries.map((delivery) => (
              <li key={delivery.deliveryId} className={cardClass}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{delivery.eventType}</strong>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {delivery.status} · {delivery.attemptCount} attempt{delivery.attemptCount === 1 ? "" : "s"}
                  </span>
                </div>
                {delivery.status === "retrying" && delivery.nextRetryAt ? (
                  <p className="text-xs text-[var(--text-secondary)]">next retry {delivery.nextRetryAt}</p>
                ) : null}
                {delivery.lastError ? (
                  <p className="text-xs text-[var(--text-secondary)]">{delivery.lastError}</p>
                ) : null}
                {delivery.status === "dead_letter" ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => void redeliver(delivery.subscriptionId, delivery.deliveryId)}
                    >
                      Redeliver
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
