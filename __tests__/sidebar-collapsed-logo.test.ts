/**
 * Collapsed-sidebar logo regression test.
 * Run with: npx tsx __tests__/sidebar-collapsed-logo.test.ts
 * (from apps/studio; repo root equivalent:
 *  node --import tsx apps/studio/__tests__/sidebar-collapsed-logo.test.ts)
 *
 * Guards the narrow production fix for the collapsed Chat-rail brand mark.
 * The shared ChatSidebar swaps the brand image by rail state: the expanded
 * wordmark stays exactly as-is, while the collapsed rail shows the compact
 * Ethen cube. Studio is a standalone deployable, so it must ship the same
 * cube bytes the Chat app serves — a byte-identical copy is reuse, not a
 * fork. No code, geometry, or interaction change is part of this fix.
 *
 * Standalone edition: STUDIO is the repo root, packages resolve under
 * ./packages, and the (HEAD-absent) Chat authoritative cube is replaced by a
 * pinned SHA256 recorded at extraction (Gate 5b). Gate 5 keeps its original
 * verdict semantics against the monorepo path when present.
 *
 * Proven on success:
 *   SIDEBAR_EXPANDED_LOGO=PASS
 *   SIDEBAR_COLLAPSED_LOGO=PASS
 *   SIDEBAR_COLLAPSED_LOGO_CLIPPED=NO
 *   SIDEBAR_COLLAPSED_LOGO_BROKEN=NO
 *   SIDEBAR_LOGO_ASSET_FORKED=NO
 *
 * Static by design (no network, no browser): source/CSS contracts over the
 * real shared-sidebar files plus byte-level checks of the served asset.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(HERE, "..");
const ROOT = STUDIO;

// Studio stays decoupled from sibling deployables (see boundary.test.ts),
// so the authoritative cube is located by path segments, never by a literal
// cross-app path.
const CHAT_APP_DIR = "chat-core";
const AUTHORITATIVE_CUBE = join(
  ROOT,
  "apps",
  CHAT_APP_DIR,
  "public",
  "brand",
  "ethen-cube.png",
);
const STUDIO_CUBE = join(STUDIO, "public", "brand", "ethen-cube.png");
// Recorded from committed SOURCE_HEAD cf3aabdb4 (the chat-core authoritative
// path was already absent there, so Gate 5 was UNVERIFIED at HEAD).
const PINNED_STUDIO_CUBE_SHA256 = "6d976eeb8bdf1b44caf9107e4111c2c4d559332a5f7845f203ef317d05c712bd";
const SIDEBAR_SOURCE = join(ROOT, "packages", "ui", "src", "chat-lab", "chat-sidebar.tsx");
const SIDEBAR_CSS = join(ROOT, "packages", "ui", "src", "chat-lab", "chat-sidebar.module.css");
const COMPACT_RAIL_SOURCE = join(ROOT, "packages", "app-shell", "src", "CompactIconRail.tsx");
const STUDIO_CHROME_SOURCE = join(STUDIO, "components", "studio", "StudioWorkbenchChrome.tsx");

const failures: string[] = [];

function check(condition: boolean, label: string): void {
  if (!condition) failures.push(label);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngSize(path: string): { width: number; height: number } | null {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buf = readFileSync(path);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Extract the declaration block of a top-level class rule. */
function topRule(css: string, name: string): string {
  return new RegExp(`^\\.${name}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
}

/** Extract the declaration block of a collapsed-rail scoped class rule. */
function collapsedRule(css: string, name: string): string {
  return (
    new RegExp(`\\.rail\\[data-collapsed="true"\\]\\s*\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ??
    ""
  );
}

function px(rule: string, prop: string): number | null {
  const match = new RegExp(`${prop}:\\s*(\\d+)px`).exec(rule);
  return match ? Number(match[1]) : null;
}

