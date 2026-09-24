import "server-only";

/**
 * STUDIO_14 route-adapter workbench access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed timeline/editorial/render access over the j14 schema.
 * Service-role bypasses RLS, so every call binds explicit project scope.
 * Revisions are append-only: CAS compares the stored head before insert.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { WorkbenchError } from "@ethen/studio-core/server/workbench";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

export interface TimelineHeadRow {
  timelineId: string;
  title: string;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
  headRevision: number;
  lockedBy: string | null;
  updatedAt: string;
}

export async function listTimelineHeads(scope: ResolvedScope): Promise<TimelineHeadRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timelines")
    .select("timeline_id,title,timescale,fps_num,fps_den,head_revision,locked_by,updated_at")
    .eq("project_id", scope.projectId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new WorkbenchError("INTERNAL", `Timeline list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    timelineId: str(row, "timeline_id"),
    title: str(row, "title"),
    timescale: int(row, "timescale"),
    fpsNum: int(row, "fps_num"),
    fpsDen: int(row, "fps_den"),
    headRevision: int(row, "head_revision"),
    lockedBy: nullableStr(row, "locked_by"),
    updatedAt: str(row, "updated_at"),
  }));
}

export interface TimelineRow extends TimelineHeadRow {
  tenantId: string;
  projectId: string;
}

export async function getTimelineHead(scope: ResolvedScope, timelineId: string): Promise<TimelineRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timelines")
    .select("timeline_id,tenant_id,project_id,title,timescale,fps_num,fps_den,head_revision,locked_by,updated_at")
    .eq("project_id", scope.projectId)
    .eq("timeline_id", timelineId)
    .maybeSingle();
  if (error) throw new WorkbenchError("INTERNAL", `Timeline read failed: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return {
    timelineId: str(row, "timeline_id"),
    tenantId: str(row, "tenant_id"),
    projectId: str(row, "project_id"),
    title: str(row, "title"),
    timescale: int(row, "timescale"),
    fpsNum: int(row, "fps_num"),
    fpsDen: int(row, "fps_den"),
    headRevision: int(row, "head_revision"),
    lockedBy: nullableStr(row, "locked_by"),
    updatedAt: str(row, "updated_at"),
  };
}

export async function insertTimeline(input: {
  scope: ResolvedScope;
  title: string;
  timescale: number;
  fpsNum: number;
  fpsDen: number;
}): Promise<TimelineRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timelines")
    .insert({
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      title: input.title,
      timescale: input.timescale,
      fps_num: input.fpsNum,
      fps_den: input.fpsDen,
      head_revision: 0,
    })
    .select("timeline_id,tenant_id,project_id,title,timescale,fps_num,fps_den,head_revision,locked_by,updated_at")
    .single();
  if (error || !data) throw new WorkbenchError("INTERNAL", `Timeline create failed: ${error?.message ?? "unknown"}`);
  const row = data as Row;
  return {
    timelineId: str(row, "timeline_id"),
    tenantId: str(row, "tenant_id"),
    projectId: str(row, "project_id"),
    title: str(row, "title"),
    timescale: int(row, "timescale"),
    fpsNum: int(row, "fps_num"),
    fpsDen: int(row, "fps_den"),
    headRevision: int(row, "head_revision"),
    lockedBy: nullableStr(row, "locked_by"),
    updatedAt: str(row, "updated_at"),
  };
}

export interface RevisionRow {
  revision: number;
  revisionId: string;
  parentRevision: number | null;
  recipe: unknown;
  recipeHash: string;
  createdAt: string;
}

export async function getTimelineRevision(
  scope: ResolvedScope,
  timelineId: string,
  revision: number,
): Promise<RevisionRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timeline_revisions")
    .select("revision,revision_id,parent_revision,recipe,recipe_hash,created_at")
    .eq("timeline_id", timelineId)
    .eq("revision", revision)
    .maybeSingle();
  if (error) throw new WorkbenchError("INTERNAL", `Revision read failed: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const parent = row["parent_revision"];
  void scope;
  return {
    revision: int(row, "revision"),
    revisionId: str(row, "revision_id"),
    parentRevision: typeof parent === "number" ? parent : null,
    recipe: row["recipe"],
    recipeHash: str(row, "recipe_hash"),
    createdAt: str(row, "created_at"),
  };
}

/**
 * CAS revision append: inserts the revision row, then advances the head
 * only when it still equals the expected parent. A lost race reports
 * STALE_REVISION; the orphaned revision row is unreachable by head reads.
 */
