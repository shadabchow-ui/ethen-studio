# Shared-file drift baseline (MUSE-026)

This directory declares the repo's vendored shared files and pins their
content hashes so CI fails on undeclared divergence.

- `tier*.txt` — covered tier lists. Each line names one vendored file
  (relative path; `#` comments and blank lines allowed). Tier files are
  copies whose content must change only through a declared baseline
  update. `*-owned.txt` lists this repo's own files and is intentionally
  NOT covered by the gate.
- `DRIFT_BASELINE.json` — committed hash baseline plus the tier-list set
  it covers. `absent` records tier entries missing at baseline time;
  `divergences` carries optional per-file reason annotations.
- Gate: `node scripts/check-shared-drift.ts` (also `pnpm check:shared-drift`,
  wired into CI). Exit 0 + `SHARED_DRIFT=PASS` means the working tree
  matches the baseline exactly.
- Regen: `node scripts/check-shared-drift.ts --regen`, then commit the
  rewritten baseline in the same change that modifies the tier files.
  The regen commit message is the declaration of the divergence.

Repos with no tier lists ship an empty baseline; the gate passes
vacuously and fails closed if a tier list appears without a baseline
update. The gate enforces declared-change-only against the committed
baseline; live cross-repo comparison is a periodic manual step.
