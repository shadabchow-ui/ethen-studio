/**
 * STUDIO_08 — discovery barrel. Home, Models browse, Apps and
 * Templates libraries plus the catalog client consumed by later jobs.
 */
export * from "./catalog-client";
export { useCatalogProjection } from "./useCatalogProjection";
export { StudioHome } from "./StudioHome";
export { StudioHomePrompt, homePromptHref, isHomePromptToolId } from "./StudioHomePrompt";
export { HomeMediaFigure, homeSectionTiles } from "./StudioHomeMedia";
export { StudioModelsBrowse } from "./ModelsBrowse";
export { StudioAppsLibrary } from "./AppsLibrary";
export { StudioTemplatesLibrary } from "./TemplatesLibrary";
