import "server-only";

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { provisionClerkIdentity } from "./provisioning";

const MAX_WEBHOOK_BYTES = 256 * 1024;

async function readBoundedBody(request: Request): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

/** Canonical shared Clerk webhook handler used by auth-api and the legacy route. */
export async function handleClerkWebhook(request: Request): Promise<Response> {
  const signingSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!signingSecret) {
    return Response.json({ code: "WEBHOOK_UNAVAILABLE" }, { status: 503 });
  }

  // Bound the raw body before signature verification; never log it.
  const rawBody = await readBoundedBody(request);
  if (!rawBody) {
    return Response.json(
      { code: request.body ? "PAYLOAD_TOO_LARGE" : "INVALID_WEBHOOK" },
      { status: request.body ? 413 : 401 },
    );
  }

  let event;
  try {
    const body = rawBody.buffer.slice(
      rawBody.byteOffset,
      rawBody.byteOffset + rawBody.byteLength,
    ) as ArrayBuffer;
    event = await verifyWebhook(
      new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      }),
      { signingSecret },
    );
  } catch {
    return Response.json({ code: "INVALID_WEBHOOK" }, { status: 401 });
  }

  if (
    event.type !== "user.created" &&
    event.type !== "user.updated" &&
    event.type !== "user.deleted"
  ) {
    return Response.json({ ok: true });
  }

  const eventId = request.headers.get("svix-id");
  // The installed Clerk SDK omits envelope.timestamp from its return value.
  // Read it from the exact bytes only AFTER their signature was verified.
  const timestamp = (JSON.parse(rawBody.toString("utf8")) as { timestamp?: number }).timestamp;
  if (!eventId || !event.data.id || !Number.isSafeInteger(timestamp) || timestamp! < 0) {
    return Response.json({ code: "INVALID_EVENT" }, { status: 400 });
  }

  const email =
    event.type === "user.deleted"
      ? null
      : (event.data.email_addresses.find(
          (address) =>
            address.id === event.data.primary_email_address_id &&
            address.verification?.status === "verified",
        )?.email_address ?? null);

  try {
    await provisionClerkIdentity({
      id: eventId,
      timestamp: timestamp!,
      type: event.type,
      clerkUserId: event.data.id,
      email,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { code: "IDENTITY_PROVISIONING_RETRY" },
      { status: 503, headers: { "Retry-After": "120" } },
    );
  }
}
