# Independence report (S2, Phase 11)

Extract dir: `/tmp/ethen-studio-extract`
Fresh-clone dir: `/tmp/ethen-studio-freshclone` (copy minus
`node_modules`/`.next`, then `pnpm install --frozen-lockfile`)

## Static independence

```text
OUTSIDE_REPO_IMPORTS=0            (every relative import in ts/tsx/mjs/cjs resolves inside)
OUTSIDE_REPO_SYMLINKS=0           (excluding node_modules/.next build links)
ABSOLUTE_LOCAL_PATH_DEPENDENCIES=0 (no /Users/*, /home/*, /private/* in sources)
MONOREPO_APP_IMPORTS=0            (no import-level apps/<other>/* references)
```

`node_modules/@ethen/*` in the fresh clone resolve inside the clone
(verified by `realpath`); `pnpm-lock.yaml` contains no monorepo paths.

## Gate parity (extract vs fresh clone vs HEAD)

```text
                                HEAD        extract     fresh clone
pnpm install                    n/a         PASS        PASS (--frozen-lockfile)
typecheck errors                84          84          84
  NEW_TYPE_ERRORS               -           0           0
test suites pass/total          20/27       22/27       22/27
  NEW_TEST_FAILURES             -           0           0
  FIXED_SINCE_HEAD              -           2           2
build module errors             5           5           5
  BUILD_REGRESSION              -           NO          NO
P07 chain (in-process)          PASS        PASS        (same tree)
proxy gate (in-process)         n/a         PASS        (same tree)
catalog projector bytes         n/a         IDENTICAL   (same tree)
```

Typecheck verdict: `NO_REGRESSION_PRE_EXISTING_FAILURES` (84 inherited;
the only textual diff is the intentional StudioLifecycle specifier
rewrite plus union print-order noise).

Test verdicts: the 5 remaining failures (media-contracts, rec02f, stu-31,
stu-34, sidebar) fail with byte-identical signatures at HEAD and
standalone. Fixed since HEAD: stu-33 (ui exports completion),
boundary (standalone rewrite; behavioral sections identical and passing).

Build verdict: both fail identically on the same 5 HEAD-absent modules
from the same importers (`BUILD_REGRESSION=NO`, `BUILD=PASS` not
achieved — promotion blocker, see `docs/PRODUCTION_AUTHORITY.md`).

## Independence conclusion

```text
MONOREPO_REQUIRED_FOR_INSTALL=NO
MONOREPO_REQUIRED_FOR_BUILD=NO
MONOREPO_REQUIRED_FOR_TEST=NO
```

Proven by the fresh clone, which never touches the monorepo and
reproduces every gate result.
