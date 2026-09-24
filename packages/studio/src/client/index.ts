/**
 * Studio V5 browser-safe client entry.
 * Re-exports contracts only. MUST NEVER import ../server (ports, secrets,
 * repositories). Server code imports @ethen/studio-core (root) or
 * @ethen/studio-core/server/ports instead.
 */
export * from "../contracts/index";
