/**
 * Studio V5 M4 — fixture fal-queue server (test/fixture only). Server-only.
 *
 * Lives in core so the hermetic suite, the Temporal integration tests,
 * and the loopback fixture lane share one queue double; the M4-named
 * `tests/fixtures/fal-queue-server.ts` re-exports this module.
 *
 * A loopback HTTP server implementing the queue surface the generic
 * fal-queue adapter speaks: submit (POST /{endpoint}), status poll,
 * result fetch, and cancel, plus deterministic fixture bytes for ingest
 * custody. Every request is logged for assertions; statuses and results
 * are scriptable per request id. Refuses to start in production, and the
 * adapter refuses every non-loopback base in NODE_ENV=test, so no test
 * can touch paid endpoints.
 *
 * Two entrypoints share one dispatch core: `startFixtureFalQueue` binds a
 * real loopback TCP server (live fixture-mode app runs outside sandboxes
 * that forbid listeners), and `createInProcessFixtureQueue` returns a
 * fetch-compatible dispatcher with identical behavior for unit and
 * integration tests (no sockets, no proxy, fully deterministic).
 */
import "server-only";

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export interface FixtureQueueRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FixtureQueueOptions {
  /** Expected `Key <apiKey>` credential; wrong credentials get 401. */
  apiKey?: string;
  /** Default result payload per submit (tests override per request). */
  respond?: (endpointId: string, body: unknown) => unknown;
}

export interface StartedFixtureQueue {
  baseUrl: string;
  requests: FixtureQueueRequest[];
  setStatus(requestId: string, status: string): void;
  setResponse(requestId: string, payload: unknown): void;
  failNextSubmit(status: number, body: unknown): void;
  close(): Promise<void>;
}

/** In-process fixture queue: identical behavior, no sockets. */
export interface LocalFixtureQueue extends StartedFixtureQueue {
  fetch: typeof fetch;
}

const MAGIC: Readonly<Record<string, { mime: string; magic: number[] }>> = {
  ".png": { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ".jpg": { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff, 0xe0] },
  ".webp": { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
  ".mp4": { mime: "video/mp4", magic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] },
  ".mp3": { mime: "audio/mpeg", magic: [0x49, 0x44, 0x33, 0x04] },
  ".wav": { mime: "audio/wav", magic: [0x52, 0x49, 0x46, 0x46] },
  ".glb": { mime: "model/gltf-binary", magic: [0x67, 0x6c, 0x54, 0x46] },
};

function fixtureBytes(name: string): { bytes: Buffer; mime: string } {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const known = MAGIC[ext] ?? { mime: "application/octet-stream", magic: [0x46, 0x49, 0x58] };
  const seed = Buffer.from(`fixture:${name}:`, "utf8");
  const magic = Buffer.from(known.magic);
  const pad = Buffer.alloc(256, 0x61);
  return { bytes: Buffer.concat([magic, seed, pad]), mime: known.mime };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

type FixtureDispatch =
  | { kind: "json"; status: number; payload: unknown }
  | { kind: "bytes"; status: number; bytes: Buffer; mime: string };

interface FixtureQueueCore {
  requests: FixtureQueueRequest[];
  setStatus(requestId: string, status: string): void;
  setResponse(requestId: string, payload: unknown): void;
  failNextSubmit(status: number, body: unknown): void;
  dispatch(method: string, path: string, headers: Record<string, string>, rawBody: string): FixtureDispatch;
}

function refuseProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("STUDIO_FIXTURE_REFUSED: the fixture queue never starts in production.");
  }
}