function main(): void {
  const source = readFileSync(SIDEBAR_SOURCE, "utf8");
  const css = readFileSync(SIDEBAR_CSS, "utf8");

  // ── Gate 1: expanded logo contract unchanged ──
  const expandedChecks: Array<[boolean, string]> = [
    [
      source.includes('src={railCollapsed ? "/brand/ethen-cube.png" : "/brand/ethen-logo.webp"}'),
      "expanded sidebar keeps the ethen-logo.webp source",
    ],
    [
      source.includes("height={railCollapsed ? 28 : 20}"),
      "expanded logo keeps height 20",
    ],
    [
      source.includes("width={railCollapsed ? 28 : undefined}"),
      "expanded logo keeps width auto",
    ],
    [
      px(topRule(css, "brandLogo"), "height") === 20 && topRule(css, "brandLogo").includes("width: auto"),
      "expanded .brandLogo keeps 20px height with auto width",
    ],
    [
      topRule(css, "brandRow").includes("padding: 12px 16px 10px"),
      "brand row keeps the 12/16/10 spacing language",
    ],
  ];
  const expandedPass = expandedChecks.every(([ok]) => ok);
  for (const [ok, label] of expandedChecks) check(ok, `expanded: ${label}`);

  // ── Gate 2: collapsed logo contract ──
  const compactRail = readFileSync(COMPACT_RAIL_SOURCE, "utf8");
  const collapsedLogoRule = collapsedRule(css, "brandLogo");
  const collapsedChecks: Array<[boolean, string]> = [
    [
      source.includes('data-collapsed={railCollapsed ? "true" : undefined}'),
      "rail exposes the collapsed state for styling",
    ],
    [
      source.includes('"/brand/ethen-cube.png"') && compactRail.includes('"/brand/ethen-cube.png"'),
      "collapsed sidebar reuses the cube path already used by the compact rail",
    ],
    [
      px(collapsedLogoRule, "width") === 28 && px(collapsedLogoRule, "height") === 28,
      "collapsed logo renders at 28x28",
    ],
    [
      collapsedLogoRule.includes("object-fit: contain"),
      "collapsed logo keeps object-fit contain",
    ],
    [
      source.includes('alt="Ethen"'),
      "brand image keeps its accessible name",
    ],
  ];
  const collapsedPass = collapsedChecks.every(([ok]) => ok);
  for (const [ok, label] of collapsedChecks) check(ok, `collapsed: ${label}`);

  // ── Gate 3: no clipping (box proof + square asset) ──
  const brandBox = collapsedRule(css, "brand");
  const brandBoxWidth = px(brandBox, "width");
  const brandBoxHeight = px(brandBox, "height");
  const studioCubePresent = existsSync(STUDIO_CUBE);
  const intrinsic = studioCubePresent ? pngSize(STUDIO_CUBE) : null;
  const clippedChecks: Array<[boolean, string]> = [
    [
      brandBoxWidth !== null && brandBoxWidth >= 28 && brandBoxHeight !== null && brandBoxHeight >= 28,
      `collapsed .brand box (${brandBoxWidth}x${brandBoxHeight}) fits the 28x28 logo`,
    ],
    [
      brandBox.includes("justify-content: center") && topRule(css, "brand").includes("align-items: center"),
      "collapsed brand box centers the logo on both axes",
    ],
    [
      intrinsic !== null && intrinsic.width === intrinsic.height,
      "cube asset is square, so 28x28 cannot stretch or skew it",
    ],
  ];
  const clipped = !clippedChecks.every(([ok]) => ok);
  for (const [ok, label] of clippedChecks) check(ok, `clipped: ${label}`);

  // ── Gate 4: servable in Studio (no broken image state) ──
  const brokenChecks: Array<[boolean, string]> = [
    [studioCubePresent, "studio serves public/brand/ethen-cube.png"],
    [intrinsic !== null, "studio cube is a decodable PNG"],
  ];
  const broken = !brokenChecks.every(([ok]) => ok);
  for (const [ok, label] of brokenChecks) check(ok, `broken: ${label}`);

  // ── Gate 5: no asset fork (byte-identical to the Chat cube) ──
  let forked: "NO" | "YES" | "UNVERIFIED" = "UNVERIFIED";
  if (studioCubePresent && existsSync(AUTHORITATIVE_CUBE)) {
    forked = sha256(STUDIO_CUBE) === sha256(AUTHORITATIVE_CUBE) ? "NO" : "YES";
  }
  check(forked === "NO", "studio cube is byte-identical to the authoritative Chat cube");
  // Gate 5b (standalone): extraction-pinned integrity of the shipped cube.
  const pinned = studioCubePresent && sha256(STUDIO_CUBE) === PINNED_STUDIO_CUBE_SHA256;
  check(pinned, "studio cube matches the extraction-pinned bytes");

  // ── Scope guards: nothing else moved ──
  // Every file Studio ships under public/brand must be byte-identical to the
  // same-named file the Chat app serves: reuse is allowed, divergence is a
  // fork. (This test does not police which sibling-authorized files exist,
  // only that none of them redesign the brand.)
  const brandDir = join(STUDIO, "public", "brand");
  const chatBrandDir = join(ROOT, "apps", CHAT_APP_DIR, "public", "brand");
  const shipped = existsSync(brandDir) ? readdirSync(brandDir).sort() : [];
  check(shipped.includes("ethen-cube.png"), "studio brand dir ships the collapsed cube");
  for (const file of shipped) {
    const studioFile = join(brandDir, file);
    const chatFile = join(chatBrandDir, file);
    check(
      existsSync(chatFile) && sha256(studioFile) === sha256(chatFile),
      `studio brand file is unforked from Chat: ${file}`,
    );
  }
  check(css.includes("@media (max-width: 768px)"), "mobile drawer rules still present");
  const chrome = readFileSync(STUDIO_CHROME_SOURCE, "utf8");
  check(
    chrome.includes("collapsed={sidebarPrefs.collapsed}") && chrome.includes("onToggleCollapsed"),
    "studio chrome keeps the collapse/expand wiring",
  );

  // ── Report ──
  console.log(`SIDEBAR_EXPANDED_LOGO=${expandedPass ? "PASS" : "FAIL"}`);
  console.log(`SIDEBAR_COLLAPSED_LOGO=${collapsedPass ? "PASS" : "FAIL"}`);
  console.log(`SIDEBAR_COLLAPSED_LOGO_CLIPPED=${clipped ? "YES" : "NO"}`);
  console.log(`SIDEBAR_COLLAPSED_LOGO_BROKEN=${broken ? "YES" : "NO"}`);
  console.log(`SIDEBAR_LOGO_ASSET_FORKED=${forked}`);
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
  const gateCount = 5;
  const gatePass =
    (expandedPass ? 1 : 0) +
    (collapsedPass ? 1 : 0) +
    (!clipped ? 1 : 0) +
    (!broken ? 1 : 0) +
    (forked === "NO" ? 1 : 0);
  console.log(`sidebar collapsed-logo regression: ${gatePass}/${gateCount} gates green`);
  if (failures.length > 0) process.exitCode = 1;
}

main();
