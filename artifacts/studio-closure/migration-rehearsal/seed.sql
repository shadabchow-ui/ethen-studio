-- MUSE-004 migration rehearsal seed (disposable PG17 only; never production).
--
-- Mirrors the non-Studio objects the 19 studio_v5_* migrations require:
-- Supabase default roles, auth.uid() stub, core tenancy tables, the
-- is_project_member() body verbatim from 0036, and column-faithful stubs
-- of the legacy backfill sources (exact names + types from the
-- authoritative DDL noted per table; legacy FKs intentionally omitted —
-- backfills only SELECT these tables).
--
-- Prereq objects and their authoritative sources:
--   roles anon/authenticated/service_role ..... Supabase defaults
--   auth.uid() ................................ Supabase auth schema (stubbed null)
--   public.profiles ........................... 0001_initial_schema.sql (FK to auth.users omitted)
--   public.tenants ............................ 20260902130000_canonical_tenancy_and_actors.sql
--   public.projects (+ tenant_id) ............. 0002_gateway_platform_spine.sql + 20260902130000
--   public.project_members .................... 0002_gateway_platform_spine.sql
--   public.is_project_member(uuid) ............ 0036_eval_project_tenancy_rls.sql (verbatim body)

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table if not exists public.profiles (
  id uuid primary key, email text, display_name text, avatar_url text,
  role text not null default 'user', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default uuid_generate_v4(), type text not null, name text not null,
  slug text, owner_user_id uuid, clerk_org_id text unique, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(), owner_user_id uuid not null,
  tenant_id uuid, name text not null, slug text, description text,
  status text not null default 'private_alpha', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default uuid_generate_v4(), project_id uuid not null, user_id uuid not null,
  role text not null default 'member', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (project_id, user_id)
);

-- Verbatim from 0036_eval_project_tenancy_rls.sql (the production copy stays authoritative).
create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p.owner_user_id = auth.uid()
    or exists (select 1 from public.project_members pm where pm.project_id = p_project_id and pm.user_id = auth.uid())
  from public.projects p where p.id = p_project_id;
$$;
revoke all on function public.is_project_member(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated;

-- Legacy backfill sources (column-faithful stubs; see header note).
-- DDL: 20260914140000_studio_cinema_campaign_canvas_v2.sql
create table if not exists public.studio_workflows (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, name text not null,
  definition jsonb not null default '{"nodes": [], "edges": []}'::jsonb,
  revision integer not null default 1, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_workflow_runs (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, workflow_id uuid not null, workflow_revision integer not null,
  status text not null default 'running', node_states jsonb not null default '{}'::jsonb,
  cost_estimate numeric(14,4) not null default 0, actual_cost numeric(14,4) not null default 0,
  started_at timestamptz not null default now(), finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
create table if not exists public.studio_sequences (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, title text not null,
  status text not null default 'draft', revision integer not null default 1,
  fps integer not null default 30, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_scenes (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, sequence_id uuid not null, order_index integer not null default 0,
  title text not null, status text not null default 'draft', revision integer not null default 1,
  entity_state jsonb not null default '{"entities": []}'::jsonb, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_shots (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, scene_id uuid not null, order_index integer not null default 0,
  title text not null, status text not null default 'draft', revision integer not null default 1,
  entity_state jsonb not null default '{"entities": []}'::jsonb, linked_take_ids jsonb not null default '[]'::jsonb,
  selected_take_id uuid, idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_campaigns (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, title text not null,
  brand_ref text not null default ''::text, product_ref text not null default ''::text,
  brand_deliverable_id uuid, status text not null default 'draft', revision integer not null default 1,
  budget_ceiling numeric(14,4) not null default 0, plan_id uuid, claims jsonb not null default '[]'::jsonb,
  claim_freeze jsonb not null default '{}'::jsonb, export_id uuid, idempotency_key text not null,
  accepted_by text, accepted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- DDL: 20260913170000_studio_video_delivery_v2.sql
create table if not exists public.studio_takes (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, job_id uuid, asset_id uuid, variant_id uuid,
  take_number integer not null, scene_ref text, shot_ref text,
  status text not null default 'accepted', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
-- DDL: 20260913150000_studio_creative_graph_v2.sql
create table if not exists public.studio_briefs (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, revision integer not null default 1,
  title text not null, status text not null default 'draft', payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_deliverables (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, revision integer not null default 1,
  title text not null, status text not null default 'draft', payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- DDL: 0074_voice_realtime_session_events.sql
create table if not exists public.voice_realtime_sessions (
  id uuid primary key default uuid_generate_v4(), organization_id text not null,
  project_id uuid not null, actor_id uuid, status text not null default 'created',
  agent_snapshot jsonb not null, started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(), ended_at timestamptz,
  provider_token_issued boolean not null default false, provider_token_expires_at timestamptz,
  usage_reservation_id text, usage_reserved_usd numeric(12,6) not null default 0,
  usage_settled_usd numeric(12,6) not null default 0, registry_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.voice_realtime_events (
  id uuid primary key default uuid_generate_v4(), session_id uuid not null,
  sequence bigint not null, type text not null, category text not null,
  provider_event_id text, client_timestamp timestamptz not null,
  appended_at timestamptz not null default now(), text text not null default '',
  payload jsonb not null default '{}'::jsonb, content_hash text not null,
  error_code text, terminal boolean not null default false,
  unique (session_id, sequence), unique (session_id, provider_event_id)
);
-- DDL: 20260913190000_studio_director_v2.sql
create table if not exists public.studio_director_plans (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, title text not null, goal text not null default ''::text,
  status text not null default 'draft', mode text not null default 'manual',
  revision integer not null default 1, frozen_envelope jsonb not null default '{}'::jsonb,
  budget_ceiling numeric(14,4) not null default 0, spent_credits numeric(14,4) not null default 0,
  idempotency_key text not null, accepted_by text, accepted_at timestamptz, acceptance_expires_at timestamptz,
  parent_plan_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.studio_director_tasks (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, plan_id uuid not null, task_key text not null, title text not null,
  kind text not null, tool_id text not null, payload jsonb not null default '{}'::jsonb,
  deps jsonb not null default '[]'::jsonb, status text not null default 'pending',
  revision integer not null default 1, budget_cap numeric(14,4) not null default 0,
  attempt_count integer not null default 0, evidence jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- DDL: 20260914150000_studio_review_export_v2.sql
create table if not exists public.studio_review_links (
  id uuid primary key default gen_random_uuid(), organization_id text not null,
  project_id uuid not null, actor_id uuid, scope jsonb not null default '{"assetIds": []}'::jsonb,
  token_hash text not null, note text not null default ''::text,
  consent_snapshot jsonb not null default '[]'::jsonb, idempotency_key text not null,
  expires_at timestamptz not null, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
-- DDL: 0002_gateway_platform_spine.sql
create table if not exists public.gateway_api_keys (
  id uuid primary key default uuid_generate_v4(), project_id uuid not null, name text not null,
  environment text not null default 'live', key_prefix text not null, key_suffix text not null,
  key_hash text not null, scopes text[] not null default '{}'::text[], created_by uuid,
  last_used_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
