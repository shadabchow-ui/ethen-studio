import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthenticatedRequestContext {
  jwt: string;
  actorId: string;
  projectId: string;
  role?: string;
}

export interface MintJwtInput {
  subject: string;
  projectId?: string;
  role?: string;
  /** Unix seconds. Defaults to one hour from mint time. */
  exp?: number;
  secret: string;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function parseJwtParts(jwt: string): { header: string; payload: string; signature: string } {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Malformed JWT.");
  }
  return { header: parts[0], payload: parts[1], signature: parts[2] };
}

/** Mint a compact HS256 JWT for certification harnesses (never used as a production issuer). */
export function mintHs256Jwt(input: MintJwtInput): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = input.exp ?? Math.floor(Date.now() / 1000) + 3600;
  const body: Record<string, unknown> = { sub: input.subject, exp, iat: Math.floor(Date.now() / 1000) };
  if (input.projectId) body.project_id = input.projectId;
  if (input.role) body.role = input.role;
  const payload = b64url(JSON.stringify(body));
  const signature = createHmac("sha256", input.secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** Verify an HS256 JWT and return the trusted subject claims. */
export function verifyHs256Jwt(
  jwt: string,
  secret: string,
  nowMs: number = Date.now(),
): { sub: string; projectId: string | null; role: string | null; exp: number } {
  const { header, payload, signature } = parseJwtParts(jwt);
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid JWT signature.");
  }
  const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown };
  if (decodedHeader.alg !== "HS256") throw new Error("Unsupported JWT algorithm.");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub?: unknown;
    exp?: unknown;
    project_id?: unknown;
    role?: unknown;
  };
  if (typeof decoded.sub !== "string" || !decoded.sub) throw new Error("Invalid JWT subject.");
  if (typeof decoded.exp !== "number" || decoded.exp * 1000 <= nowMs) throw new Error("Invalid or expired JWT.");
  return {
    sub: decoded.sub,
    projectId: typeof decoded.project_id === "string" ? decoded.project_id : null,
    role: typeof decoded.role === "string" ? decoded.role : null,
    exp: decoded.exp,
  };
}

export function bearerContext(jwt: string, projectId: string, secret?: string): AuthenticatedRequestContext {
  if (secret) {
    const verified = verifyHs256Jwt(jwt, secret);
    return { jwt, actorId: verified.sub, projectId, role: verified.role ?? undefined };
  }
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("Malformed JWT.");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; role?: unknown };
  if (typeof decoded.sub !== "string" || (typeof decoded.exp === "number" && decoded.exp * 1000 <= Date.now())) {
    throw new Error("Invalid or expired JWT.");
  }
  return {
    jwt,
    actorId: decoded.sub,
    projectId,
    role: typeof decoded.role === "string" ? decoded.role : undefined,
  };
}
