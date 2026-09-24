# Clerk removal account-impact review

Status: required before Clerk removal; not complete in SOL-07.

Clerk remains a compatibility authentication front end only. Supabase
`auth.users.id` is the canonical database and RLS identity. Before removing
Clerk, the accountable migration owner must record and approve:

- the count of active Clerk sessions and mapped versus unmapped accounts;
- verified recovery paths for accounts that lack a Supabase mapping;
- notification and support coverage for sign-in changes;
- a staged rollout, rollback window, and post-cutover reconciliation; and
- confirmation that no production dependency still reads Clerk identity as a
  database authority.

This review intentionally contains no account data and does not authorize
Clerk removal.
