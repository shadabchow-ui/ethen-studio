#!/usr/bin/env node
/**
 * Portfolio contract drift check (MUSE-026; pattern from MUSE-010 web pin).
 *
 * Verifies the pinned portfolio release files are byte-identical to the
 * publishing commit (hashes in scripts/portfolio-pin.json). The pinned
 * copy must never be hand-edited: on drift, re-copy from the publisher
 * release, never patch the copy.
 *
 * Prints per-file PASS/FAIL (never digest values) and exits nonzero on
 * any drift or missing file.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pin = JSON.parse(readFileSync(join(root, "scripts", "portfolio-pin.json"), "utf8"));
const dir = join(root, "packages", "contracts", "src", "portfolio");

let failed = 0;
for (const [name, expected] of Object.entries(pin.files)) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    console.log(`DRIFT ${name}: missing`);
    failed += 1;
    continue;
  }
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) {
    console.log(`DRIFT ${name}: hash mismatch (re-copy from ${pin.publisher}@${pin.publisherCommit})`);
    failed += 1;
  } else {
    console.log(`PIN_OK ${name}`);
  }
}
console.log(
  failed === 0
    ? `PORTFOLIO_PIN=PASS (${pin.release} @ ${String(pin.publisherCommit).slice(0, 9)})`
    : `PORTFOLIO_PIN=FAIL (${failed} drifted)`,
);
process.exit(failed === 0 ? 0 : 1);
