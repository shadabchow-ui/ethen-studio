-- STUDIO-DEL-01 — PROPOSED bookkeeping tables for in-app account deletion.
--
-- FOR OWNER REVIEW ONLY. NOT APPLIED to any database by the job that wrote it,
-- and not placed in any migrations directory. The Studio table definitions
-- live outside this repository, so this file only covers NEW tables and makes
-- no assumption about existing ones (no foreign keys into them, on purpose:
-- the rows must survive the deletion of the data they describe).
--
-- Backs the AccountDeletionStore port in
-- app/api/settings/account/delete/_lib/handler.ts:
--   request state + completed steps  -> studio_account_deletion_requests
--   asynchronous blob deletion queue -> studio_account_deletion_objects
--   frozen purchased credits         -> studio_account_refund_reviews
--
-- OWNER DECISIONS STILL NEEDED (not guessed here):
--   * subject_key: store the raw Clerk user id, or a keyed hash of it (the
--     request row is a retained record; a hash keeps lookup without keeping
--     the identifier).
--   * Retention period for these rows (rules say "applicable retention
--     schedules"; no duration is set, so none is encoded).
--   * Who works the refund-review queue and how a review is closed.
--
-- ROLLBACK (only before any row is written; afterwards the rows are legal
-- records and must be exported, not dropped):
--   drop table if exists public.studio_account_refund_reviews;
--   drop table if exists public.studio_account_deletion_objects;
--   drop table if exists public.studio_account_deletion_requests;

begin;

create table if not exists public.studio_account_deletion_requests (
  request_id           uuid primary key,
  subject_key          text not null unique,
  account_id           uuid not null,
  created_at           timestamptz not null default now(),
  finalized_at         timestamptz,
  purchased_frozen     bigint not null default 0 check (purchased_frozen >= 0),
  promotional_expiring bigint not null default 0 check (promotional_expiring >= 0),
  icu_frozen           bigint not null default 0 check (icu_frozen >= 0),
  completed_steps      text[] not null default '{}'
);

create table if not exists public.studio_account_deletion_objects (
  request_id  uuid not null references public.studio_account_deletion_requests (request_id),
  object_id   uuid not null,
  deleted_at  timestamptz,
  primary key (request_id, object_id)
);

create table if not exists public.studio_account_refund_reviews (
  request_id       uuid primary key references public.studio_account_deletion_requests (request_id),
  account_id       uuid not null,
  purchased_frozen bigint not null default 0 check (purchased_frozen >= 0),
  icu_frozen       bigint not null default 0 check (icu_frozen >= 0),
  status           text not null default 'open' check (status in ('open', 'resolved')),
  opened_at        timestamptz not null default now(),
  resolved_at      timestamptz,
  note             text
);

-- Service-role only, fail-closed: RLS on, no policies, no client grants.
alter table public.studio_account_deletion_requests enable row level security;
alter table public.studio_account_deletion_objects enable row level security;
alter table public.studio_account_refund_reviews enable row level security;
revoke all on public.studio_account_deletion_requests from anon, authenticated;
revoke all on public.studio_account_deletion_objects from anon, authenticated;
revoke all on public.studio_account_refund_reviews from anon, authenticated;
grant select, insert, update on public.studio_account_deletion_requests to service_role;
grant select, insert, update on public.studio_account_deletion_objects to service_role;
grant select, insert, update on public.studio_account_refund_reviews to service_role;

commit;
