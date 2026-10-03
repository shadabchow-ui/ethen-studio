-- OPUS-FINAL-002 forward repair (Studio namespace): two tables created by the
-- Studio lineage ship with ROW LEVEL SECURITY OFF. On Supabase, new public tables
-- receive default grants (ALL) to anon/authenticated/service_role, so without RLS
-- the public API key could read and write them.
--
--   studio_creative_entities       (20260920040000, legacy V2 lineage)
--   studio_v5_worker_heartbeats    (20260921220000 j05 runtime, internal worker table)
--
-- Forward-only, guarded, no data change, no grant is widened:
--   * worker heartbeats: internal to the service role -> RLS on, no anon/authenticated
--     privileges and no policies (service_role bypasses RLS).
--   * creative entities: RLS on with the project-member policy set used by every
--     sibling Studio table; anon loses all privileges.
-- Apply AFTER the Studio lineage (S0) and S1 files. Safe to re-run.

begin;

do $$
begin
  if to_regclass('public.studio_v5_worker_heartbeats') is not null then
    alter table public.studio_v5_worker_heartbeats enable row level security;
    revoke all on public.studio_v5_worker_heartbeats from anon, authenticated;
  end if;

  if to_regclass('public.studio_creative_entities') is not null then
    alter table public.studio_creative_entities enable row level security;
    revoke all on public.studio_creative_entities from anon;

    drop policy if exists studio_creative_entities_project_select on public.studio_creative_entities;
    create policy studio_creative_entities_project_select on public.studio_creative_entities
      for select using (public.is_project_member(project_id));
    drop policy if exists studio_creative_entities_project_insert on public.studio_creative_entities;
    create policy studio_creative_entities_project_insert on public.studio_creative_entities
      for insert with check (public.is_project_member(project_id));
    drop policy if exists studio_creative_entities_project_update on public.studio_creative_entities;
    create policy studio_creative_entities_project_update on public.studio_creative_entities
      for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
    drop policy if exists studio_creative_entities_project_delete on public.studio_creative_entities;
    create policy studio_creative_entities_project_delete on public.studio_creative_entities
      for delete using (public.is_project_member(project_id));
  end if;
end $$;

commit;
