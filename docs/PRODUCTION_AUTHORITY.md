# Production authority

Last updated: 2026-09-25 (S4B — production LIVE).

```text
PRODUCTION_DOMAIN=studio.upcube.ai
PRODUCTION_PROVIDER=Vercel
VERCEL_ACCOUNT_OR_TEAM=shadabchow-1091s-projects
VERCEL_PROJECT=ethen-studio
VERCEL_PROJECT_ID=prj_AAknemmdyqxQuYzMsO8l6HpLY73O
PRODUCTION_SOURCE_REPO=shadabchow-ui/ethen-studio
PRODUCTION_DEPLOYMENT_BRANCH=main (productionBranch)
DOMAIN_AUTHORITY=PASS (owner-authorized + DNS-verified CNAME)
TLS=PASS
PREVIOUS_PRODUCTION=NONE (first production)
```

## Standalone independence (proven)

```text
MONOREPO_REQUIRED_FOR_INSTALL=NO
MONOREPO_REQUIRED_FOR_BUILD=NO
MONOREPO_REQUIRED_FOR_DEPLOY=NO
OUTSIDE_REPO_IMPORTS=0
OUTSIDE_REPO_SYMLINKS=0
ABSOLUTE_LOCAL_PATH_DEPENDENCIES=0
```

## Rollback

First production has no predecessor. Rollback target after cutover is the
previous READY deployment on project `ethen-studio`. Rollback on P0/P1
regression, auth failure, Studio load failure, catalog failure, Create
failure, Assets/History regression, Canvas/Workflow regression, critical
API failure, asset failure, 5xx loop, or major parity regression.

## Enrollment (operator-managed)

Private alpha is fail-closed: empty `ETHEN_STUDIO_ENROLLED_ORG_IDS` /
`ETHEN_STUDIO_ENROLLED_USER_IDS` admit nobody. The operator enrolls Clerk
org/user IDs via project env after first sign-in, then redeploys. No user
IDs are hardcoded in code.

Legacy monorepo source `apps/studio` is FROZEN (see `FROZEN.md` there).
Never deploy Studio from the monorepo.
