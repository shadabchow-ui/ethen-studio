/**
 * Class for the shared StudioShell when it wraps a generator route in
 * passthrough mode. The generator shell (GeneratorLayout) owns its own frame,
 * so the workbench's card chrome (border, radius, 560px floor) and its
 * overflow clip — which would box the shell in and break the sticky
 * composer — are neutralised. Plain module (no "use client") so server
 * pages receive the string itself, not a client reference.
 */
export const GENERATOR_SURFACE_CLASS = "min-h-0! overflow-visible! rounded-none! border-0! bg-transparent!";
