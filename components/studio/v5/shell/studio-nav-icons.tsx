/**
 * Studio sidebar glyphs (V5 M1). 16px line icons on currentColor so they
 * inherit the Studio text tiers; decorative only (labels carry meaning).
 */

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  image: "M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4M8.5 8.5h.01",
  video: "M3 6h13v12H3zM16 10l5-3v10l-5-3",
  voice: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  sfx: "M3 12h3l3-7 4 14 3-7h5",
  transcribe: "M4 6h16M4 12h10M4 18h13",
  dubbing: "M4 5h9v7H7l-3 3zM11 14h6l3 3v-8h-4",
  changer: "M4 8h13l-3-3M20 16H7l3 3",
  cube: "M12 2.5 21 7v10l-9 4.5L3 17V7zM12 12l9-5M12 12 3 7M12 12v9.5",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  apps: "M4 4h7v7H4zM13 13h7v7h-7zM16.5 3.5v7M13 7h7M4 13h7v7H4z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  model: "M12 3 3 7.5 12 12l9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  template: "M4 4h16v5H4zM4 13h7v7H4zM15 13h5v7h-5z",
  identity: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  product: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  brand: "M4 20V5a1 1 0 0 1 1-1h9l-2 4 2 4H5",
  project: "M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  files: "M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  review: "M4 5h16v11H9l-5 4zM8 10l2.5 2.5L16 8",
  audio: "M3 10v4M7 7v10M11 4v16M15 8v8M19 11v2",
  cinema: "M3 5h18v14H3zM3 9h18M7 5v4M12 5v4M17 5v4",
  marketing: "M4 10v4l12 5V5zM16 9a3 3 0 0 1 0 6M7 14l1 5",
  influencer: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z",
  realtime: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM19 10a7 7 0 0 1-3 5.7M5 10a7 7 0 0 0 3 5.7M12 17v4",
  plus: "M12 5v14M5 12h14",
  usage: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chevron: "M9 6l6 6-6 6",
  collapse: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  remix: "M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4",
  open: "M7 17 17 7M9 7h8v8",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  play: "M8 5v14l11-7z",
};

export function StudioNavIcon({ name, size = 16 }: { name: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.grid!;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
