import localFont from "next/font/local";

export const instrumentSans = localFont({
  variable: "--font-eds-sans",
  display: "swap",
  src: [
    {
      path: "./fonts/instrument-sans/InstrumentSans-Variable.ttf",
      style: "normal",
      weight: "400 700",
    },
  ],
});

export const newsreader = localFont({
  variable: "--font-eds-serif",
  display: "swap",
  src: [
    {
      path: "./fonts/newsreader/Newsreader-Variable.ttf",
      style: "normal",
      weight: "200 800",
    },
    {
      path: "./fonts/newsreader/Newsreader-Italic-Variable.ttf",
      style: "italic",
      weight: "200 800",
    },
  ],
});

export const ibmPlexMono = localFont({
  variable: "--font-eds-mono",
  display: "swap",
  src: [
    {
      path: "./fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf",
      style: "normal",
      weight: "400",
    },
    {
      path: "./fonts/ibm-plex-mono/IBMPlexMono-Medium.ttf",
      style: "normal",
      weight: "500",
    },
    {
      path: "./fonts/ibm-plex-mono/IBMPlexMono-SemiBold.ttf",
      style: "normal",
      weight: "600",
    },
  ],
});

export const edsFontVariables = `${instrumentSans.variable} ${newsreader.variable} ${ibmPlexMono.variable}`;