export async function appendTimelineRevision(input: {
  scope: ResolvedScope;
  timelineId: string;
  expectedParent: number;
  revision: number;
  recipe: unknown;
  recipeHash: string;
  actorId: string | null;
}): Promise<RevisionRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timeline_revisions")
    .insert({
      timeline_id: input.timelineId,
      revision: input.revision,
      parent_revision: input.expectedParent === 0 ? null : input.expectedParent,
      recipe: input.recipe,
      recipe_hash: input.recipeHash,
      actor_id: input.actorId,
    })
    .select("revision,revision_id,parent_revision,recipe,recipe_hash,created_at")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      throw new WorkbenchError("STALE_REVISION", "Timeline head moved; reload and reapply the edit.", {
        timelineId: input.timelineId,
      });
    }
    throw new WorkbenchError("INTERNAL", `Revision append failed: ${error?.message ?? "unknown"}`);
  }
  const advanced = await client
    .from("studio_v5_timelines")
    .update({ head_revision: input.revision, updated_at: new Date().toISOString() })
    .eq("project_id", input.scope.projectId)
    .eq("timeline_id", input.timelineId)
    .eq("head_revision", input.expectedParent);
  if (advanced.error) throw new WorkbenchError("INTERNAL", `Head advance failed: ${advanced.error.message}`);
  if ((advanced.count ?? 0) === 0) {
    throw new WorkbenchError("STALE_REVISION", "Timeline head moved; reload and reapply the edit.", {
      timelineId: input.timelineId,
    });
  }
  const row = data as Row;
  const parent = row["parent_revision"];
  return {
    revision: int(row, "revision"),
    revisionId: str(row, "revision_id"),
    parentRevision: typeof parent === "number" ? parent : null,
    recipe: row["recipe"],
    recipeHash: str(row, "recipe_hash"),
    createdAt: str(row, "created_at"),
  };
}

export interface RenderRow {
  renderId: string;
  timelineId: string;
  revision: number;
  revisionHash: string;
  spec: unknown;
  idempotencyKey: string;
  requestHash: string;
  status: string;
  createdAt: string;
}

function toRenderRow(row: Row): RenderRow {
  return {
    renderId: str(row, "render_id"),
    timelineId: str(row, "timeline_id"),
    revision: int(row, "revision"),
    revisionHash: str(row, "revision_hash"),
    spec: row["spec"],
    idempotencyKey: str(row, "idempotency_key"),
    requestHash: str(row, "request_hash"),
    status: str(row, "status"),
    createdAt: str(row, "created_at"),
  };
}

export async function findRenderByKey(scope: ResolvedScope, idempotencyKey: string): Promise<RenderRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timeline_renders")
    .select("render_id,timeline_id,revision,revision_hash,spec,idempotency_key,request_hash,status,created_at")
    .eq("project_id", scope.projectId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new WorkbenchError("INTERNAL", `Render read failed: ${error.message}`);
  return data ? toRenderRow(data as Row) : null;
}

export async function insertRender(input: {
  scope: ResolvedScope;
  timelineId: string;
  revision: number;
  revisionHash: string;
  spec: unknown;
  idempotencyKey: string;
  requestHash: string;
}): Promise<RenderRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_timeline_renders")
    .insert({
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      timeline_id: input.timelineId,
      revision: input.revision,
      revision_hash: input.revisionHash,
      spec: input.spec,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      status: "QUEUED",
    })
    .select("render_id,timeline_id,revision,revision_hash,spec,idempotency_key,request_hash,status,created_at")
    .single();
  if (error || !data) throw new WorkbenchError("INTERNAL", `Render submit failed: ${error?.message ?? "unknown"}`);
  return toRenderRow(data as Row);
}

export interface EditorialSequenceRow {
  sequenceId: string;
  title: string;
  status: string;
  fpsNum: number;
  fpsDen: number;
  revision: number;
}

