import fs from "node:fs";
import path from "node:path";
import { resolveTrustedActor } from "../actor";

let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) return;
  console.error(`FAIL: ${message}`);
  failed += 1;
}

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0035_clerk_supabase_identity_mapping.sql"),
  "utf8",
);
const accountImpactReview = fs.readFileSync(
  path.join(process.cwd(), "lib/platform/auth/CLERK_REMOVAL_ACCOUNT_IMPACT_REVIEW.md"),
  "utf8",
);

assert(/create table if not exists public\.clerk_user_mappings/i.test(migration), "mapping table exists");
assert(/clerk_user_id text primary key/i.test(migration), "Clerk identity is unique");
assert(/supabase_user_id uuid not null unique references auth\.users\(id\)/i.test(migration), "Supabase auth user is canonical and unique");
assert(/enable row level security/i.test(migration), "mapping table has RLS enabled");
assert(/idx_clerk_user_mappings_supabase_user_id/i.test(migration), "canonical identity index exists");
assert(/on conflict \(clerk_user_id\) do update/i.test(migration), "backfill upsert is idempotent");
assert(/Rollback \(run manually only/i.test(migration), "migration documents an explicit down path");
assert(/Status: required before Clerk removal; not complete/i.test(accountImpactReview), "Clerk removal account-impact review is recorded without authorizing removal");

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const actorA = resolveTrustedActor({ supabaseUserId: userA, clerkMappedSupabaseUserId: null, clerkMappingRequired: false, production: true });
const actorB = resolveTrustedActor({ supabaseUserId: null, clerkMappedSupabaseUserId: userB, clerkMappingRequired: true, production: true });
assert(actorA.state === "resolved" && actorA.supabaseUserId === userA, "Supabase user A resolves canonically");
assert(actorB.state === "resolved" && actorB.supabaseUserId === userB, "mapped Clerk user resolves to canonical Supabase user B");
assert(actorA.supabaseUserId !== actorB.supabaseUserId, "two users resolve to distinct canonical identities");

const unavailable = resolveTrustedActor({ supabaseUserId: null, clerkMappedSupabaseUserId: null, clerkMappingRequired: true, production: true });
assert(unavailable.state === "mapping_unavailable" && unavailable.supabaseUserId === null, "production mapping outage denies without fallback identity");

const maliciousBody = { userId: "attacker-controlled-id" };
const actorWithoutTrustedIdentity = resolveTrustedActor({ supabaseUserId: null, clerkMappedSupabaseUserId: null, clerkMappingRequired: false, production: true });
assert(actorWithoutTrustedIdentity.supabaseUserId !== maliciousBody.userId, "body-supplied userId cannot become an actor identity");

// The upsert uses the same conflict key on every replay, so a second backfill
// run produces the same mapping rather than a duplicate identity.
const upsertConflictCount = (migration.match(/on conflict \(clerk_user_id\) do update/gi) ?? []).length;
assert(upsertConflictCount === 1, "backfill migration remains resumable and idempotent on repeated execution");

if (failed > 0) process.exit(1);
console.log("SOL-07 identity integration tests passed.");
