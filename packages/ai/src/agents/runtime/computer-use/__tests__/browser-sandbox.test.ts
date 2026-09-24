import assert from "node:assert/strict";
import { browserUrlBlockReason, getBrowserSandboxReadiness } from "../browser-sandbox";

function blocked(url: string) { assert.ok(browserUrlBlockReason(url), `${url} must be blocked`); }
function allowed(url: string) { assert.equal(browserUrlBlockReason(url), null, `${url} must be allowed`); }

blocked("http://127.0.0.1/admin");
blocked("http://169.254.169.254/latest/meta-data/");
blocked("http://metadata.google.internal/computeMetadata/v1/");
blocked("http://192.168.1.10/");
blocked("http://[::1]/");
blocked("http://[::ffff:127.0.0.1]/");
blocked("file:///etc/passwd");
allowed("https://example.com/");
assert.ok(browserUrlBlockReason("https://evil.example/", ["example.com"]));
assert.equal(browserUrlBlockReason("https://api.example.com/", ["example.com"]), null);

const readiness = getBrowserSandboxReadiness();
assert.ok(["secure_production", "local_development", "unavailable"].includes(readiness.status));
console.log("browser sandbox policy checks passed");