export async function listEditorialSequences(scope: ResolvedScope): Promise<EditorialSequenceRow[]> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_editorial_sequences")
    .select("sequence_id,title,status,fps_num,fps_den,revision")
    .eq("project_id", scope.projectId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new WorkbenchError("INTERNAL", `Sequence list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    sequenceId: str(row, "sequence_id"),
    title: str(row, "title"),
    status: str(row, "status"),
    fpsNum: int(row, "fps_num"),
    fpsDen: int(row, "fps_den"),
    revision: int(row, "revision"),
  }));
}

export async function insertEditorialSequence(input: {
  scope: ResolvedScope;
  title: string;
  fpsNum: number;
  fpsDen: number;
}): Promise<EditorialSequenceRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_editorial_sequences")
    .insert({
      tenant_id: input.scope.tenantId,
      project_id: input.scope.projectId,
      title: input.title,
      status: "draft",
      fps_num: input.fpsNum,
      fps_den: input.fpsDen,
    })
    .select("sequence_id,title,status,fps_num,fps_den,revision")
    .single();
  if (error || !data) throw new WorkbenchError("INTERNAL", `Sequence create failed: ${error?.message ?? "unknown"}`);
  const row = data as Row;
  return {
    sequenceId: str(row, "sequence_id"),
    title: str(row, "title"),
    status: str(row, "status"),
    fpsNum: int(row, "fps_num"),
    fpsDen: int(row, "fps_den"),
    revision: int(row, "revision"),
  };
}

export interface EditorialSceneRow {
  sceneId: string;
  sequenceId: string;
  orderIndex: number;
  title: string;
  status: string;
}

export interface EditorialShotRow {
  shotId: string;
  sceneId: string;
  orderIndex: number;
  title: string;
  status: string;
  selectedTakeId: string | null;
  selectedTakeJobId: string | null;
}

export async function getEditorialSequenceDetail(
  scope: ResolvedScope,
  sequenceId: string,
): Promise<{ sequence: EditorialSequenceRow; scenes: EditorialSceneRow[]; shots: EditorialShotRow[] } | null> {
  const client = requireServiceClient();
  const { data: sequence, error } = await client
    .from("studio_v5_editorial_sequences")
    .select("sequence_id,title,status,fps_num,fps_den,revision")
    .eq("project_id", scope.projectId)
    .eq("sequence_id", sequenceId)
    .maybeSingle();
  if (error) throw new WorkbenchError("INTERNAL", `Sequence read failed: ${error.message}`);
  if (!sequence) return null;
  const sequenceRow = sequence as Row;
  const { data: scenes, error: scenesError } = await client
    .from("studio_v5_editorial_scenes")
    .select("scene_id,sequence_id,order_index,title,status")
    .eq("sequence_id", sequenceId)
    .order("order_index", { ascending: true });
  if (scenesError) throw new WorkbenchError("INTERNAL", `Scene list failed: ${scenesError.message}`);
  const sceneRows = ((scenes ?? []) as Row[]).map((row) => ({
    sceneId: str(row, "scene_id"),
    sequenceId: str(row, "sequence_id"),
    orderIndex: int(row, "order_index"),
    title: str(row, "title"),
    status: str(row, "status"),
  }));
  const sceneIds = sceneRows.map((s) => s.sceneId);
  let shotRows: EditorialShotRow[] = [];
  if (sceneIds.length > 0) {
    const { data: shots, error: shotsError } = await client
      .from("studio_v5_editorial_shots")
      .select("shot_id,scene_id,order_index,title,status,selected_take_id,selected_take_job_id")
      .in("scene_id", sceneIds)
      .order("order_index", { ascending: true });
    if (shotsError) throw new WorkbenchError("INTERNAL", `Shot list failed: ${shotsError.message}`);
    shotRows = ((shots ?? []) as Row[]).map((row) => ({
      shotId: str(row, "shot_id"),
      sceneId: str(row, "scene_id"),
      orderIndex: int(row, "order_index"),
      title: str(row, "title"),
      status: str(row, "status"),
      selectedTakeId: nullableStr(row, "selected_take_id"),
      selectedTakeJobId: nullableStr(row, "selected_take_job_id"),
    }));
  }
  return {
    sequence: {
      sequenceId: str(sequenceRow, "sequence_id"),
      title: str(sequenceRow, "title"),
      status: str(sequenceRow, "status"),
      fpsNum: int(sequenceRow, "fps_num"),
      fpsDen: int(sequenceRow, "fps_den"),
      revision: int(sequenceRow, "revision"),
    },
    scenes: sceneRows,
    shots: shotRows,
  };
}
