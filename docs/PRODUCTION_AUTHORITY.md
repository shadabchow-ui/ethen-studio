# Production authority

S2 scope: standalone-repo facts are recorded here; live production
discovery (domain → Vercel → project → deployment → repo) is S1/S3-owned
and was out of scope for local separation work.

## Standalone-repo facts (proven locally)

```text
PRODUCTION_SOURCE_REPO (intended)=shadabchow-ui/ethen-studio
MONOREPO_REQUIRED_FOR_INSTALL=NO   (fresh-clone pnpm install --frozen-lockfile: PASS)
MONOREPO_REQUIRED_FOR_BUILD=NO     (fresh-clone build behaves identically to HEAD)
OUTSIDE_REPO_IMPORTS=0
OUTSIDE_REPO_SYMLINKS=0
ABSOLUTE_LOCAL_PATH_DEPENDENCIES=0
```

## Promotion blocker (must clear before S3 cutover)

Committed SOURCE_HEAD (`cf3aabdb4`) is internally inconsistent for Studio:
`apps/studio` at HEAD imports 9 package modules that were never committed
on branch `ethen/studio-v5-final` (they exist only as uncommitted
working-tree files / other branches). Consequence: typecheck (84 errors),
build (5 missing modules), 5 suites, and all page renders fail identically
in the monorepo at HEAD and in this standalone repo (zero NEW failures —
see `artifacts/repo-separation/STANDALONE_CERTIFICATION.md`).

```text
PROMOTION_BLOCKER=HEAD_INCONSISTENCY
MISSING_AT_HEAD=
  @ethen/app-shell/instant-rum/next
  @ethen/app-shell/latest-request-gate
  @ethen/app-shell/a11y/next
  @ethen/contracts/rum/route-identity
  @ethen/database/user-settings
  @ethen/ui/settings/index
  @ethen/ui/settings/settings-data
  @ethen/ui/chat-lab/shared-chat-chrome
  @ethen/ui/design-system/v2/canvas/CanvasViewport
```

To unblock: commit the missing modules (from the working tree after
review, or re-authored) plus the type-level fixes that make HEAD Studio
self-consistent (the live working tree already contains such a state;
verify with `pnpm typecheck`, `pnpm test`, `pnpm build` there first),
then re-run extraction from the new SOURCE_HEAD.

## Live production fields (S1/S3-owned)

```text
LIVE_DOMAIN=TBD (S1)
PRODUCTION_PROVIDER=Vercel (per job config; S1 to prove)
VERCEL_TEAM=TBD (S1)
VERCEL_PROJECT=TBD (S1)
CURRENT_PRODUCTION_DEPLOYMENT=TBD (S1)
ROLLBACK_DEPLOYMENT=TBD (S3, before cutover)
PRODUCTION_CUTOVER=NOT_STARTED
PRODUCTION_RECERTIFICATION=NOT_STARTED
DOMAIN_AUTHORITY=NOT_STARTED
```

No GitHub/Vercel writes were made during separation (LOCAL WORK ONLY).
