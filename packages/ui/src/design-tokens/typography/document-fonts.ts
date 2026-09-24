import localFont from "next/font/local";

/**
 * Document font stack — B1 extraction of the root layout's declarations.
 *
 * D15-J07R font authority: Instrument Sans (UI/body), Newsreader
 * (serif/display), IBM Plex Mono (code/terminal). The `src` entries and
 * weight ranges are the root layout's, moved verbatim — a narrower range
 * would change which weights the browser may synthesise, so nothing here is
 * "tidied". Legacy V2 font variable names survive only as compat aliases to
 * these stacks (see `../../styles/ethen-v2` and `../../styles/eds/eds-global.css`).
 *
 * `./fonts.ts` keeps the pre-existing narrower declarations used by scoped
 * product layouts; this module is the document-level authority. Both bind the
 * same three CSS variables, so there is no second token system.
 */

export const documentSans = localFont({
  variable: "--font-eds-sans",
  display: "swap",
  src: [
    { path: "./fonts/instrument-sans/InstrumentSans-Variable.ttf", weight: "100 900", style: "normal" },
  ],
});

export const documentSerif = localFont({
  variable: "--font-eds-serif",
  display: "swap",
  src: [
    { path: "./fonts/newsreader/Newsreader-Variable.ttf", weight: "100 900", style: "normal" },
    { path: "./fonts/newsreader/Newsreader-Italic-Variable.ttf", weight: "100 900", style: "italic" },
  ],
});

export const documentMono = localFont({
  variable: "--font-eds-mono",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
});

/** The exact class list the root document has always carried. */
export const documentFontClassName = [
  documentSans.variable,
  documentSerif.variable,
  documentMono.variable,
  "h-full antialiased",
].join(" ");
