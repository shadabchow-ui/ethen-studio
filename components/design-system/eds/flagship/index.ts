// Standalone extraction note: the monorepo barrel also re-exports
// FlagshipComposerSurface and FlagshipBlockedRoute, which pull the EDS
// conversation/composer/state trees. Studio imports only EdsScope, so the
// standalone repo vendors EdsScope alone (NOT_REQUIRED siblings trimmed).
export { EdsScope, type EdsScopeProps } from "./EdsScope";