/** One queue behavior for the TCP server and the in-process dispatcher. */
function createFixtureQueueCore(options: FixtureQueueOptions, linkBase: () => string): FixtureQueueCore {
  const apiKey = options.apiKey ?? "fixture-key";
  const requests: FixtureQueueRequest[] = [];
  const statuses = new Map<string, { status: string; polls: number }>();
  const responses = new Map<string, unknown>();
  let failNext: { status: number; body: unknown } | null = null;

  const json = (status: number, payload: unknown): FixtureDispatch => ({ kind: "json", status, payload });

  function dispatch(method: string, path: string, headers: Record<string, string>, rawBody: string): FixtureDispatch {
    const logged: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      logged[name.toLowerCase()] = name.toLowerCase() === "authorization" ? "[redacted]" : value;
    }
    let body: unknown = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return json(400, { detail: "invalid JSON body" });
      }
    }
    requests.push({ method, path, headers: logged, body });

    if (path.startsWith("/files/")) {
      const name = path.slice("/files/".length);
      if (!name || name.includes("..") || name.includes("/")) {
        return json(404, { detail: "no such fixture file" });
      }
      const { bytes, mime } = fixtureBytes(name);
      return { kind: "bytes", status: 200, bytes, mime };
    }

    const auth = headers["authorization"] ?? headers["Authorization"];
    if (auth !== `Key ${apiKey}`) {
      return json(401, { detail: "invalid credentials" });
    }

    const requestMatch = path.match(/^\/(.+)\/requests\/([^/]+)(\/[^/]+)?$/);
    if (requestMatch) {
      const requestId = requestMatch[2] ?? "";
      const suffix = requestMatch[3] ?? "";
      const entry = statuses.get(requestId);
      if (!entry) {
        return json(404, { detail: "unknown request" });
      }
      if (suffix === "/cancel" && method === "PUT") {
        entry.status = "CANCELED";
        return json(200, { status: "CANCELED" });
      }
      if (suffix === "/status" && method === "GET") {
        entry.polls += 1;
        // First poll observes queued work; later polls observe the
        // scripted (or completed) status, exercising the poll loop.
        const observed = entry.polls === 1 && entry.status === "COMPLETED" ? "IN_PROGRESS" : entry.status;
        return json(200, { status: observed, request_id: requestId });
      }
      if ((suffix === "" || suffix === "/response") && method === "GET") {
        if (entry.status !== "COMPLETED") {
          return json(409, { detail: `request is ${entry.status}` });
        }
        return json(200, (responses.get(requestId) ?? { images: [] }) as Record<string, unknown>);
      }
      return json(404, { detail: "unknown queue path" });
    }

    if (method === "POST") {
      if (failNext) {
        const failed = failNext;
        failNext = null;
        return json(failed.status, failed.body);
      }
      const endpointId = path.replace(/^\/+/, "");
      if (!endpointId) {
        return json(404, { detail: "missing endpoint" });
      }
      const requestId = `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      statuses.set(requestId, { status: "COMPLETED", polls: 0 });
      const base = linkBase();
      if (options.respond) {
        responses.set(requestId, options.respond(endpointId, body));
      }
      return json(200, {
        request_id: requestId,
        status_url: `${base}/${endpointId}/requests/${requestId}/status`,
        response_url: `${base}/${endpointId}/requests/${requestId}`,
      });
    }
    return json(404, { detail: "unknown queue path" });
  }

  return {
    requests,
    setStatus(requestId: string, status: string): void {
      const entry = statuses.get(requestId);
      if (entry) entry.status = status;
      else statuses.set(requestId, { status, polls: 0 });
    },
    setResponse(requestId: string, payload: unknown): void {
      responses.set(requestId, payload);
    },
    failNextSubmit(status: number, body: unknown): void {
      failNext = { status, body };
    },
    dispatch,
  };
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  response.end(text);
}

export async function startFixtureFalQueue(options: FixtureQueueOptions = {}): Promise<StartedFixtureQueue> {
  refuseProduction();
  let port = 0;
  const core = createFixtureQueueCore(options, () => `http://127.0.0.1:${port}`);

  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer(async (request, response) => {
    response.setHeader("connection", "close");
    try {
      const method = (request.method ?? "GET").toUpperCase();
      const url = new URL(request.url ?? "/", "http://fixture");
      const raw = method === "GET" || method === "HEAD" ? "" : await readBody(request);
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string") headers[name] = value;
      }
      const dispatched = core.dispatch(method, url.pathname, headers, raw);
      if (dispatched.kind === "bytes") {
        response.writeHead(200, { "content-type": dispatched.mime, "content-length": dispatched.bytes.byteLength });
        response.end(dispatched.bytes);
        return;
      }
      send(response, dispatched.status, dispatched.payload);
    } catch (error) {
      send(response, 500, { detail: error instanceof Error ? error.message : "fixture error" });
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = (server.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests: core.requests,
    setStatus: core.setStatus,
    setResponse: core.setResponse,
    failNextSubmit: core.failNextSubmit,
    close(): Promise<void> {
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        for (const socket of sockets) socket.destroy();
        setTimeout(() => resolveClose(), 1000).unref();
      });
    },
  };
}

function initHeadersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, name) => {
      record[name] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...(headers as Record<string, string>) };
}

async function initBodyToText(input: unknown, init: RequestInit | undefined): Promise<string> {
  if (init?.body !== undefined && init.body !== null) {
    const body = init.body as unknown;
    if (typeof body === "string") return body;
    if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
    if (body instanceof ArrayBuffer) return Buffer.from(body).toString("utf8");
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body.toString();
    throw new Error("STUDIO_FIXTURE_INVALID: unsupported in-process request body.");
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.text();
  }
  return "";
}

/**
 * In-process fixture queue (no sockets). The returned `fetch` speaks the
 * same queue surface as the TCP server; pass it as the adapter `fetchImpl`
 * with `queueBaseUrl: fixture.baseUrl`.
 */
export function createInProcessFixtureQueue(options: FixtureQueueOptions = {}): LocalFixtureQueue {
  refuseProduction();
  const baseUrl = "http://127.0.0.1";
  const core = createFixtureQueueCore(options, () => baseUrl);

  const fetchImpl: typeof fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      baseUrl,
    );
    const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = initHeadersToRecord(init?.headers);
    if (typeof Request !== "undefined" && input instanceof Request && !init?.headers) {
      input.headers.forEach((value, name) => {
        headers[name] = value;
      });
    }
    const raw = await initBodyToText(input, init);
    const dispatched = core.dispatch(method, url.pathname, headers, raw);
    if (dispatched.kind === "bytes") {
      return new Response(new Uint8Array(dispatched.bytes), {
        status: dispatched.status,
        headers: { "content-type": dispatched.mime },
      });
    }
    return new Response(JSON.stringify(dispatched.payload), {
      status: dispatched.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    baseUrl,
    fetch: fetchImpl,
    requests: core.requests,
    setStatus: core.setStatus,
    setResponse: core.setResponse,
    failNextSubmit: core.failNextSubmit,
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}
